const admin = require('../firebase-admin');
const pool = require('../db');

module.exports = async function requireAuth(req, res, next) {
  if (req.method === 'OPTIONS') return res.sendStatus(204);  
  const hdr = req.headers.authorization || '';

  if (hdr.startsWith('Bearer ')) {
    const idToken = hdr.split(' ')[1];
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      req.user = decoded; // { email, uid, … }

      // Recupera il ruolo dal DB utenti
      const result = await pool.query(
        'SELECT id, ruolo FROM utenti WHERE email = $1 AND stato_attivo = true',
        [decoded.email]
      );

      if (result.rows.length) {
        req.user.ruolo = result.rows[0].ruolo || 'employee';
        req.user.id = result.rows[0].id;
      } else {
        req.user.ruolo = 'guest';
      }

      return next();
    } catch (err) {
      console.error('JWT Firebase non valido:', err);
      return res.status(401).json({ error: 'Token non valido' });
    }
  }

  // ────────────────────────  gestionale LAN
  req.user = { ruolo: 'admin_lan' }; // fallback
  next();
};
