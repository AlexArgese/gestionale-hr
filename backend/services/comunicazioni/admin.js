/**
 * backend/services/comunicazioni/admin.js
 * Handler delle rotte admin di /backend/routes/comunicazioni.js:
 * elenco, creazione (con allegati multipli + notifiche), modifica testo,
 * eliminazione, breakdown destinatari/letture/like/commenti.
 */
const path = require('path');
const fs = require('fs');
const pool = require('../../db');
const { caricaBufferSuS3, eliminaDaS3 } = require('../../lib/s3');
const { parseBool } = require('./helpers');
const { resolveRecipients } = require('./db');
const { creaChiaveComunicazioneS3 } = require('./attachments');
const { fireAndForgetCommunicationNotifications, sendCommunicationEmail } = require('./notifications');
const { UPLOAD_DIR } = require('./upload');

// GET tutte (filtri opzionali)
async function listHandler(req, res) {
  const { societa_id, utente_id } = req.query;
  try {
    let query = `SELECT * FROM comunicazioni WHERE 1=1`;
    const params = [];
    if (societa_id) {
      query += ` AND societa_id = $${params.length + 1}`;
      params.push(societa_id);
    }
    if (utente_id) {
      query += ` AND (destinatari IS NULL OR $${params.length + 1} = ANY(destinatari))`;
      params.push(utente_id);
    }
    query += ` ORDER BY data_pubblicazione DESC NULLS LAST, id DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /comunicazioni', err);
    res.status(500).json({ error: 'Errore nel recupero comunicazioni' });
  }
}

/* POST nuova comunicazione (MULTI allegati su comunicazione_attachments) */
async function createHandler(req, res) {
  const {
    titolo,
    contenuto,
    societa_id,
    creato_da,
    destinatari,
    utente_ids,
    invia_a_tutti,
    sede_id,
    send_email
  } = req.body;

  const files = Array.isArray(req.files) ? req.files : [];

  const shouldSendEmail = parseBool(send_email);
  const sendToAll = parseBool(invia_a_tutti);

  const societaIdNum = societa_id ? Number(societa_id) : null;
  const sedeIdVal = sede_id ? (isNaN(Number(sede_id)) ? sede_id : Number(sede_id)) : null;

  let destinatariJson = null;

  // 1) se arriva destinatari esplicito (JSON) lo rispettiamo
  if (destinatari) {
    try { destinatariJson = JSON.parse(destinatari); }
    catch { return res.status(400).json({ error: 'destinatari non è un JSON valido' }); }
  }

  // ✅ selezione manuale (array di ID) — priorità alta
  let manualIds = null;
  if (utente_ids) {
    try { manualIds = JSON.parse(utente_ids); }
    catch { return res.status(400).json({ error: 'utente_ids non è un JSON valido' }); }

    if (!Array.isArray(manualIds)) {
      return res.status(400).json({ error: 'utente_ids deve essere un array' });
    }

    manualIds = [...new Set(
      manualIds
        .map(n => Number(n))
        .filter(n => Number.isInteger(n) && n > 0)
    )];

    if (manualIds.length === 0) {
      return res.status(400).json({ error: 'utente_ids vuoto o non valido' });
    }
  }

  const client = await pool.connect();
  let comm = null;
  let recipientIds = [];
  let recipientEmails = [];
  const uploadedKeys = [];

  try {
    await client.query('BEGIN');

    // ✅ PRIORITÀ: se l’admin seleziona utenti manualmente, usiamo quelli
    if (!sendToAll && Array.isArray(manualIds) && manualIds.length) {
      const q = await client.query(
        `SELECT id, email
        FROM utenti
        WHERE id = ANY($1::int[]) AND stato_attivo=TRUE`,
        [manualIds]
      );

      const idsOk = q.rows.map(r => r.id);
      if (idsOk.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Nessun utente valido tra utente_ids' });
      }

      destinatariJson = idsOk; // ✅ app: arriva solo a loro
      recipientIds = idsOk;
      if (shouldSendEmail) recipientEmails = q.rows.map(r => r.email).filter(Boolean);
    }

    if (!sendToAll && (!Array.isArray(manualIds) || !manualIds.length) && Array.isArray(destinatariJson) && destinatariJson.length) {
      const r = await resolveRecipients({
        destinatariIds: destinatariJson,
        societaId: null,
        sedeId: null,
        client
      });

      if (r.ids.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Nessun destinatario valido' });
      }

      destinatariJson = r.ids;
      recipientIds = r.ids;
      if (shouldSendEmail) recipientEmails = r.emails;
    }

    // 2) se NON invio a tutti e NON ho destinatari espliciti,
    //    allora genero destinatari dalla combinazione societaId + sedeId
    if (!sendToAll && (!Array.isArray(destinatariJson) || destinatariJson.length === 0)) {
      const r = await resolveRecipients({
        destinatariIds: null,
        societaId: societaIdNum,
        sedeId: sedeIdVal,
        client
      });
      destinatariJson = r.ids; // <-- fondamentale per far arrivare in APP solo a loro
      recipientIds = r.ids;
      if (shouldSendEmail) recipientEmails = r.emails;
    }

    // 3) se invio a tutti: destinatari NULL (come prima)
    if (sendToAll) {
      destinatariJson = null;
    }

    const commRes = await client.query(
      `INSERT INTO comunicazioni (titolo, contenuto, societa_id, creato_da, destinatari)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        titolo,
        contenuto,
        societaIdNum,
        creato_da ? Number(creato_da) : null,
        destinatariJson
      ]
    );

    comm = commRes.rows[0];

    for (const f of files) {
      const tempPath = f.path || path.join(UPLOAD_DIR, f.filename);
      const chiaveS3 = creaChiaveComunicazioneS3({
        comunicazioneId: comm.id,
        nomeFile: f.originalname || f.filename,
      });

      try {
        const buffer = fs.readFileSync(tempPath);
        await caricaBufferSuS3({
          chiave: chiaveS3,
          buffer,
          contentType: f.mimetype || 'application/octet-stream',
        });
        uploadedKeys.push(chiaveS3);

        await client.query(
          `INSERT INTO comunicazione_attachments (comunicazione_id, file_url, mime_type, width, height)
           VALUES ($1, $2, $3, NULL, NULL)`,
          [comm.id, chiaveS3, f.mimetype || null]
        );
      } finally {
        try {
          if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (unlinkErr) {
          console.warn('Cleanup file temporaneo comunicazione fallito:', unlinkErr?.message || unlinkErr);
        }
      }
    }

    // 4) se invio a tutti, risolvo i destinatari reali per push/email
    if (sendToAll) {
      const r = await resolveRecipients({
        destinatariIds: null,
        societaId: societaIdNum,
        sedeId: sedeIdVal,
        client
      });
      recipientIds = r.ids;
      if (shouldSendEmail) recipientEmails = r.emails;
    }

    await client.query('COMMIT');

    if (recipientIds.length) {
      fireAndForgetCommunicationNotifications({
        utenteIds: recipientIds,
        comunicazioneId: comm.id,
        titolo,
      });
    }

    // invio mail DOPO commit
    if (shouldSendEmail) {
      if (!recipientEmails.length) {
        console.warn('send_email=1 ma nessuna email destinatario trovata (comunicazione id=%s)', comm?.id);
      } else {
        try {
          await sendCommunicationEmail({ emails: recipientEmails, titolo, contenuto });
          console.log('Email comunicazione id=%s inviata a %d destinatari', comm?.id, recipientEmails.length);
        } catch (mailErr) {
          console.error('Email comunicazione id=%s fallita (%d destinatari):', comm?.id, recipientEmails.length, mailErr.message);
        }
      }
    }

    res.json(comm);
  } catch (err) {
    await client.query('ROLLBACK');
    if (uploadedKeys.length) {
      await Promise.allSettled(uploadedKeys.map((chiave) => eliminaDaS3({ chiave })));
    }
    console.error('POST /comunicazioni', err.stack || err);
    res.status(500).json({ error: 'Errore inserimento comunicazione' });
  } finally {
    client.release();
  }
}

/* =========================================================
   MODIFICA TESTO (titolo/contenuto) DI UNA COMUNICAZIONE GIA' INVIATA
   Non invia email né ripete le notifiche push: aggiorna solo
   il testo che gli utenti vedono in app.
   PUT /comunicazioni/:id
   ========================================================= */
async function updateHandler(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID non valido' });
    }

    const titolo = (req.body?.titolo ?? '').trim();
    const contenuto = (req.body?.contenuto ?? '').trim();
    if (!titolo || !contenuto) {
      return res.status(400).json({ error: 'Titolo e contenuto sono obbligatori' });
    }

    const notify = ['both', 'push', 'none'].includes(req.body?.notify) ? req.body.notify : 'none';

    const upd = await pool.query(
      `UPDATE comunicazioni
       SET titolo = $1, contenuto = $2
       WHERE id = $3
       RETURNING *`,
      [titolo, contenuto, id]
    );

    if (!upd.rows.length) return res.status(404).json({ error: 'Comunicazione non trovata' });
    const comm = upd.rows[0];

    if (notify !== 'none') {
      const recipients = await resolveRecipients({
        destinatariIds: Array.isArray(comm.destinatari) ? comm.destinatari : null,
        societaId: comm.societa_id || null,
        sedeId: null,
        client: pool,
      });

      if (recipients.ids.length) {
        fireAndForgetCommunicationNotifications({
          utenteIds: recipients.ids,
          comunicazioneId: comm.id,
          titolo,
          updated: true,
        });
      }

      if (notify === 'both') {
        if (!recipients.emails.length) {
          console.warn('notify=both ma nessuna email destinatario trovata (comunicazione id=%s)', comm.id);
        } else {
          try {
            await sendCommunicationEmail({ emails: recipients.emails, titolo, contenuto, updated: true });
          } catch (mailErr) {
            console.error('Email aggiornamento comunicazione id=%s fallita:', comm.id, mailErr.message);
          }
        }
      }
    }

    res.json(comm);
  } catch (err) {
    console.error('PUT /comunicazioni/:id', err);
    res.status(500).json({ error: 'Errore modifica comunicazione' });
  }
}

// DELETE comunicazione
async function deleteHandler(req, res) {
  try {
    await pool.query('DELETE FROM letture_comunicazioni WHERE comunicazione_id = $1', [req.params.id]);
    await pool.query('DELETE FROM comunicazioni WHERE id = $1', [req.params.id]);
    res.json({ message: 'Comunicazione eliminata' });
  } catch (err) {
    console.error('DELETE /comunicazioni/:id', err);
    res.status(500).json({ error: 'Errore durante l\'eliminazione' });
  }
}

/* =========================================================
   ADMIN BREAKDOWN (SOLO requireAuth, nessun check ruolo)
   GET /comunicazioni/:id/admin
   ========================================================= */
async function adminBreakdownHandler(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID non valido' });

    // Comunicazione base
    const commRes = await pool.query('SELECT * FROM comunicazioni WHERE id=$1', [id]);
    if (!commRes.rows.length) return res.status(404).json({ error: 'Comunicazione non trovata' });
    const comm = commRes.rows[0];
    const attRes = await pool.query(
      `SELECT id, file_url, mime_type
      FROM comunicazione_attachments
      WHERE comunicazione_id = $1
      ORDER BY id ASC`,
      [id]
    );
    const attachments = attRes.rows;

    // Destinatari
    const destinatari = Array.isArray(comm.destinatari) ? comm.destinatari : [];
    let destinatariRows = [];
    if (destinatari.length) {
      const q = await pool.query(
        'SELECT id, nome, cognome, email, ruolo, societa_id FROM utenti WHERE id = ANY($1)',
        [destinatari]
      );
      destinatariRows = q.rows;
    } else if (comm.societa_id) {
      const q = await pool.query(
        'SELECT id, nome, cognome, email, ruolo, societa_id FROM utenti WHERE societa_id=$1 AND stato_attivo=TRUE',
        [comm.societa_id]
      );
      destinatariRows = q.rows;
    } else {
      const q = await pool.query(
        'SELECT id, nome, cognome, email, ruolo, societa_id FROM utenti WHERE stato_attivo=TRUE'
      );
      destinatariRows = q.rows;
    }

    // Letture
    const letture = await pool.query(
      `SELECT lc.utente_id, lc.data_lettura, u.nome, u.cognome, u.email
       FROM letture_comunicazioni lc
       JOIN utenti u ON u.id = lc.utente_id
       WHERE lc.comunicazione_id=$1
       ORDER BY lc.data_lettura DESC`,
      [id]
    );
    const letti = letture.rows;
    const lettiIds = new Set(letti.map(r => r.utente_id));
    const nonLetti = destinatariRows.filter(u => !lettiIds.has(u.id));

    // Likes
    const likes = await pool.query(
      `SELECT cl.utente_id, cl.created_at, u.nome, u.cognome, u.email
       FROM comunicazioni_likes cl
       JOIN utenti u ON u.id = cl.utente_id
       WHERE cl.comunicazione_id=$1
       ORDER BY cl.created_at DESC`,
      [id]
    );

    // Commenti (per il tab "Commenti" se ti serve qui)
    const comments = await pool.query(
      `SELECT cc.id, cc.contenuto, cc.created_at, u.id as utente_id, u.nome, u.cognome, u.email
       FROM comunicazioni_comments cc
       JOIN utenti u ON u.id = cc.utente_id
       WHERE cc.comunicazione_id=$1
       ORDER BY cc.created_at ASC`,
      [id]
    );

    res.json({
      comunicazione: comm,
      attachments,
      destinatari: destinatariRows,
      letti,
      non_letti: nonLetti,
      likes: likes.rows,
      comments: comments.rows,
    });
  } catch (e) {
    console.error('GET /comunicazioni/:id/admin', e);
    res.status(500).json({ error: 'Errore dettaglio admin' });
  }
}

module.exports = {
  listHandler,
  createHandler,
  updateHandler,
  deleteHandler,
  adminBreakdownHandler,
};
