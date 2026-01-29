// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const pool = require('../db');

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    email: req.user.email,
    id: req.user.id,
    ruolo: req.user.ruolo,
    isAdmin: req.user.isAdmin
  });
});

router.post('/validate-user', requireAuth, async (req, res) => {
  const email = req.user.email;
  try {
    const result = await pool.query(
      `SELECT * FROM utenti WHERE email = $1 AND stato_attivo = true`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Utente non abilitato o non presente nel gestionale.' });
    }
    res.json({ success: true, utente: result.rows[0] });
  } catch (err) {
    console.error('Errore validazione utente', err);
    res.status(500).json({ error: 'Errore server durante la verifica' });
  }
});

router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email mancante' });

  try {
    const result = await pool.query(
      'SELECT id FROM utenti WHERE email = $1 AND stato_attivo = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email non presente o non attiva' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Errore check-email', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
