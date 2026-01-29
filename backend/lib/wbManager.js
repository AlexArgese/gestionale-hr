// backend/lib/wbManager.js
const pool = require('../db');

let cached = { id: null, ts: 0 };
const TTL_MS = 5 * 60 * 1000;

async function getWbManagerId() {
  const now = Date.now();
  if (cached.id && now - cached.ts < TTL_MS) return cached.id;

  const { rows } = await pool.query(
    `SELECT id FROM utenti WHERE ruolo = 'wb_manager' AND stato_attivo = true
     ORDER BY id ASC LIMIT 1`
  );
  if (!rows.length) throw new Error('Nessun utente con ruolo=wb_manager trovato');
  cached = { id: rows[0].id, ts: now };
  return cached.id;
}

module.exports = { getWbManagerId };
