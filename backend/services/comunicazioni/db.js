/**
 * backend/services/comunicazioni/db.js
 * Accesso al database usato dalle rotte di /backend/routes/comunicazioni.js
 * (risoluzione destinatari, lookup utente dalla sessione).
 */
const pool = require('../../db');

let _cachedSedeColumn = null; // 'sede_id' oppure 'sede' oppure null

async function detectSedeColumn(client) {
  if (_cachedSedeColumn !== null) return _cachedSedeColumn;

  const q = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='utenti'
       AND column_name IN ('sede_id','sede')`
  );
  const cols = q.rows.map(r => r.column_name);

  if (cols.includes('sede_id')) _cachedSedeColumn = 'sede_id';
  else if (cols.includes('sede')) _cachedSedeColumn = 'sede';
  else _cachedSedeColumn = null;

  return _cachedSedeColumn;
}

async function resolveRecipients({ destinatariIds, societaId, sedeId, client }) {
  // Ritorna { ids: number[], emails: string[] } in base ai filtri
  // - se destinatariIds presente => usa quelli
  // - altrimenti filtra per societaId + sedeId (se presenti)
  const sedeCol = sedeId ? await detectSedeColumn(client) : null;

  let where = `WHERE stato_attivo=TRUE`;
  const params = [];

  if (Array.isArray(destinatariIds) && destinatariIds.length) {
    params.push(destinatariIds);
    where += ` AND id = ANY($${params.length})`;
  } else {
    if (societaId) {
      params.push(societaId);
      where += ` AND societa_id = $${params.length}`;
    }
    if (sedeId && sedeCol) {
      params.push(sedeId);
      where += ` AND ${sedeCol} = $${params.length}`;
    }
    // se sedeId c'è ma non esiste colonna sede/sede_id => ignoro sedeId
  }

  const q = await client.query(
    `SELECT id, email
     FROM utenti
     ${where}`,
    params
  );

  return {
    ids: q.rows.map(r => r.id),
    emails: q.rows.map(r => r.email).filter(Boolean),
  };
}

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

module.exports = {
  detectSedeColumn,
  resolveRecipients,
  requireUserId,
  getOptionalUserId,
};
