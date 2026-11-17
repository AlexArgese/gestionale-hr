/**
 * backend/services/documenti/db.js
 * Accesso al database usato dalle rotte di /backend/routes/documenti.js
 * (lookup utenti/push token, inserimento righe documento).
 */
const pool = require('../../db');

async function getUserPushTokens(utenteId) {
  const t = await pool.query(
    `SELECT expo_push_token
       FROM push_tokens
      WHERE utente_id = $1
        AND attivo = true`,
    [utenteId]
  );

  return t.rows
    .map(r => r.expo_push_token)
    .filter(Boolean);
}

/**
 * Prova a risolvere l'ID dell'autore dalla sessione:
 * 1) req.user.id (se il middleware auth lo setta)
 * 2) lookup per email su tabella 'utenti'
 * Se non trovato, ritorna null (NON lancia).
 */
async function resolveAutoreId(req) {
  try {
    if (req.user?.id && Number.isInteger(Number(req.user.id))) {
      const idNum = Number(req.user.id);
      const q = await pool.query('SELECT id FROM utenti WHERE id = $1 LIMIT 1', [idNum]);
      if (q.rows.length) return q.rows[0].id;
    }
    if (req.user?.email) {
      const q = await pool.query('SELECT id FROM utenti WHERE email = $1 LIMIT 1', [req.user.email]);
      if (q.rows.length) return q.rows[0].id;
    }
    return null; // autore non presente in 'utenti' → non bloccare l'upload
  } catch {
    return null;
  }
}

/**
 * Valida/parsa utente target:
 * - Se body.utente_id presente → parse int + verifica esistenza in DB.
 * - Se assente → usa autoreId (per mobile/self-upload).
 * Ritorna { targetUserId, autoreId }.
 * Lancia solo se target mancante o non esistente.
 */
async function resolveTargetUserId(req) {
  const raw = req.body?.utente_id;
  const autoreId = await resolveAutoreId(req); // può essere null

  let targetUserId = null;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const uid = Number(raw);
    if (!Number.isInteger(uid) || uid <= 0) {
      throw new Error('utente_id non valido');
    }
    const q = await pool.query('SELECT id FROM utenti WHERE id = $1 LIMIT 1', [uid]);
    if (!q.rows.length) throw new Error('Utente non trovato');
    targetUserId = uid;
  } else if (autoreId) {
    targetUserId = autoreId; // fallback: autore (mobile)
  } else {
    throw new Error('utente_id richiesto');
  }

  return { targetUserId, autoreId };
}

async function insertDocumentoRows({ utenteIds, tipo, nome_file, nome_file_base, relPath, caricato_da, data_scadenza, require_signature, batch_id }) {
  const rows = [];
  for (const uid of utenteIds) {
    const r = await pool.query(
      `INSERT INTO documenti
         (utente_id, tipo_documento, nome_file, nome_file_base, url_file, caricato_da, data_upload, data_scadenza, require_signature, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9)
       RETURNING id, utente_id, nome_file, url_file, require_signature`,
      [uid, tipo, nome_file, nome_file_base || nome_file, relPath, caricato_da, data_scadenza || null, !!require_signature, batch_id || null]
    );
    rows.push(r.rows[0]);
  }
  return rows;
}

module.exports = {
  getUserPushTokens,
  resolveAutoreId,
  resolveTargetUserId,
  insertDocumentoRows,
};
