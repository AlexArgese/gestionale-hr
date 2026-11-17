/**
 * backend/services/comunicazioni/attachments.js
 * Risoluzione/serving degli allegati delle comunicazioni (filesystem legacy + S3)
 * e handler delle rotte GET /:id/view, /:id/download, /attachments/:id/view,
 * /attachments/:id/download di /backend/routes/comunicazioni.js.
 */
const path = require('path');
const fs = require('fs');
const pool = require('../../db');
const { urlFirmatoGet, esisteSuS3 } = require('../../lib/s3');

function resolveComunicazioneAttachmentPath(fileUrl) {
  if (!fileUrl) return null;

  let rel = String(fileUrl).trim();

  if (/^https?:\/\//i.test(rel)) {
    try {
      rel = new URL(rel).pathname || rel;
    } catch {
      // lascio invariato se non e' una URL valida
    }
  }

  rel = decodeURIComponent(rel).replace(/\\/g, '/').replace(/^\/+/, '');

  const uploadsIdx = rel.indexOf('uploads/');
  if (uploadsIdx >= 0) rel = rel.slice(uploadsIdx);

  const candidates = [rel];
  if (rel.startsWith('upload/')) candidates.push(`uploads/${rel.slice('upload/'.length)}`);
  if (rel.startsWith('uploads/')) candidates.push(`upload/${rel.slice('uploads/'.length)}`);

  for (const candidate of candidates) {
    const abs = path.join(__dirname, '..', '..', candidate);
    if (fs.existsSync(abs)) return abs;
  }

  return path.join(__dirname, '..', '..', rel);
}

function normalizzaChiaveS3(pathDb) {
  if (!pathDb) return null;

  let key = String(pathDb).trim();

  if (/^https?:\/\//i.test(key)) {
    try {
      key = new URL(key).pathname || key;
    } catch {
      return key;
    }
  }

  key = decodeURIComponent(key).replace(/\\/g, '/').replace(/^\/+/, '');
  if (key.startsWith('s3://')) return key.replace('s3://', '');
  if (key.startsWith('upload/')) return `uploads/${key.slice('upload/'.length)}`;
  return key;
}

function creaChiaveComunicazioneS3({ comunicazioneId, nomeFile }) {
  const safeName = String(nomeFile || 'allegato')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_');

  return `uploads/comunicazioni/${Number(comunicazioneId) || 0}/${Date.now()}_${safeName}`;
}

async function sendComunicazioneAttachment({ res, fileUrl, mime = null, inline = true }) {
  const abs = resolveComunicazioneAttachmentPath(fileUrl);
  if (abs && fs.existsSync(abs)) {
    if (!mime) {
      const ext = path.extname(abs).toLowerCase();
      if (ext === '.pdf') mime = 'application/pdf';
      else if (ext === '.png') mime = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
      else if (ext === '.webp') mime = 'image/webp';
      else if (ext === '.gif') mime = 'image/gif';
      else mime = 'application/octet-stream';
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${path.basename(abs).replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'no-store');

    return inline ? res.sendFile(abs) : res.download(abs);
  }

  const chiave = normalizzaChiaveS3(fileUrl);
  if (!chiave) return res.status(404).send('File non trovato');

  const presenteSuS3 = await esisteSuS3({ chiave });
  if (!presenteSuS3) {
    return res.status(404).send('Allegato non disponibile: file non presente su S3');
  }

  const signedUrl = await urlFirmatoGet({
    chiave,
    scadeSecondi: 120,
    nomeDownload: path.basename(chiave),
    inline,
  });

  return res.redirect(signedUrl);
}

/* =========================================================
   GET preview allegato (inline) - primo allegato (attachments) o legacy
   GET /comunicazioni/:id/view
   ========================================================= */
async function viewHandler(req, res) {
  try {
    // 1) Prima prova dalla tabella comunicazione_attachments (primo allegato)
    const a = await pool.query(
      `SELECT file_url, mime_type
       FROM comunicazione_attachments
       WHERE comunicazione_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [req.params.id]
    );

    let rel = null;
    let mime = null;

    if (a.rows.length) {
      rel = a.rows[0].file_url;
      mime = a.rows[0].mime_type || null;
    } else {
      // 2) Fallback legacy: campo allegato_url su comunicazioni
      const c = await pool.query(
        `SELECT allegato_url FROM comunicazioni WHERE id = $1`,
        [req.params.id]
      );
      rel = c.rows[0]?.allegato_url || null;
    }

    if (!rel) return res.status(404).send('File non trovato');

    return await sendComunicazioneAttachment({ res, fileUrl: rel, mime, inline: true });
  } catch (err) {
    console.error('GET /comunicazioni/:id/view', err);
    res.status(500).json({ error: 'Errore preview' });
  }
}

/* =========================================================
   GET download allegato singolo (legacy + fallback su attachments)
   GET /comunicazioni/:id/download
   ========================================================= */
async function downloadHandler(req, res) {
  try {
    // Prima prova dalla tabella comunicazione_attachments (primo allegato)
    const a = await pool.query(
      `SELECT file_url
       FROM comunicazione_attachments
       WHERE comunicazione_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [req.params.id]
    );
    if (a.rows.length) {
      return await sendComunicazioneAttachment({ res, fileUrl: a.rows[0].file_url, inline: false });
    }

    // Fallback: campo legacy allegato_url su "comunicazioni"
    const result = await pool.query(
      `SELECT allegato_url FROM comunicazioni WHERE id = $1`,
      [req.params.id]
    );
    const rel = result.rows[0]?.allegato_url;
    if (!rel) return res.status(404).send('File non trovato');

    return await sendComunicazioneAttachment({ res, fileUrl: rel, inline: false });
  } catch (err) {
    console.error('GET /comunicazioni/:id/download', err);
    res.status(500).json({ error: 'Errore download' });
  }
}

/* =========================================================
   GET preview singolo attachment by attachment id
   GET /comunicazioni/attachments/:attachmentId/view
   ========================================================= */
async function attachmentViewHandler(req, res) {
  try {
    const attId = Number(req.params.attachmentId);
    if (!Number.isInteger(attId) || attId <= 0) {
      return res.status(400).json({ error: 'Attachment ID non valido' });
    }

    const a = await pool.query(
      `SELECT file_url, mime_type
       FROM comunicazione_attachments
       WHERE id = $1
       LIMIT 1`,
      [attId]
    );

    if (!a.rows.length) return res.status(404).send('File non trovato');

    const rel = a.rows[0].file_url;
    let mime = a.rows[0].mime_type || null;

    return await sendComunicazioneAttachment({ res, fileUrl: rel, mime, inline: true });
  } catch (err) {
    console.error('GET /comunicazioni/attachments/:attachmentId/view', err);
    res.status(500).json({ error: 'Errore preview allegato' });
  }
}

/* =========================================================
   GET download singolo attachment by attachment id
   GET /comunicazioni/attachments/:attachmentId/download
   ========================================================= */
async function attachmentDownloadHandler(req, res) {
  try {
    const attId = Number(req.params.attachmentId);
    if (!Number.isInteger(attId) || attId <= 0) {
      return res.status(400).json({ error: 'Attachment ID non valido' });
    }

    const a = await pool.query(
      `SELECT file_url
       FROM comunicazione_attachments
       WHERE id = $1
       LIMIT 1`,
      [attId]
    );

    if (!a.rows.length) return res.status(404).send('File non trovato');

    return await sendComunicazioneAttachment({ res, fileUrl: a.rows[0].file_url, inline: false });
  } catch (err) {
    console.error('GET /comunicazioni/attachments/:attachmentId/download', err);
    res.status(500).json({ error: 'Errore download allegato' });
  }
}

module.exports = {
  resolveComunicazioneAttachmentPath,
  normalizzaChiaveS3,
  creaChiaveComunicazioneS3,
  sendComunicazioneAttachment,
  viewHandler,
  downloadHandler,
  attachmentViewHandler,
  attachmentDownloadHandler,
};
