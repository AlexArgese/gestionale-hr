const pool = require('../db');

let cachedManager = { row: null, ts: 0 };
let cachedEmails = { emails: null, ts: 0 };
const TTL_MS = 5 * 60 * 1000;

async function getWbManagerId() {
  const now = Date.now();
  if (cachedManager.row && now - cachedManager.ts < TTL_MS) {
    return cachedManager.row.id;
  }

  const { rows } = await pool.query(
    `SELECT id, email FROM utenti WHERE ruolo = 'wb_manager' AND stato_attivo = true
     ORDER BY id ASC LIMIT 1`
  );
  if (!rows.length) throw new Error('Nessun utente con ruolo=wb_manager trovato');
  cachedManager = { row: rows[0], ts: now };
  return cachedManager.row.id;
}

async function getWbManagerEmails() {
  const now = Date.now();
  if (cachedEmails.emails && now - cachedEmails.ts < TTL_MS) {
    return cachedEmails.emails;
  }

  const { rows } = await pool.query(
    `SELECT email FROM utenti
      WHERE ruolo = 'wb_manager'
        AND stato_attivo = true
        AND email IS NOT NULL
        AND trim(email) <> ''
      ORDER BY id ASC`
  );

  const emails = rows.map((row) => row.email.trim()).filter(Boolean);
  cachedEmails = { emails, ts: now };
  return emails;
}

async function getWbManagerEmail() {
  const emails = await getWbManagerEmails();
  if (!emails.length) throw new Error('Nessuna email per ruolo=wb_manager trovata');
  return emails[0];
}

module.exports = { getWbManagerId, getWbManagerEmail, getWbManagerEmails };
