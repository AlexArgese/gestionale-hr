const express = require('express');
const router = express.Router();
const pool = require('../db');

/* =========================================================================
   GET /sedi  -> tutte le sedi
========================================================================= */
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nome
       FROM sedi
       ORDER BY nome ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /sedi', err);
    res.status(500).json({ error: 'Errore nel recupero sedi' });
  }
});

/* =========================================================================
   GET /sedi/:id  -> singola sede
========================================================================= */
// GET /sedi/:id  -> singola sede, con societa_id
router.get('/:id', async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT 
          s.id,
          s.nome,
          s.societa_id,
          so.ragione_sociale AS societa_nome
        FROM sedi s
        LEFT JOIN societa so ON so.id = s.societa_id
        WHERE s.id = $1
        `,
        [req.params.id]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Sede non trovata' });
      }
  
      res.json(result.rows[0]);
    } catch (err) {
      console.error('GET /sedi/:id', err);
      res.status(500).json({ error: 'Errore nel recupero sede' });
    }
  });  

/* =========================================================================
   POST /sedi  -> nuova sede
========================================================================= */
router.post('/', async (req, res) => {
  try {
    const { nome } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome sede obbligatorio' });
    }

    const insert = await pool.query(
      `INSERT INTO sedi (nome)
       VALUES ($1)
       RETURNING id`,
      [nome.trim()]
    );

    res.status(201).json({
      id: insert.rows[0].id,
      message: 'Sede creata con successo',
    });
  } catch (err) {
    console.error('POST /sedi', err);

    // violazione UNIQUE (nome già esistente)
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Esiste già una sede con questo nome' });
    }

    res.status(500).json({ error: 'Errore server durante creazione sede' });
  }
});

/* =========================================================================
   PUT /sedi/:id  -> aggiorna sede
========================================================================= */
router.put('/:id', async (req, res) => {
  try {
    const { nome } = req.body;
    const { id } = req.params;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome sede obbligatorio' });
    }

    await pool.query(
      `UPDATE sedi
       SET nome = $1
       WHERE id = $2`,
      [nome.trim(), id]
    );

    res.json({ message: 'Sede aggiornata con successo' });
  } catch (err) {
    console.error('PUT /sedi/:id', err);

    if (err.code === '23505') {
      return res.status(400).json({ error: 'Esiste già una sede con questo nome' });
    }

    res.status(500).json({ error: 'Errore server durante aggiornamento sede' });
  }
});

/* =========================================================================
   DELETE /sedi/:id  -> elimina sede
========================================================================= */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `DELETE FROM sedi
       WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Sede eliminata con successo' });
  } catch (err) {
    console.error('DELETE /sedi/:id', err);
    res.status(500).json({ error: 'Errore nella cancellazione sede' });
  }
});

router.post('/', async (req, res) => {
    try {
      const { nome, societa_id } = req.body;
  
      if (!nome || !nome.trim()) {
        return res.status(400).json({ error: 'Nome sede obbligatorio' });
      }
  
      const insert = await pool.query(
        `INSERT INTO sedi (nome, societa_id)
         VALUES ($1, $2)
         RETURNING id`,
        [nome.trim(), societa_id || null]
      );
  
      res.status(201).json({
        id: insert.rows[0].id,
        message: 'Sede creata con successo',
      });
    } catch (err) {
      console.error('POST /sedi', err);
  
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Esiste già una sede con questo nome' });
      }
  
      res.status(500).json({ error: 'Errore server durante creazione sede' });
    }
  });
  
  router.put('/:id', async (req, res) => {
    try {
      const { nome, societa_id } = req.body;
      const { id } = req.params;
  
      if (!nome || !nome.trim()) {
        return res.status(400).json({ error: 'Nome sede obbligatorio' });
      }
  
      await pool.query(
        `UPDATE sedi
         SET nome = $1,
             societa_id = $2
         WHERE id = $3`,
        [nome.trim(), societa_id || null, id]
      );
  
      res.json({ message: 'Sede aggiornata con successo' });
    } catch (err) {
      console.error('PUT /sedi/:id', err);
  
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Esiste già una sede con questo nome' });
      }
  
      res.status(500).json({ error: 'Errore server durante aggiornamento sede' });
    }
  });

  /* =========================================================================
   POST /sedi/:id/utenti -> associa una serie di utenti a questa sede
   (aggiorna il campo TEXT "sede" degli utenti, aggiungendo il nome sede
    se non già presente; supporta multi-sede per utente)
========================================================================= */
router.post('/:id/utenti', async (req, res) => {
    const { id } = req.params;
    const { utenti_ids } = req.body; // array di id utente
  
    if (!Array.isArray(utenti_ids) || utenti_ids.length === 0) {
      return res.status(400).json({ error: 'Nessun utente selezionato' });
    }
  
    try {
      // recupero nome sede
      const sedeRes = await pool.query(
        'SELECT nome FROM sedi WHERE id = $1',
        [id]
      );
      if (sedeRes.rows.length === 0) {
        return res.status(404).json({ error: 'Sede non trovata' });
      }
      const nomeSede = sedeRes.rows[0].nome;
  
      // per ogni utente: aggiorno campo "sede" aggiungendo nomeSede se non presente
      await Promise.all(
        utenti_ids.map(async (uid) => {
          const uRes = await pool.query(
            'SELECT sede FROM utenti WHERE id = $1',
            [uid]
          );
          if (uRes.rows.length === 0) return;
  
          const current = (uRes.rows[0].sede || '').trim();
          let nuoveSedi;
  
          if (!current) {
            nuoveSedi = nomeSede;
          } else {
            // split su virgola, trim, evita duplicati
            const parts = current
              .split(',')
              .map((x) => x.trim())
              .filter((x) => x.length > 0);
            if (!parts.includes(nomeSede)) {
              parts.push(nomeSede);
            }
            nuoveSedi = parts.join(', ');
          }
  
          await pool.query(
            'UPDATE utenti SET sede = $1 WHERE id = $2',
            [nuoveSedi, uid]
          );
        })
      );
  
      res.json({ message: 'Utenti associati alla sede' });
    } catch (err) {
      console.error('POST /sedi/:id/utenti', err);
      res.status(500).json({ error: 'Errore nell\'associazione utenti alla sede' });
    }
  });
  
module.exports = router;
