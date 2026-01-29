// backend/routes/wb.js
const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { encryptJson, decryptToJson } = require('../lib/crypto');
const { getWbManagerId, getWbManagerEmail } = require('../lib/wbManager');
const { safeSendMail } = require('../lib/notifier');
const { createReportLimiter, anonMessageLimiter } = require('../middleware/wb_rate_limit');
const requireAuth = require('../middleware/requireAuth');
const { allowRoles } = require('../middleware/rbac');
const router = express.Router();

function generateProtocol() {
  const y = new Date().getFullYear();
  const num = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  return `WB-${y}-${num}`;
}

const resolveRecipients = async () => {
  const override = (process.env.WB_NOTIFY_TO || '').trim();
  if (override) {
    return override.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [await getWbManagerEmail()];
};


/* ───────────── CREA SEGNALAZIONE ANONIMA ───────────── */
router.post('/anon/reports', createReportLimiter, async (req, res) => {
  try {
    const { title, description, categoryId, policyAccepted } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Missing fields' });
    if (policyAccepted !== true) return res.status(400).json({ error: 'Policy must be accepted' });

    const protocol = generateProtocol();
    const enc = encryptJson({ description });
    const managerId = await getWbManagerId();

    let catId = null;
    if (Number.isInteger(categoryId)) {
      const chk = await pool.query('SELECT id FROM wb_categories WHERE id=$1 AND is_active=true', [categoryId]);
      if (chk.rows.length) catId = categoryId;
    }

    const policyVersion = process.env.WB_POLICY_VERSION || 'v1';

    const ins = await pool.query(
      `INSERT INTO wb_reports
         (protocol_code, title, description_encrypted, is_anonymous, reporter_user_id,
          status, manager_id, category_id, acknowledged_at, policy_accepted, policy_version)
       VALUES ($1,$2,$3,true,NULL,'submitted',$4,$5,now(),$6,$7)
       RETURNING id, protocol_code`,
      [protocol, title, enc, managerId, catId, true, policyVersion]
    );
    const reportId = ins.rows[0].id;

    const replyToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('blake2b512').update(replyToken).digest();
    await pool.query(
      `INSERT INTO wb_reply_tokens (token_hash, report_id, expires_at)
       VALUES ($1,$2, now() + interval '180 days')`,
      [tokenHash, reportId]
    );

    await pool.query(
      `INSERT INTO wb_audit (report_id, actor_role, action, meta)
       VALUES ($1,'reporter','CREATED',$2)`,
      [reportId, { protocol, category_id: catId, policy_version: policyVersion }]
    );

    // Notifica email (best effort)
    try {
      const to = await resolveRecipients();
      const subject = `[WB] Nuova segnalazione ${protocol}`;
      const text =
`È stata inviata una nuova segnalazione anonima.

Protocollo: ${protocol}
Titolo: ${title}
Categoria: ${catId ?? '(nessuna)'}
Data: ${new Date().toISOString()}

Accedi al pannello avvocato e cerca per protocollo.`;
      await safeSendMail({ to, subject, text, replyTo: process.env.WB_MAIL_REPLY_TO });
    } catch (_) {}

    res.json({ protocol, replyToken });
  } catch (e) {
    console.error('wb create error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───────────── THREAD ANONIMO (READ) ───────────── */
router.get('/anon/thread/:protocol/:token', async (req, res) => {
  try {
    const { protocol, token } = req.params;
    const tokenHash = crypto.createHash('blake2b512').update(token).digest();

    const r = await pool.query(`SELECT * FROM wb_reports WHERE protocol_code=$1`, [protocol]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    const report = r.rows[0];

    const valid = await pool.query(
      `SELECT 1 FROM wb_reply_tokens WHERE report_id=$1 AND token_hash=$2 AND expires_at > now()`,
      [report.id, tokenHash]
    );
    if (!valid.rowCount) return res.status(403).json({ error: 'Invalid token' });

    const description = report.description_encrypted
      ? (decryptToJson(report.description_encrypted).description || '')
      : '';

    const { rows: msgs } = await pool.query(
      `SELECT sender_role, body_encrypted, created_at
       FROM wb_messages WHERE report_id=$1 ORDER BY created_at ASC`,
      [report.id]
    );
    const messages = msgs.map(m => ({
      sender: m.sender_role,
      body: decryptToJson(m.body_encrypted).body,
      created_at: m.created_at
    }));

    res.json({
      protocol: report.protocol_code,
      title: report.title,
      description,
      status: report.status,
      messages
    });
  } catch (e) {
    console.error('wb thread read error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───────────── THREAD ANONIMO (POST) ───────────── */
router.post('/anon/thread/:protocol/:token', anonMessageLimiter, async (req, res) => {
  try {
    const { protocol, token } = req.params;
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'Missing body' });

    const tokenHash = crypto.createHash('blake2b512').update(token).digest();

    const r = await pool.query(`SELECT id, first_response_at, title FROM wb_reports WHERE protocol_code=$1`, [protocol]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    const report = r.rows[0];

    const valid = await pool.query(
      `SELECT 1 FROM wb_reply_tokens WHERE report_id=$1 AND token_hash=$2 AND expires_at > now()`,
      [report.id, tokenHash]
    );
    if (!valid.rowCount) return res.status(403).json({ error: 'Invalid token' });

    const enc = encryptJson({ body });
    await pool.query(
      `INSERT INTO wb_messages (report_id, sender_role, body_encrypted)
       VALUES ($1,'reporter',$2)`,
      [report.id, enc]
    );

    await pool.query(
      `INSERT INTO wb_audit (report_id, actor_role, action) VALUES ($1,'reporter','MESSAGE_SENT')`,
      [report.id]
    );

    // Notifica email (best effort)
    try {
      const to = await resolveRecipients();
      const subject = `[WB] Nuovo messaggio segnalante su ${protocol}`;
      const text =
`Nuovo messaggio dal segnalante sul caso ${protocol}.
Titolo: ${report.title}
Data: ${new Date().toISOString()}

Apri il caso nel pannello avvocato.`;
      await safeSendMail({ to, subject, text, replyTo: process.env.WB_MAIL_REPLY_TO });
    } catch (_) {}

    res.json({ success: true });
  } catch (e) {
    console.error('wb thread post error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// crea segnalazione NON anonima (dipendente loggato)
router.post('/reports', requireAuth, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Auth richiesta' });
    const { title, description, categoryId, policyAccepted } = req.body;
    if (!policyAccepted) return res.status(400).json({ error: 'policy_not_accepted' });
    if (!title || !description) return res.status(400).json({ error: 'Missing fields' });

    const protocol = generateProtocol();
    const enc = encryptJson({ description });
    const managerId = await getWbManagerId();

    let catId = null;
    if (Number.isInteger(categoryId)) {
      const chk = await pool.query('SELECT id FROM wb_categories WHERE id=$1 AND is_active=true', [categoryId]);
      if (chk.rows.length) catId = categoryId;
    }

    const { rows } = await pool.query(
      `INSERT INTO wb_reports
         (protocol_code, title, description_encrypted, is_anonymous, reporter_user_id,
          manager_id, status, category_id, acknowledged_at)
       VALUES ($1,$2,$3,false,$4,$5,'submitted',$6, now())
       RETURNING id, protocol_code`,
      [protocol, title, enc, req.user.id, managerId, catId]
    );

    // notifica email (riusa resolveRecipients che hai aggiunto)
    try {
      const { sendNewReportEmail } = require('../lib/wbMailer');
      await sendNewReportEmail({
        protocol,
        title,
        isAnonymous: false,
        categoryId: catId,
      });
    } catch (e) { console.warn('WB mail (non anonima) errore:', e.message); }

    return res.json({ reportId: rows[0].id, protocol: rows[0].protocol_code });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// lista delle MIE segnalazioni
router.get('/my/reports', requireAuth, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Auth richiesta' });
    const { rows } = await pool.query(
      `SELECT id, protocol_code, title, status, created_at, last_update
         FROM wb_reports
        WHERE is_anonymous=false AND reporter_user_id=$1
        ORDER BY last_update DESC`,
      [req.user.id]
    );
    res.json({ reports: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// dettaglio + thread della MIA segnalazione
router.get('/my/reports/:id', requireAuth, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Auth richiesta' });
    const { id } = req.params;
    const rep = await pool.query(
      `SELECT id, protocol_code, title, description_encrypted, is_anonymous,
              reporter_user_id, created_at, status, category_id, last_update
         FROM wb_reports
        WHERE id=$1 AND reporter_user_id=$2 AND is_anonymous=false`,
      [id, req.user.id]
    );
    if (!rep.rows.length) return res.status(404).json({ error: 'Not found' });

    const report = rep.rows[0];
    const dec = decryptToJson(report.description_encrypted);
    const msgs = await pool.query(
      `SELECT sender_role, body_encrypted, created_at
         FROM wb_messages WHERE report_id=$1 ORDER BY created_at ASC`,
      [id]
    );
    const messages = msgs.rows.map(r => ({
      sender: r.sender_role,
      body: decryptToJson(r.body_encrypted).body,
      created_at: r.created_at
    }));

    res.json({
      report: {
        ...report,
        description: dec.description
      },
      messages
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// invia messaggio sul MIO thread
router.post('/my/reports/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Auth richiesta' });
    const { id } = req.params;
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Body mancante' });

    const chk = await pool.query(
      `SELECT id FROM wb_reports WHERE id=$1 AND reporter_user_id=$2 AND is_anonymous=false`,
      [id, req.user.id]
    );
    if (!chk.rows.length) return res.status(404).json({ error: 'Not found' });

    const enc = encryptJson({ body });
    await pool.query(
      `INSERT INTO wb_messages (report_id, sender_role, body_encrypted)
       VALUES ($1,'reporter',$2)`,
      [id, enc]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/manager/reports/:id', requireAuth, allowRoles('wb_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    // prendo il report di cui QUESTO manager è responsabile
    const rep = await pool.query(
      `SELECT r.id, r.protocol_code, r.title, r.description_encrypted, r.is_anonymous,
              r.reporter_user_id, r.created_at, r.status, r.category_id,
              r.acknowledged_at, r.first_response_at, r.closed_at, r.last_update,
              u.nome AS reporter_nome, u.cognome AS reporter_cognome, u.email AS reporter_email
         FROM wb_reports r
         LEFT JOIN utenti u ON u.id = r.reporter_user_id
        WHERE r.id = $1 AND r.manager_id = $2`,
      [id, req.user.id]   // il manager vede solo i “suoi” report
    );
    if (!rep.rows.length) return res.status(404).json({ error: 'Not found' });

    const r = rep.rows[0];
    const dec = decryptToJson(r.description_encrypted);

    // messaggi
    const msgs = await pool.query(
      `SELECT sender_role, body_encrypted, created_at
         FROM wb_messages
        WHERE report_id = $1
        ORDER BY created_at ASC`,
      [id]
    );
    const messages = msgs.rows.map((m) => ({
      sender: m.sender_role,
      body: decryptToJson(m.body_encrypted).body,
      created_at: m.created_at
    }));

    // costruisco il payload “report”
    const report = {
      id: r.id,
      protocol_code: r.protocol_code,
      title: r.title,
      description: dec.description,
      is_anonymous: r.is_anonymous,
      reporter_user_id: r.is_anonymous ? null : r.reporter_user_id, // resta null se anonima
      created_at: r.created_at,
      status: r.status,
      category_id: r.category_id,
      acknowledged_at: r.acknowledged_at,
      first_response_at: r.first_response_at,
      closed_at: r.closed_at,
      last_update: r.last_update,
      // SOLO se NON anonima espongo i dati del segnalante
      reporter: r.is_anonymous
        ? null
        : {
            id: r.reporter_user_id,
            full_name: [r.reporter_nome, r.reporter_cognome].filter(Boolean).join(' ').trim(),
            email: r.reporter_email
          }
    };

    return res.json({ report, messages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
