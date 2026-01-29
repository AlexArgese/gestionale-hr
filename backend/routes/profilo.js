const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

/**
 * GET /profilo
 * Ritorna dati utente + documenti raggruppati
 */
router.get('/', requireAuth, async (req, res) => {
  console.log('👉 RICHIESTA PROFILO PER USER:', req.user);

  try {
    // Cerca utente usando email del token Firebase
    const utenteQuery = await pool.query(
      `SELECT id, nome, cognome, email, ruolo, sede, data_nascita,
              luogo_nascita, provincia_nascita, codice_fiscale,
              indirizzo_residenza, citta_residenza, provincia_residenza,
              cap_residenza, cellulare, contatto_emergenza, data_assunzione
       FROM utenti
       WHERE email = $1`,
      [req.user.email]
    );

    if (utenteQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const utente = utenteQuery.rows[0];

    // Documenti di quell'utente
    const docsQuery = await pool.query(
      `SELECT tipo_documento, nome_file, url_file, data_upload, data_scadenza
       FROM documenti
       WHERE utente_id = $1
       ORDER BY tipo_documento, data_upload DESC`,
      [utente.id]
    );

    const docsGrouped = {};
    for (const d of docsQuery.rows) {
      if (!docsGrouped[d.tipo_documento]) docsGrouped[d.tipo_documento] = [];
      docsGrouped[d.tipo_documento].push(d);
    }

    res.json({ utente, documenti: docsGrouped });
  } catch (err) {
    console.error('Errore /profilo', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

/**
 * PUT /profilo
 * Aggiorna nome/cognome/cellulare dell’utente autenticato
 * BODY: { nome?, cognome?, cellulare? }
 */
router.put('/', requireAuth, async (req, res) => {
    try {
      const ALLOWED = new Set([
        'nome',
        'cognome',
        'cellulare',
        'indirizzo_residenza',
        'citta_residenza',
        'provincia_residenza',
        'cap_residenza',
        'contatto_emergenza',
      ]);
  
      // whitelisting
      const data = {};
      Object.keys(req.body || {}).forEach((k) => {
        if (ALLOWED.has(k)) data[k] = req.body[k];
      });
  
      // se non arriva nulla → 400
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Nessun campo aggiornabile fornito' });
      }
  
      // validazioni leggere
      if (data.cap_residenza && !/^\d{5}$/.test(data.cap_residenza)) {
        return res.status(400).json({ error: 'CAP non valido (5 cifre)' });
      }
      if (data.cellulare && !/^[\d+\s\-()]{6,20}$/.test(data.cellulare)) {
        return res.status(400).json({ error: 'Cellulare non valido' });
      }
  
      // build dinamico SET
      const sets = [];
      const values = [];
      let idx = 1;
  
      for (const [key, value] of Object.entries(data)) {
        sets.push(`${key} = $${idx++}`);
        values.push(value === '' ? null : value);
      }
      // updated_at e WHERE email
      sets.push(`updated_at = NOW()`);
      values.push(req.user.email);
  
      const sql = `UPDATE utenti SET ${sets.join(', ')} WHERE email = $${idx} RETURNING id, nome, cognome, email, ruolo, sede, indirizzo_residenza, citta_residenza, provincia_residenza, cap_residenza, cellulare, contatto_emergenza`;
      const result = await pool.query(sql, values);
  
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Utente non trovato' });
      }
  
      res.json({ ok: true, utente: result.rows[0] });
    } catch (err) {
      console.error('PUT /profilo error', err);
      res.status(500).json({ error: 'Errore aggiornamento profilo' });
    }
  });

module.exports = router;
