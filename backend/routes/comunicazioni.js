// backend/routes/comunicazioni.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

/* ------------------------------------------
   Multer: upload allegato SINGOLO (legacy)
   Salva sotto /uploads
------------------------------------------- */
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, filename);
  },
});
const upload = multer({ storage });

/* ------------------------------------------
   Helpers
------------------------------------------- */
async function requireUserId(req) {
  const q = await pool.query('SELECT id FROM utenti WHERE email = $1 LIMIT 1', [req.user.email]);
  if (!q.rows.length) throw Object.assign(new Error('Utente non trovato'), { status: 404 });
  return q.rows[0].id;
}
async function getOptionalUserId(req) {
  try {
    const q = await pool.query('SELECT id FROM utenti WHERE email = $1 LIMIT 1', [req.user.email]);
    return q.rows[0]?.id ?? null;
  } catch { return null; }
}

/* =========================================================
   FEED PERSONALIZZATO (AUTENTICATO)
   GET /comunicazioni/feed
   ========================================================= */
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const u = await pool.query(
      'SELECT id, societa_id FROM utenti WHERE email = $1',
      [req.user.email]
    );
    if (!u.rows.length) return res.status(404).json({ error: 'Utente non trovato' });

    const utenteId = u.rows[0].id;
    const societaId = u.rows[0].societa_id || null;

    const q = `
      SELECT
        c.*,
        EXISTS (
          SELECT 1 FROM comunicazioni_likes cl
          WHERE cl.comunicazione_id = c.id AND cl.utente_id = $1
        ) AS liked,
        COALESCE((
          SELECT COUNT(*)::int FROM comunicazioni_likes cl2
          WHERE cl2.comunicazione_id = c.id
        ), 0) AS likes_count,
        COALESCE((
          SELECT COUNT(*)::int FROM comunicazioni_comments cc
          WHERE cc.comunicazione_id = c.id
        ), 0) AS comments_count,
        (lc.utente_id IS NOT NULL) AS letto
      FROM comunicazioni c
      LEFT JOIN letture_comunicazioni lc
        ON lc.comunicazione_id = c.id AND lc.utente_id = $1
      WHERE
        (c.societa_id IS NULL OR c.societa_id = $2)
        AND (c.destinatari IS NULL OR $1 = ANY(c.destinatari))
      ORDER BY c.data_pubblicazione DESC NULLS LAST, c.id DESC
    `;
    const { rows } = await pool.query(q, [utenteId, societaId]);
    res.json(rows);
  } catch (err) {
    console.error('GET /comunicazioni/feed', err);
    res.status(500).json({ error: 'Errore nel recupero comunicazioni' });
  }
});

/* =========================================================
   SEGNARE COME LETTA (AUTENTICATO)
   POST /comunicazioni/:id/lettura
   ========================================================= */
router.post('/:id/lettura', requireAuth, async (req, res) => {
  try {
    const utenteId = await requireUserId(req);
    await pool.query(
      `INSERT INTO letture_comunicazioni (comunicazione_id, utente_id, data_lettura)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (comunicazione_id, utente_id) DO NOTHING`,
      [req.params.id, utenteId]
    );
    res.status(204).end();
  } catch (e) {
    const code = e.status || 500;
    if (code === 404) return res.status(404).json({ error: e.message });
    console.error('POST /comunicazioni/:id/lettura', e);
    res.status(500).json({ error: 'Errore nel segnare la lettura' });
  }
});

/* =========================================================
   DETTAGLIO (AUTENTICATO, TOLLERANTE PER ADMIN)
   GET /comunicazioni/:id
   ========================================================= */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const utenteId = await getOptionalUserId(req);

    const cRes = await pool.query('SELECT * FROM comunicazioni WHERE id = $1', [req.params.id]);
    if (!cRes.rows.length) return res.status(404).json({ error: 'Comunicazione non trovata' });
    const c = cRes.rows[0];

    const likedRes = utenteId
      ? await pool.query(
          `SELECT EXISTS(
             SELECT 1 FROM comunicazioni_likes WHERE comunicazione_id=$1 AND utente_id=$2
           ) AS liked`,
          [req.params.id, utenteId]
        )
      : { rows: [{ liked: false }] };

    const likesCountRes = await pool.query(
      `SELECT COUNT(*)::int AS likes_count FROM comunicazioni_likes WHERE comunicazione_id=$1`,
      [req.params.id]
    );
    const commentsCountRes = await pool.query(
      `SELECT COUNT(*)::int AS comments_count FROM comunicazioni_comments WHERE comunicazione_id=$1`,
      [req.params.id]
    );

    res.json({
      ...c,
      liked: likedRes.rows[0].liked,
      likes_count: likesCountRes.rows[0].likes_count,
      comments_count: commentsCountRes.rows[0].comments_count,
    });
  } catch (e) {
    console.error('GET /comunicazioni/:id', e);
    res.status(500).json({ error: 'Errore nel recupero comunicazione' });
  }
});

/* =========================================================
   LIKE / UNLIKE (AUTENTICATO)
   POST /comunicazioni/:id/like
   ========================================================= */
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const utenteId = await requireUserId(req);
    const id = Number(req.params.id);
    const action = (req.body?.action || '').toLowerCase();

    if (action === 'like') {
      await pool.query(
        `INSERT INTO comunicazioni_likes (comunicazione_id, utente_id)
         VALUES ($1, $2)
         ON CONFLICT (comunicazione_id, utente_id) DO NOTHING`,
        [id, utenteId]
      );
    } else if (action === 'unlike') {
      await pool.query(
        `DELETE FROM comunicazioni_likes WHERE comunicazione_id=$1 AND utente_id=$2`,
        [id, utenteId]
      );
    } else {
      return res.status(400).json({ error: 'Azione non valida' });
    }

    const likedRes = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM comunicazioni_likes WHERE comunicazione_id=$1 AND utente_id=$2
       ) AS liked`,
      [id, utenteId]
    );
    const likesCountRes = await pool.query(
      `SELECT COUNT(*)::int AS likes_count FROM comunicazioni_likes WHERE comunicazione_id=$1`,
      [id]
    );
    res.json({
      liked: likedRes.rows[0].liked,
      likes_count: likesCountRes.rows[0].likes_count,
    });
  } catch (e) {
    const code = e.status || 500;
    if (code === 404) return res.status(404).json({ error: e.message });
    console.error('POST /comunicazioni/:id/like', e);
    res.status(500).json({ error: 'Errore like' });
  }
});

/* =========================================================
   COMMENTI (AUTENTICATO)
   GET /comunicazioni/:id/comments?limit=20&cursor=ISO
   POST /comunicazioni/:id/comments  body:{ contenuto }
   ========================================================= */
router.get('/:id/comments', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null;

    const params = [req.params.id];
    let where = 'WHERE comunicazione_id=$1';
    if (cursor) {
      params.push(cursor);
      where += ` AND created_at < $2`;
    }

    const q = `
      SELECT cc.*, u.nome, u.cognome
      FROM comunicazioni_comments cc
      JOIN utenti u ON u.id = cc.utente_id
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit + 1}
    `;
    const { rows } = await pool.query(q, params);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor = hasMore ? items[items.length - 1].created_at.toISOString() : null;
    res.json({ items, next_cursor });
  } catch (e) {
    console.error('GET /comunicazioni/:id/comments', e);
    res.status(500).json({ error: 'Errore commenti' });
  }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const utenteId = await requireUserId(req);
    const body = (req.body?.contenuto || '').trim();
    if (!body) return res.status(400).json({ error: 'Contenuto mancante' });

    const ins = await pool.query(
      `INSERT INTO comunicazioni_comments (comunicazione_id, utente_id, contenuto)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, utenteId, body]
    );
    res.json(ins.rows[0]);
  } catch (e) {
    const code = e.status || 500;
    if (code === 404) return res.status(404).json({ error: e.message });
    console.error('POST /comunicazioni/:id/comments', e);
    res.status(500).json({ error: 'Errore invio commento' });
  }
});

/* =========================================================
   ROTTE ADMIN: elenco/crea/download/elimina (legacy)
   ========================================================= */

// GET tutte (filtri opzionali)
router.get('/', async (req, res) => {
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
});

/* POST nuova comunicazione (MULTI allegati su comunicazione_attachments) */
router.post('/', upload.array('allegato'), async (req, res) => {
  const { titolo, contenuto, societa_id, creato_da, destinatari } = req.body;
  const files = Array.isArray(req.files) ? req.files : [];

  let destinatariJson = null;
  if (destinatari) {
    try { destinatariJson = JSON.parse(destinatari); }
    catch { return res.status(400).json({ error: 'destinatari non è un JSON valido' }); }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Inserisci la comunicazione (lascia allegato_url NULL: retrocompatibilità)
    const commRes = await client.query(
      `INSERT INTO comunicazioni (titolo, contenuto, societa_id, creato_da, destinatari)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        titolo,
        contenuto,
        societa_id ? Number(societa_id) : null,
        creato_da ? Number(creato_da) : null,
        destinatariJson
      ]
    );
    const comm = commRes.rows[0];

    // 2) Inserisci gli allegati nella tabella dedicata
    for (const f of files) {
      await client.query(
        `INSERT INTO comunicazione_attachments (comunicazione_id, file_url, mime_type, width, height)
         VALUES ($1, $2, $3, NULL, NULL)`,
        [comm.id, path.join('uploads', f.filename), f.mimetype || null]
      );
    }

    await client.query('COMMIT');
    res.json(comm);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /comunicazioni', err.stack || err);
    res.status(500).json({ error: 'Errore inserimento comunicazione' });
  } finally {
    client.release();
  }
});



// GET download allegato singolo (legacy + fallback su attachments)
router.get('/:id/download', async (req, res) => {
  try {
    // Prima prova dalla tabella comunicazione_attachments (primo allegato)
    const a = await pool.query(
      `SELECT file_url
       FROM comunicazione_attachments
       WHERE comunicazione_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [req.params.id]
    );
    if (a.rows.length) {
      const abs = path.join(__dirname, '..', a.rows[0].file_url);
      if (!fs.existsSync(abs)) return res.status(404).send('File non trovato');
      return res.download(abs);
    }

    // Fallback: campo legacy allegato_url su "comunicazioni"
    const result = await pool.query(
      `SELECT allegato_url FROM comunicazioni WHERE id = $1`,
      [req.params.id]
    );
    const rel = result.rows[0]?.allegato_url;
    if (!rel) return res.status(404).send('File non trovato');

    const abs = path.join(__dirname, '..', rel);
    if (!fs.existsSync(abs)) return res.status(404).send('File non trovato');
    res.download(abs);
  } catch (err) {
    console.error('GET /comunicazioni/:id/download', err);
    res.status(500).json({ error: 'Errore download' });
  }
});


// DELETE comunicazione
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM letture_comunicazioni WHERE comunicazione_id = $1', [req.params.id]);
    await pool.query('DELETE FROM comunicazioni WHERE id = $1', [req.params.id]);
    res.json({ message: 'Comunicazione eliminata' });
  } catch (err) {
    console.error('DELETE /comunicazioni/:id', err);
    res.status(500).json({ error: 'Errore durante l\'eliminazione' });
  }
});

/* =========================================================
   ADMIN BREAKDOWN (SOLO requireAuth, nessun check ruolo)
   GET /comunicazioni/:id/admin
   ========================================================= */
router.get('/:id/admin', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID non valido' });

    // Comunicazione base
    const commRes = await pool.query('SELECT * FROM comunicazioni WHERE id=$1', [id]);
    if (!commRes.rows.length) return res.status(404).json({ error: 'Comunicazione non trovata' });
    const comm = commRes.rows[0];

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
});

module.exports = router;
