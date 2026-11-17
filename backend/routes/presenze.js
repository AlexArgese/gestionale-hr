// routes/presenze.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const QRCode = require('qrcode');
const requireAuth = require('../middleware/requireAuth');
const { allowRoles } = require('../middleware/rbac');

const {
  generateToken,
  localDateStr,
  randomizzaUscitaCappata,
  getMinutiContratto,
} = require('../services/presenze/helpers');
const { calcolaOraUscitaCappata, autoCloseStaleShifts } = require('../services/presenze/db');
const { exportOggiHandler, exportHandler } = require('../services/presenze/export');
const { exportLibroPagaHandler } = require('../services/libroPaga/handler');
const {
  requireTL,
  tlOggiHandler,
  tlExportOggiHandler,
  tlExportHandler,
} = require('../services/presenze/teamLeader');

const validTokens = {};

// ✅ Pulizia automatica ogni 30 secondi
setInterval(() => {
  const now = Date.now();
  for (const token in validTokens) {
    if (validTokens[token].expiresAt < now) {
      delete validTokens[token];
    }
  }
}, 30 * 1000);

// ✅ Auto-chiude turni rimasti aperti dopo 24h con cappatura corretta
setInterval(autoCloseStaleShifts, 60 * 60 * 1000); // ogni ora

/* -------------------------------------------------------------------------- */
/*                             EXPORT ADMIN (Excel)                           */
/* -------------------------------------------------------------------------- */

router.get('/export-oggi', requireAuth, allowRoles('admin'), exportOggiHandler);
router.get('/export', requireAuth, allowRoles('admin'), exportHandler);
// Libro paga del mese (base precompilata): ?mese=AAAA-MM&sede=…&societa=…
router.get('/libro-paga', requireAuth, allowRoles('admin'), exportLibroPagaHandler);

/* -------------------------------------------------------------------------- */
/*                           ROUTE TEAM LEADER                                */
/* -------------------------------------------------------------------------- */

router.get('/tl/oggi', requireAuth, requireTL, tlOggiHandler);
router.get('/tl/export-oggi', requireAuth, requireTL, tlExportOggiHandler);
router.get('/tl/export', requireAuth, requireTL, tlExportHandler);

/* -------------------------------------------------------------------------- */
/*                        QR CODE, TIMBRATURA, OGGI                           */
/* -------------------------------------------------------------------------- */

// Il QR mostrato a schermo ruota ogni 5s (vedi PaginaQR.js): questo impedisce
// di fotografarlo e condividerlo. Il token resta però valido 15s dopo la
// generazione, così una scansione legittima ha tempo di completare il giro
// (rete + verifica auth + query DB) senza scadere. I token non vengono
// cancellati alla rotazione: restano validi fino alla scadenza o all'uso.
const TOKEN_TTL_MS = 15 * 1000;

const QR_VIEWER_EMAIL = 'qrcode@clockeasy.it';

router.get('/qr', requireAuth, async (req, res) => {
  const ruolo = req.user.ruolo;
  const email = (req.user.email || '').toLowerCase();
  const autorizzato = ruolo === 'admin' || email === QR_VIEWER_EMAIL;
  if (!autorizzato) {
    return res.status(403).json({ error: 'Non autorizzato a visualizzare il QR code' });
  }

  const token = generateToken();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  validTokens[token] = { expiresAt };

  const qrPayload = JSON.stringify({ token });
  const qrImage = await QRCode.toDataURL(qrPayload);

  res.json({ image: qrImage, token });
});

router.post('/timbratura', requireAuth, async (req, res) => {
  const { token } = req.body;

  const record = validTokens[token];
  if (!record || Date.now() > record.expiresAt) {
    return res.status(400).json({ error: 'Token scaduto o non valido' });
  }

  delete validTokens[token]; // consumato: un token vale una sola timbratura

  const utente_id = req.user.id;
  if (!utente_id) {
    return res.status(401).json({ error: 'Utente non autenticato' });
  }

  try {
    const utenteRes = await pool.query(
      `SELECT tipo_contratto FROM utenti WHERE id = $1 LIMIT 1`,
      [utente_id]
    );

    if (utenteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const tipo_contratto = utenteRes.rows[0].tipo_contratto;
    const minutiPrevisti = getMinutiContratto(tipo_contratto);

    const now = new Date();
    const oggi = localDateStr(now);

    const lastShift = await pool.query(
      `SELECT * FROM presenze WHERE utente_id = $1 ORDER BY ora_entrata DESC LIMIT 1`,
      [utente_id]
    );

    const turnoAperto = lastShift.rows.length > 0 && lastShift.rows[0].ora_uscita === null
      ? lastShift.rows[0]
      : null;

    let action;

    if (!turnoAperto) {
      await pool.query(
        `INSERT INTO presenze (utente_id, data, ora_entrata) VALUES ($1, $2, $3)`,
        [utente_id, oggi, now]
      );
      action = 'entrata';
      console.log(`[timbratura] entrata utente=${utente_id} data=${oggi}`);
    } else {
      let oraUscitaFinale = now;

      if (minutiPrevisti > 0) {
        const cappata = await calcolaOraUscitaCappata(utente_id, turnoAperto, minutiPrevisti);
        if (cappata < now) {
          oraUscitaFinale = randomizzaUscitaCappata(cappata, new Date(turnoAperto.ora_entrata), now);
        }
      }

      await pool.query(
        `UPDATE presenze SET ora_uscita = $1, ora_uscita_reale = $2 WHERE id = $3`,
        [oraUscitaFinale, now, turnoAperto.id]
      );
      action = 'uscita';
      console.log(`[timbratura] uscita utente=${utente_id} turno_id=${turnoAperto.id}`);
    }

    const ora = now.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Rome',
    });

    return res.json({
      message: action === 'entrata' ? 'Entrata registrata' : 'Uscita registrata',
      action,
      ora,
    });
  } catch (e) {
    console.error(`[timbratura] errore DB utente=${utente_id}`, e);
    return res.status(500).json({ error: 'Timbratura non registrata, riprova' });
  }
});

router.patch('/uscita-anticipata', requireAuth, async (req, res) => {
  const utente_id = req.user.id;
  const { note } = req.body;

  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'La motivazione è obbligatoria' });
  }

  try {
    const lastShift = await pool.query(
      `SELECT * FROM presenze WHERE utente_id = $1 ORDER BY ora_entrata DESC LIMIT 1`,
      [utente_id]
    );

    const turnoAperto = lastShift.rows.length > 0 && lastShift.rows[0].ora_uscita === null
      ? lastShift.rows[0]
      : null;

    if (!turnoAperto) {
      return res.status(404).json({ error: 'Nessun turno aperto trovato' });
    }

    const now = new Date();
    await pool.query(
      `UPDATE presenze SET ora_uscita = $1, ora_uscita_reale = $1, note = $2 WHERE id = $3`,
      [now, String(note).trim(), turnoAperto.id]
    );

    console.log(`[uscita-anticipata] utente=${utente_id} turno_id=${turnoAperto.id}`);
    res.json({ message: 'Uscita anticipata registrata' });
  } catch (e) {
    console.error('[uscita-anticipata] errore DB', e);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.get('/oggi', requireAuth, async (req, res) => {
  const utente_id = req.user.id;

  if (!utente_id) {
    return res.status(401).json({ error: 'Non autenticato' });
  }

  const r = await pool.query(
    `SELECT ora_entrata, ora_uscita
       FROM presenze
      WHERE utente_id = $1
      ORDER BY ora_entrata DESC
      LIMIT 1`,
    [utente_id]
  );

  if (r.rows.length === 0 || r.rows[0].ora_uscita !== null) {
    return res.json({ ora_entrata: null, ora_uscita: null });
  }

  res.json(r.rows[0]);
});

/* -------------------------------------------------------------------------- */
/*                               RANGE PER APP                                */
/* -------------------------------------------------------------------------- */

router.get('/range', requireAuth, async (req, res) => {
  try {
    const { start, end } = req.query;
    const utente_id = req.user.id;

    if (!utente_id || !start || !end) {
      return res.status(400).json({ error: 'Parametri mancanti' });
    }
    const q = await pool.query(
      `SELECT to_char(data,'YYYY-MM-DD') AS d, ora_entrata, ora_uscita
         FROM presenze
        WHERE utente_id = $1 AND data BETWEEN $2 AND $3
        ORDER BY data ASC`,
      [utente_id, start, end]
    );
    const byDate = {};
    q.rows.forEach(r => { byDate[r.d] = { in: r.ora_entrata, out: r.ora_uscita }; });
    res.json({ byDate });
  } catch (e) {
    console.error('range presenze', e);
    res.status(500).json({ error: 'Errore lettura presenze' });
  }
});

module.exports = router;
