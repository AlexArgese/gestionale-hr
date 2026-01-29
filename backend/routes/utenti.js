const express = require('express');
const router = express.Router();
const pool = require('../db');
const nodemailer = require('nodemailer');
require('dotenv').config();

/* Transporter Gmail */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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
        u.codice_teamsystem,
        u.updated_at,
        u.codice_fiscale,                -- ← importante per mapping CF
        u.iban,                          -- 👈 IBAN nella lista
        s.ragione_sociale AS societa_nome
      FROM utenti u
      JOIN societa s ON u.societa_id = s.id
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
      nome, cognome, email, ruolo, sede, codice_teamsystem,
      societa_id, stato_attivo, data_nascita, luogo_nascita,
      provincia_nascita, codice_fiscale, indirizzo_residenza,
      citta_residenza, provincia_residenza, cap_residenza,
      cellulare, contatto_emergenza, iban        // 👈 IBAN dal body
    } = req.body;

    const insert = await pool.query(
      `INSERT INTO utenti
         (nome,cognome,email,ruolo,sede,codice_teamsystem,societa_id,
          stato_attivo,data_nascita,luogo_nascita,provincia_nascita,
          codice_fiscale,indirizzo_residenza,citta_residenza,
          provincia_residenza,cap_residenza,cellulare,contatto_emergenza,iban)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        nome, cognome, email, ruolo, sede, codice_teamsystem,
        societa_id, stato_attivo, data_nascita || null,
        luogo_nascita, provincia_nascita, codice_fiscale,
        indirizzo_residenza, citta_residenza, provincia_residenza,
        cap_residenza, cellulare, contatto_emergenza, iban,
      ]
    );
    const nuovoId = insert.rows[0].id;

    const signupLink = `https://expo.dev/@tuaOrg/clockeasy-app?email=${encodeURIComponent(email)}`;

    await transporter.sendMail({
      from   : `"ClockEasy HR" <${process.env.SMTP_USER}>`,
      to     : email,
      subject: 'Completa la registrazione su ClockEasy',
      html   : `
        <p>Ciao ${nome},</p>
        <p>Il tuo account è stato creato su <b>ClockEasy</b>.</p>
        <p>Clicca il pulsante qui sotto per completare la registrazione nell’app:</p>
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
    nome, cognome, email, ruolo, sede, stato_attivo, codice_teamsystem, societa_id,
    data_nascita, luogo_nascita, provincia_nascita, codice_fiscale,
    indirizzo_residenza, citta_residenza, provincia_residenza, cap_residenza,
    cellulare, contatto_emergenza, iban           // 👈 IBAN dal body
  } = req.body;

  try {
    const check = await pool.query(
      'SELECT id FROM utenti WHERE codice_teamsystem = $1 AND id != $2',
      [codice_teamsystem, id]
    );
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'Codice TeamSystem già in uso da un altro dipendente' });
    }

    await pool.query(`
      UPDATE utenti SET
        nome = $1, cognome = $2, email = $3, ruolo = $4, sede = $5,
        stato_attivo = $6, codice_teamsystem = $7, societa_id = $8,
        data_nascita = $9, luogo_nascita = $10, provincia_nascita = $11, codice_fiscale = $12,
        indirizzo_residenza = $13, citta_residenza = $14, provincia_residenza = $15, cap_residenza = $16,
        cellulare = $17, contatto_emergenza = $18, iban = $19,
        updated_at = now()
      WHERE id = $20
    `, [
      nome, cognome, email, ruolo, sede,
      stato_attivo, codice_teamsystem, societa_id,
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
