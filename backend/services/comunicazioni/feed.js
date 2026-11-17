/**
 * backend/services/comunicazioni/feed.js
 * Handler delle rotte "social" lato dipendente (feed, letture, like, commenti)
 * di /backend/routes/comunicazioni.js.
 */
const pool = require('../../db');
const { requireUserId, getOptionalUserId } = require('./db');

/* =========================================================
   FEED PERSONALIZZATO (AUTENTICATO)
   GET /comunicazioni/feed
   ========================================================= */
async function feedHandler(req, res) {
  try {
    const u = await pool.query(
      'SELECT id, societa_id FROM utenti WHERE email = $1',
      [req.user.email]
    );
    if (!u.rows.length) return res.status(404).json({ error: 'Utente non trovato' });

    const utenteId = u.rows[0].id;
    const societaId = u.rows[0].societa_id || null;

    const q = `
      SELECT
        c.*,
        EXISTS (
          SELECT 1 FROM comunicazioni_likes cl
          WHERE cl.comunicazione_id = c.id AND cl.utente_id = $1
        ) AS liked,
        COALESCE((
          SELECT COUNT(*)::int FROM comunicazioni_likes cl2
          WHERE cl2.comunicazione_id = c.id
        ), 0) AS likes_count,
        COALESCE((
          SELECT COUNT(*)::int FROM comunicazioni_comments cc
          WHERE cc.comunicazione_id = c.id
        ), 0) AS comments_count,
        (lc.utente_id IS NOT NULL) AS letto
      FROM comunicazioni c
      LEFT JOIN letture_comunicazioni lc
        ON lc.comunicazione_id = c.id AND lc.utente_id = $1
      WHERE
        (c.societa_id IS NULL OR c.societa_id = $2)
        AND (c.destinatari IS NULL OR $1 = ANY(c.destinatari))
      ORDER BY c.data_pubblicazione DESC NULLS LAST, c.id DESC
    `;
    const { rows } = await pool.query(q, [utenteId, societaId]);
    res.json(rows);
  } catch (err) {
    console.error('GET /comunicazioni/feed', err);
    res.status(500).json({ error: 'Errore nel recupero comunicazioni' });
  }
}

/* =========================================================
   SEGNARE COME LETTA (AUTENTICATO)
   POST /comunicazioni/:id/lettura
   ========================================================= */
async function letturaHandler(req, res) {
  try {
    const utenteId = await requireUserId(req);
    await pool.query(
      `INSERT INTO letture_comunicazioni (comunicazione_id, utente_id, data_lettura)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (comunicazione_id, utente_id) DO NOTHING`,
      [req.params.id, utenteId]
    );
    res.status(204).end();
  } catch (e) {
    const code = e.status || 500;
    if (code === 404) return res.status(404).json({ error: e.message });
    console.error('POST /comunicazioni/:id/lettura', e);
    res.status(500).json({ error: 'Errore nel segnare la lettura' });
  }
}

/* =========================================================
   DETTAGLIO (AUTENTICATO, TOLLERANTE PER ADMIN)
   GET /comunicazioni/:id
   ========================================================= */
async function detailHandler(req, res) {
  try {
    const utenteId = await getOptionalUserId(req);

    const cRes = await pool.query('SELECT * FROM comunicazioni WHERE id = $1', [req.params.id]);
    if (!cRes.rows.length) return res.status(404).json({ error: 'Comunicazione non trovata' });
    const c = cRes.rows[0];

    const likedRes = utenteId
      ? await pool.query(
          `SELECT EXISTS(
             SELECT 1 FROM comunicazioni_likes WHERE comunicazione_id=$1 AND utente_id=$2
           ) AS liked`,
          [req.params.id, utenteId]
        )
      : { rows: [{ liked: false }] };

    const likesCountRes = await pool.query(
      `SELECT COUNT(*)::int AS likes_count FROM comunicazioni_likes WHERE comunicazione_id=$1`,
      [req.params.id]
    );
    const commentsCountRes = await pool.query(
      `SELECT COUNT(*)::int AS comments_count FROM comunicazioni_comments WHERE comunicazione_id=$1`,
      [req.params.id]
    );
    const attRes = await pool.query(
      `SELECT id, file_url, mime_type, width, height
       FROM comunicazione_attachments
       WHERE comunicazione_id = $1
       ORDER BY id ASC`,
      [req.params.id]
    );

    const attachments = attRes.rows.length
      ? attRes.rows
      : (c.allegato_url
          ? [{ id: -1, file_url: c.allegato_url, mime_type: null, width: null, height: null }]
          : []);

    res.json({
      ...c,
      attachments,
      liked: likedRes.rows[0].liked,
      likes_count: likesCountRes.rows[0].likes_count,
      comments_count: commentsCountRes.rows[0].comments_count,
    });
  } catch (e) {
    console.error('GET /comunicazioni/:id', e);
    res.status(500).json({ error: 'Errore nel recupero comunicazione' });
  }
}

/* =========================================================
   LIKE / UNLIKE (AUTENTICATO)
   POST /comunicazioni/:id/like
   ========================================================= */
async function likeHandler(req, res) {
  try {
    const utenteId = await requireUserId(req);
    const id = Number(req.params.id);
    const action = (req.body?.action || '').toLowerCase();

    if (action === 'like') {
      await pool.query(
        `INSERT INTO comunicazioni_likes (comunicazione_id, utente_id)
         VALUES ($1, $2)
         ON CONFLICT (comunicazione_id, utente_id) DO NOTHING`,
        [id, utenteId]
      );
    } else if (action === 'unlike') {
      await pool.query(
        `DELETE FROM comunicazioni_likes WHERE comunicazione_id=$1 AND utente_id=$2`,
        [id, utenteId]
      );
    } else {
      return res.status(400).json({ error: 'Azione non valida' });
    }

    const likedRes = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM comunicazioni_likes WHERE comunicazione_id=$1 AND utente_id=$2
       ) AS liked`,
      [id, utenteId]
    );
    const likesCountRes = await pool.query(
      `SELECT COUNT(*)::int AS likes_count FROM comunicazioni_likes WHERE comunicazione_id=$1`,
      [id]
    );
    res.json({
      liked: likedRes.rows[0].liked,
      likes_count: likesCountRes.rows[0].likes_count,
    });
  } catch (e) {
    const code = e.status || 500;
    if (code === 404) return res.status(404).json({ error: e.message });
    console.error('POST /comunicazioni/:id/like', e);
    res.status(500).json({ error: 'Errore like' });
  }
}

/* =========================================================
   COMMENTI (AUTENTICATO)
   GET /comunicazioni/:id/comments?limit=20&cursor=ISO
   POST /comunicazioni/:id/comments  body:{ contenuto }
   ========================================================= */
async function commentsListHandler(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null;

    const params = [req.params.id];
    let where = 'WHERE comunicazione_id=$1';
    if (cursor) {
      params.push(cursor);
      where += ` AND created_at < $2`;
    }

    const q = `
      SELECT cc.*, u.nome, u.cognome
      FROM comunicazioni_comments cc
      JOIN utenti u ON u.id = cc.utente_id
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit + 1}
    `;
    const { rows } = await pool.query(q, params);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor = hasMore ? items[items.length - 1].created_at.toISOString() : null;
    res.json({ items, next_cursor });
  } catch (e) {
    console.error('GET /comunicazioni/:id/comments', e);
    res.status(500).json({ error: 'Errore commenti' });
  }
}

async function commentsCreateHandler(req, res) {
  try {
    const utenteId = await requireUserId(req);
    const body = (req.body?.contenuto || '').trim();
    if (!body) return res.status(400).json({ error: 'Contenuto mancante' });

    const ins = await pool.query(
      `INSERT INTO comunicazioni_comments (comunicazione_id, utente_id, contenuto)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, utenteId, body]
    );
    res.json(ins.rows[0]);
  } catch (e) {
    const code = e.status || 500;
    if (code === 404) return res.status(404).json({ error: e.message });
    console.error('POST /comunicazioni/:id/comments', e);
    res.status(500).json({ error: 'Errore invio commento' });
  }
}

module.exports = {
  feedHandler,
  letturaHandler,
  detailHandler,
  likeHandler,
  commentsListHandler,
  commentsCreateHandler,
};
