const express = require('express');
const router = express.Router();
const pool = require('../db');
require('dotenv').config();
const admin = require('../firebase-admin');
const requireAuth = require('../middleware/requireAuth');
const { safeSendMail } = require('../lib/notifier');

/* =========================================================================
   GET /utenti/cf/all  -> mapping rapido per CF (deve stare PRIMA di /:id)
   Ritorna solo i campi necessari per l'abbinamento per CF
========================================================================= */
router.get('/cf/all', async (_req, res) => {
  try {
    const q = await pool.query(`
      SELECT id,
             nome,
             cognome,
             UPPER(TRIM(codice_fiscale)) AS codice_fiscale
      FROM utenti
      WHERE codice_fiscale IS NOT NULL
        AND LENGTH(TRIM(codice_fiscale)) = 16
    `);
    res.json(q.rows);
  } catch (err) {
    console.error('GET /utenti/cf/all', err);
    res.status(500).json({ error: 'Errore nel recupero codici fiscali' });
  }
});

/* =========================================================================
   GET tutti gli utenti  (include anche codice_fiscale)
========================================================================= */
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.nome,
        u.cognome,
        u.email,
        u.ruolo,
        u.sede,
        u.stato_attivo,
        u.tipo_contratto,
        u.updated_at,
        u.codice_fiscale,
        u.iban,
        u.archiviato,
        u.archiviato_at,
        s.ragione_sociale AS societa_nome
      FROM utenti u
      JOIN societa s ON u.societa_id = s.id
      WHERE COALESCE(u.archiviato, false) = false
      ORDER BY u.cognome ASC, u.nome ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /utenti', err);
    res.status(500).json({ error: 'Errore nel recupero utenti' });
  }
});

/* =========================================================================
   POST nuovo utente (e invia email)
========================================================================= */
router.post('/', async (req, res) => {
  try {
    const {
      nome, cognome, email, ruolo, sede,
      societa_id, stato_attivo,tipo_contratto, data_nascita, luogo_nascita,
      provincia_nascita, codice_fiscale, indirizzo_residenza,
      citta_residenza, provincia_residenza, cap_residenza,
      cellulare, contatto_emergenza, iban        // 👈 IBAN dal body
    } = req.body;

    const insert = await pool.query(
      `INSERT INTO utenti
         (nome,cognome,email,ruolo,sede,societa_id,
          stato_attivo,tipo_contratto,data_nascita,luogo_nascita,provincia_nascita,
          codice_fiscale,indirizzo_residenza,citta_residenza,
          provincia_residenza,cap_residenza,cellulare,contatto_emergenza,iban)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        nome, cognome, email, ruolo, sede,
        societa_id, stato_attivo, tipo_contratto, data_nascita || null,
        luogo_nascita, provincia_nascita, codice_fiscale,
        indirizzo_residenza, citta_residenza, provincia_residenza,
        cap_residenza, cellulare, contatto_emergenza, iban,
      ]
    );
    const nuovoId = insert.rows[0].id;

    const signupLink = `https://expo.dev/@tuaOrg/clockeasy-app?email=${encodeURIComponent(email)}`;

    await safeSendMail({
      to     : email,
      subject: 'Completa la registrazione su ClockEasy',
      html   : `
        <p>Ciao ${nome},</p>
        <p>Il tuo account è stato creato su <b>ClockEasy</b>.</p>
        <p>Clicca il pulsante qui sotto per completare la registrazione nell'app:</p>
        <p>
          <a href="${signupLink}" style="
             padding:10px 20px;
             background:#1976d2;
             color:#fff;
             text-decoration:none;
             border-radius:4px;
          ">Completa registrazione</a>
        </p>
        <p>Oppure copia questo link nel browser:<br>${signupLink}</p>
        <hr>
        <small>Non rispondere a questa email.</small>
      `,
    });

    res.status(201).json({ id: nuovoId, message: 'Utente creato e email inviata' });
  } catch (err) {
    console.error('POST /utenti', err);
    res.status(500).json({ error: 'Errore server durante creazione utente' });
  }
});

router.delete('/delete-my-account', requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const firebaseUid = req.user.uid;
    const userId = req.user.id;

    if (!userId) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    await client.query('BEGIN');

    await client.query(
      `
      UPDATE utenti
      SET
        app_access_revoked = TRUE,
        app_account_deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [userId]
    );

    await client.query('COMMIT');

    await admin.auth().deleteUser(firebaseUid);

    return res.json({
      message: 'Account eliminato con successo',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /utenti/delete-my-account', err);
    return res.status(500).json({ message: 'Errore eliminazione account' });
  } finally {
    client.release();
  }
});


router.get('/archiviati', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.nome,
        u.cognome,
        u.email,
        u.ruolo,
        u.sede,
        u.stato_attivo,
        u.tipo_contratto,
        u.updated_at,
        u.codice_fiscale,
        u.iban,
        u.archiviato,
        u.archiviato_at,
        s.ragione_sociale AS societa_nome
      FROM utenti u
      JOIN societa s ON u.societa_id = s.id
      WHERE COALESCE(u.archiviato, false) = true
      ORDER BY u.archiviato_at DESC NULLS LAST, u.cognome ASC, u.nome ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /utenti/archiviati', err);
    res.status(500).json({ error: 'Errore nel recupero utenti archiviati' });
  }
});

router.patch('/bulk/archivia', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids deve essere un array non vuoto' });
    }

    const result = await pool.query(`
      UPDATE utenti
      SET archiviato = true,
          archiviato_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY($1::int[])
      RETURNING id
    `, [ids]);

    res.json({
      message: 'Utenti archiviati con successo',
      updatedCount: result.rowCount,
    });
  } catch (err) {
    console.error('PATCH /utenti/bulk/archivia', err);
    res.status(500).json({ error: 'Errore durante archiviazione multipla' });
  }
});

router.patch('/bulk/ripristina', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids deve essere un array non vuoto' });
    }

    const result = await pool.query(`
      UPDATE utenti
      SET archiviato = false,
          archiviato_at = NULL,
          updated_at = NOW()
      WHERE id = ANY($1::int[])
      RETURNING id
    `, [ids]);

    res.json({
      message: 'Utenti ripristinati con successo',
      updatedCount: result.rowCount,
    });
  } catch (err) {
    console.error('PATCH /utenti/bulk/ripristina', err);
    res.status(500).json({ error: 'Errore durante ripristino multiplo' });
  }
});

router.patch('/bulk/stato-attivo', async (req, res) => {
  try {
    const { ids, stato_attivo } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids deve essere un array non vuoto' });
    }

    if (typeof stato_attivo !== 'boolean') {
      return res.status(400).json({ error: 'stato_attivo deve essere boolean' });
    }

    const result = await pool.query(`
      UPDATE utenti
      SET stato_attivo = $2,
          updated_at = NOW()
      WHERE id = ANY($1::int[])
      RETURNING id
    `, [ids, stato_attivo]);

    res.json({
      message: 'Stato attivo aggiornato con successo',
      updatedCount: result.rowCount,
    });
  } catch (err) {
    console.error('PATCH /utenti/bulk/stato-attivo', err);
    res.status(500).json({ error: 'Errore durante aggiornamento stato attivo' });
  }
});

router.patch('/bulk/tipo-contratto', async (req, res) => {
  try {
    const { ids, tipo_contratto } = req.body;

    const tipiValidi = [
      'full_time',
      'part_time_2',
      'part_time_3',
      'part_time_4',
      'part_time_6',
      'part_time_8',
      'chiamata_6',
    ];

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids deve essere un array non vuoto' });
    }

    if (!tipiValidi.includes(tipo_contratto)) {
      return res.status(400).json({ error: 'tipo_contratto non valido' });
    }

    const result = await pool.query(`
      UPDATE utenti
      SET tipo_contratto = $2,
          updated_at = NOW()
      WHERE id = ANY($1::int[])
      RETURNING id
    `, [ids, tipo_contratto]);

    res.json({
      message: 'Tipo contratto aggiornato con successo',
      updatedCount: result.rowCount,
    });
  } catch (err) {
    console.error('PATCH /utenti/bulk/tipo-contratto', err);
    res.status(500).json({ error: 'Errore durante aggiornamento tipo contratto' });
  }
});

router.patch('/:id/archivia', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE utenti
      SET archiviato = true,
          archiviato_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    res.json({ message: 'Utente archiviato con successo' });
  } catch (err) {
    console.error('PATCH /utenti/:id/archivia', err);
    res.status(500).json({ error: 'Errore durante archiviazione utente' });
  }
});

router.patch('/:id/ripristina', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE utenti
      SET archiviato = false,
          archiviato_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    res.json({ message: 'Utente ripristinato con successo' });
  } catch (err) {
    console.error('PATCH /utenti/:id/ripristina', err);
    res.status(500).json({ error: 'Errore durante ripristino utente' });
  }
});



/* =========================================================================
   GET singolo utente
   (DEVE stare dopo /cf/all, altrimenti cattura "cf" come :id)
========================================================================= */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.*,
        TO_CHAR(u.data_nascita, 'YYYY-MM-DD') AS data_nascita,
        s.ragione_sociale AS societa_nome
      FROM utenti u
      JOIN societa s ON u.societa_id = s.id
      WHERE u.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Utente non trovato' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /utenti/:id', err);
    res.status(500).json({ error: 'Errore nel recupero dell\'utente' });
  }
});

/* =========================================================================
   DELETE utente
========================================================================= */
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM utenti WHERE id = $1', [req.params.id]);
    res.json({ message: 'Utente eliminato con successo' });
  } catch (err) {
    console.error('DELETE /utenti/:id', err);
    res.status(500).json({ error: 'Errore nella cancellazione utente' });
  }
});

/* =========================================================================
   PUT update utente
========================================================================= */
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const {
    nome, cognome, email, ruolo, sede, stato_attivo, tipo_contratto, societa_id,
    data_nascita, luogo_nascita, provincia_nascita, codice_fiscale,
    indirizzo_residenza, citta_residenza, provincia_residenza, cap_residenza,
    cellulare, contatto_emergenza, iban           // 👈 IBAN dal body
  } = req.body;

  try {
    await pool.query(`
      UPDATE utenti SET
        nome = $1, cognome = $2, email = $3, ruolo = $4, sede = $5,
        stato_attivo = $6, tipo_contratto = $7, societa_id = $8,
        data_nascita = $9, luogo_nascita = $10, provincia_nascita = $11, codice_fiscale = $12,
        indirizzo_residenza = $13, citta_residenza = $14, provincia_residenza = $15, cap_residenza = $16,
        cellulare = $17, contatto_emergenza = $18, iban = $19,
        updated_at = now()
      WHERE id = $20
    `, [
      nome, cognome, email, ruolo, sede,
      stato_attivo, tipo_contratto, societa_id,
      data_nascita, luogo_nascita, provincia_nascita, codice_fiscale,
      indirizzo_residenza, citta_residenza, provincia_residenza, cap_residenza,
      cellulare, contatto_emergenza, iban,
      id
    ]);

    res.json({ message: "Dipendente aggiornato" });
  } catch (err) {
    console.error('PUT /utenti/:id', err);
    res.status(500).json({ error: "Errore aggiornamento" });
  }
});

module.exports = router;