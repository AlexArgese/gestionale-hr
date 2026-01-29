// backend/routes/wb_attachments.js
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { allowRoles } = require('../middleware/rbac');
const { pathForAttachment, storageKey, filePathFromStorageKey } = require('../lib/files');
const { scanAndUpdate, MODE } = require('../lib/av');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
const router = express.Router();

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest(); }
function sanitizeName(name) {
  return String(name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/[\u0000-\u001f]/g, '_')
    .slice(0, 180);
}

/* =============== ANON: LIST/UPLOAD/DOWNLOAD =============== */

// lista allegati visibili al segnalante (solo clean)
router.get('/anon/attachments/:protocol/:token', async (req, res) => {
  try {
    const { protocol, token } = req.params;
    const tokenHash = crypto.createHash('blake2b512').update(token).digest();

    const r = await pool.query(`SELECT id FROM wb_reports WHERE protocol_code=$1`, [protocol]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    const reportId = r.rows[0].id;

    const valid = await pool.query(
      `SELECT 1 FROM wb_reply_tokens WHERE report_id=$1 AND token_hash=$2 AND expires_at > now()`,
      [reportId, tokenHash]
    );
    if (!valid.rowCount) return res.status(403).json({ error: 'Invalid token' });

    const rows = await pool.query(
      `SELECT id, filename, mime_type, size_bytes, av_status, created_at
       FROM wb_attachments WHERE report_id=$1 AND av_status='clean' ORDER BY created_at ASC`,
      [reportId]
    );
    return res.json({ attachments: rows.rows });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// upload allegato dal segnalante (attendiamo lo scan se abilitato)
router.post('/anon/attachments/:protocol/:token', upload.single('file'), async (req, res) => {
  try {
    const { protocol, token } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Missing file' });

    const tokenHash = crypto.createHash('blake2b512').update(token).digest();
    const r = await pool.query(`SELECT id FROM wb_reports WHERE protocol_code=$1`, [protocol]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    const reportId = r.rows[0].id;

    const valid = await pool.query(
      `SELECT 1 FROM wb_reply_tokens WHERE report_id=$1 AND token_hash=$2 AND expires_at > now()`,
      [reportId, tokenHash]
    );
    if (!valid.rowCount) return res.status(403).json({ error: 'Invalid token' });

    const filename = sanitizeName(file.originalname);
    const mime = file.mimetype || 'application/octet-stream';
    const size = file.size;
    const sum = sha256(file.buffer);

    const ins = await pool.query(
      `INSERT INTO wb_attachments (report_id, filename, mime_type, storage_key, size_bytes, sha256, av_status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
      [reportId, filename, mime, 'temp', size, sum]
    );
    const attachmentId = ins.rows[0].id;

    const { file: abs } = pathForAttachment(reportId, attachmentId);
    fs.writeFileSync(abs, file.buffer);

    await pool.query(`UPDATE wb_attachments SET storage_key=$1 WHERE id=$2`,
      [storageKey(reportId, attachmentId), attachmentId]
    );

    // ATTENDI lo scan se abilitato
    let status = 'pending';
    if (MODE !== 'disabled') status = await scanAndUpdate(reportId, attachmentId, abs);

    return res.json({ id: attachmentId, av_status: status });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// download per segnalante (solo CLEAN)
router.get('/anon/attachments/:protocol/:token/:attachmentId', async (req, res) => {
  try {
    const { protocol, token, attachmentId } = req.params;
    const tokenHash = crypto.createHash('blake2b512').update(token).digest();

    const r = await pool.query(`SELECT id FROM wb_reports WHERE protocol_code=$1`, [protocol]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    const reportId = r.rows[0].id;

    const valid = await pool.query(
      `SELECT 1 FROM wb_reply_tokens WHERE report_id=$1 AND token_hash=$2 AND expires_at > now()`,
      [reportId, tokenHash]
    );
    if (!valid.rowCount) return res.status(403).json({ error: 'Invalid token' });

    const a = await pool.query(
      `SELECT id, filename, mime_type, storage_key, av_status FROM wb_attachments
       WHERE id=$1 AND report_id=$2`,
      [attachmentId, reportId]
    );
    if (!a.rowCount) return res.status(404).json({ error: 'Not found' });
    if (a.rows[0].av_status !== 'clean') return res.status(403).json({ error: 'Not available yet' });

    const abs = filePathFromStorageKey(a.rows[0].storage_key);
    res.setHeader('Content-Type', a.rows[0].mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${a.rows[0].filename}"`);
    fs.createReadStream(abs).pipe(res);
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =============== REPORTER AUTENTICATO (NOMINATIVO): LIST/UPLOAD/DOWNLOAD =============== */

// LIST: allegati del proprio report (solo CLEAN)
router.get('/my/reports/:id/attachments', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id; // assicurati che req.user.id sia valorizzato dal middleware auth

    // verifica ownership del report
    const own = await pool.query(
      `SELECT 1 FROM wb_reports WHERE id=$1 AND reporter_user_id=$2`,
      [id, uid]
    );
    if (!own.rowCount) return res.status(403).json({ error: 'Forbidden' });

    const rows = await pool.query(
      `SELECT id, filename, mime_type, size_bytes, av_status, created_at
       FROM wb_attachments
       WHERE report_id=$1 AND av_status='clean'
       ORDER BY created_at ASC`,
      [id]
    );
    return res.json({ attachments: rows.rows });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// UPLOAD: un allegato sul proprio report (attende lo scan)
router.post('/my/reports/:id/attachments', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Missing file' });

    // verifica ownership
    const own = await pool.query(
      `SELECT 1 FROM wb_reports WHERE id=$1 AND reporter_user_id=$2`,
      [id, uid]
    );
    if (!own.rowCount) return res.status(403).json({ error: 'Forbidden' });

    const filename = sanitizeName(file.originalname);
    const mime = file.mimetype || 'application/octet-stream';
    const size = file.size;
    const sum = sha256(file.buffer);

    const ins = await pool.query(
      `INSERT INTO wb_attachments (report_id, filename, mime_type, storage_key, size_bytes, sha256, av_status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
      [id, filename, mime, 'temp', size, sum]
    );
    const attachmentId = ins.rows[0].id;

    const { file: abs } = pathForAttachment(id, attachmentId);
    fs.writeFileSync(abs, file.buffer);

    await pool.query(
      `UPDATE wb_attachments SET storage_key=$1 WHERE id=$2`,
      [storageKey(id, attachmentId), attachmentId]
    );

    let status = 'pending';
    if (MODE !== 'disabled') status = await scanAndUpdate(id, attachmentId, abs);

    return res.json({ id: attachmentId, av_status: status });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// DOWNLOAD: allegato del proprio report (solo CLEAN)
router.get('/my/reports/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    const uid = req.user.id;

    // verifica ownership del report
    const own = await pool.query(
      `SELECT 1 FROM wb_reports WHERE id=$1 AND reporter_user_id=$2`,
      [id, uid]
    );
    if (!own.rowCount) return res.status(403).json({ error: 'Forbidden' });

    // carica allegato e consenti solo CLEAN
    const a = await pool.query(
      `SELECT filename, mime_type, storage_key, av_status
       FROM wb_attachments WHERE id=$1 AND report_id=$2`,
      [attachmentId, id]
    );
    if (!a.rowCount) return res.status(404).json({ error: 'Not found' });
    if (a.rows[0].av_status !== 'clean') return res.status(403).json({ error: 'Not available yet' });

    const abs = filePathFromStorageKey(a.rows[0].storage_key);
    res.setHeader('Content-Type', a.rows[0].mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${a.rows[0].filename}"`);
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});


/* =============== MANAGER: LIST/UPLOAD/DOWNLOAD/RESCAN/SELFTEST =============== */

router.use('/manager', requireAuth, allowRoles('wb_manager'));

// list allegati di un report
router.get('/manager/reports/:id/attachments', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await pool.query(
      `SELECT id, filename, mime_type, size_bytes, av_status, created_at
       FROM wb_attachments WHERE report_id=$1 ORDER BY created_at ASC`,
      [id]
    );
    return res.json({ attachments: rows.rows });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// upload allegato del manager (attendiamo lo scan)
router.post('/manager/reports/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Missing file' });

    const filename = sanitizeName(file.originalname);
    const mime = file.mimetype || 'application/octet-stream';
    const size = file.size;
    const sum = sha256(file.buffer);

    const ins = await pool.query(
      `INSERT INTO wb_attachments (report_id, filename, mime_type, storage_key, size_bytes, sha256, av_status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
      [id, filename, mime, 'temp', size, sum]
    );
    const attachmentId = ins.rows[0].id;

    const { file: abs } = pathForAttachment(id, attachmentId);
    fs.writeFileSync(abs, file.buffer);

    await pool.query(`UPDATE wb_attachments SET storage_key=$1 WHERE id=$2`,
      [storageKey(id, attachmentId), attachmentId]
    );

    let status = 'pending';
    if (MODE !== 'disabled') status = await scanAndUpdate(id, attachmentId, abs);

    return res.json({ id: attachmentId, av_status: status });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// download manager (sempre consentito)
router.get('/manager/attachments/:attachmentId/download', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const a = await pool.query(
      `SELECT report_id, filename, mime_type, storage_key FROM wb_attachments WHERE id=$1`,
      [attachmentId]
    );
    if (!a.rowCount) return res.status(404).json({ error: 'Not found' });
    const abs = filePathFromStorageKey(a.rows[0].storage_key);
    res.setHeader('Content-Type', a.rows[0].mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${a.rows[0].filename}"`);
    fs.createReadStream(abs).pipe(res);
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// RESCAN manuale
router.post('/manager/attachments/:attachmentId/rescan', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const a = await pool.query(
      `SELECT report_id, storage_key FROM wb_attachments WHERE id=$1`,
      [attachmentId]
    );
    if (!a.rowCount) return res.status(404).json({ error: 'Not found' });
    const reportId = a.rows[0].report_id;
    const abs = filePathFromStorageKey(a.rows[0].storage_key);
    const status = await scanAndUpdate(reportId, attachmentId, abs);
    res.json({ id: attachmentId, av_status: status });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// SELFTEST AV (crea file temp e lo scansiona) – utile per diagnosi
router.get('/manager/av/selftest', async (req, res) => {
  try {
    const os = require('os'), path = require('path'), fs = require('fs');
    const tmp = path.join(os.tmpdir(), `wb-selftest-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'hello');
    const status = await scanAndUpdate('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', tmp);
    fs.unlinkSync(tmp);
    res.json({ mode: MODE, status });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// delete manager (rimuove file e record)
router.delete('/manager/attachments/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;

    const a = await pool.query(
      `SELECT report_id, storage_key FROM wb_attachments WHERE id=$1`,
      [attachmentId]
    );
    if (!a.rowCount) return res.status(404).json({ error: 'Not found' });

    const abs = filePathFromStorageKey(a.rows[0].storage_key);

    // prova a cancellare file, ma non fallire se non esiste
    try { fs.unlinkSync(abs); } catch {}

    await pool.query(`DELETE FROM wb_attachments WHERE id=$1`, [attachmentId]);

    return res.json({ ok: true, id: attachmentId });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
