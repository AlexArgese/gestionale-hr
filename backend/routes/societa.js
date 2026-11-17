// routes/societa.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { allowRoles } = require('../middleware/rbac');

router.get('/', requireAuth, allowRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, ragione_sociale FROM societa');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel recupero delle società' });
  }
});

module.exports = router;
