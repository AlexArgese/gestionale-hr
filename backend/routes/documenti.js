/**
 * /backend/routes/documenti.js — upload, lista, download, delete, tipi
 * + NEW: upload-multi, split, merge (pdf-lib)
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { PDFDocument } = require('pdf-lib');
const requireAuth = require('../middleware/requireAuth');
const mime = require('mime-types');

/* ---------- Multer ---------- */
const storage = multer.diskStorage({
  destination(_, __, cb) {
    const dir = path.join(__dirname, '../uploads/documenti');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_, file, cb) {
    const ts   = Date.now();
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, `${base}_${ts}${ext}`);
  },
});
const uploadSingle  = multer({ storage }).single('file');
const uploadManyPdf = multer({ storage }).array('files', 20);
const yousignClient = require('../services/yousignClient');


/* ==================================================================== */
/*  Helpers                                                             */
/* ==================================================================== */

/** normalizza il tipo: trim + MAIUSCOLO */
function normalizeTipo(tipo) {
  return String(tipo || '').trim().toUpperCase();
}

/** valido = non vuoto dopo normalizzazione */
function validateTipo(tipo) {
  const norm = normalizeTipo(tipo);
  return norm.length > 0 && norm.length <= 100; // limite a piacere
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

async function insertDocumentoRows({ utenteIds, tipo, nome_file, relPath, caricato_da, data_scadenza, require_signature }) {
  const rows = [];
  for (const uid of utenteIds) {
    const r = await pool.query(
      `INSERT INTO documenti
         (utente_id, tipo_documento, nome_file, url_file, caricato_da, data_upload, data_scadenza, require_signature)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)
       RETURNING id, utente_id, nome_file, url_file, require_signature`,
      [uid, tipo, nome_file, relPath, caricato_da, data_scadenza || null, !!require_signature]
    );
    rows.push(r.rows[0]);
  }
  return rows;
}

function parseBool(v) {
  return v === true || v === "true" || v === 1 || v === "1" || v === "on";
}

async function startYousignForDocumento({ documentoId, utenteId, nomeFile, urlFile, signaturePlacement }) {
  // 1) dati utente (serve email)
  const u = await pool.query(
    `SELECT nome, cognome, email
       FROM utenti
      WHERE id = $1
      LIMIT 1`,
    [utenteId]
  );

  const user = u.rows[0];
  if (!user?.email) {
    await pool.query(
      `UPDATE documenti
         SET yousign_status = $1
       WHERE id = $2`,
      ["missing_email", documentoId]
    );
    return { ok: false, reason: "missing_email" };
  }

  // 2) path assoluto file
  const absPath = path.join(__dirname, "..", urlFile);
  if (!fs.existsSync(absPath)) {
    await pool.query(
      `UPDATE documenti
         SET yousign_status = $1
       WHERE id = $2`,
      ["file_not_found", documentoId]
    );
    return { ok: false, reason: "file_not_found" };
  }

  // 3) flow yousign
  const sr = await yousignClient.createSignatureRequest({
    name: `Firma documento: ${nomeFile}`,
    deliveryMode: "email",
  });

  const doc = await yousignClient.uploadDocumentToRequest(sr.id, absPath);

  const signer = await yousignClient.addSigner(sr.id, {
    firstName: user.nome || "Dipendente",
    lastName: user.cognome || "",
    email: user.email,
  });

  let field = signaturePlacement || null;

  if (field) {
    try {
      const pageNum = Number.isFinite(field.page)
        ? Math.max(1, Math.round(field.page))
        : Number.isFinite(field.pageIndex)
        ? Math.max(1, Math.round(field.pageIndex) + 1)
        : 1;

      // ✅ se arrivano percentuali, converti in px del preview (pageW/pageH)
      const hasPct =
        Number.isFinite(Number(field.xPct)) &&
        Number.isFinite(Number(field.yPct)) &&
        Number.isFinite(Number(field.wPct)) &&
        Number.isFinite(Number(field.hPct));

      if (hasPct) {
        const pageW = Number(field.pageW);
        const pageH = Number(field.pageH);
        if (Number.isFinite(pageW) && Number.isFinite(pageH) && pageW > 0 && pageH > 0) {
          field = {
            page: pageNum,
            pageW,
            pageH,
            x: Number(field.xPct) * pageW,
            y: Number(field.yPct) * pageH,      // ✅ TOP based
            width: Number(field.wPct) * pageW,
            height: Number(field.hPct) * pageH,
          };
        }
      } else {
        // vecchio formato assoluto
        const x = Number(field.x);
        const y = Number(field.y);
        const width = Number(field.width);
        const height = Number(field.height);
        field = {
          page: pageNum,
          x: Number.isFinite(x) ? x : undefined,
          y: Number.isFinite(y) ? y : undefined,
          width: Number.isFinite(width) ? width : undefined,
          height: Number.isFinite(height) ? height : undefined,
          pageW: Number(field.pageW),
          pageH: Number(field.pageH),
        };
      }

      // mapping preview(px) -> pdf(px) + flip Y (UNA VOLTA)
      if (Number.isFinite(field.pageW) && Number.isFinite(field.pageH)) {
        const pdfBytes = fs.readFileSync(absPath);
        const pdf = await PDFDocument.load(pdfBytes);
        const pageIdx = Math.min(Math.max(0, field.page - 1), pdf.getPageCount() - 1);
        const pdfPage = pdf.getPage(pageIdx);
        const { width: pdfW, height: pdfH } = pdfPage.getSize();

        const sx = pdfW / field.pageW;
        const sy = pdfH / field.pageH;

        if (Number.isFinite(field.x)) field.x = Math.round(field.x * sx);
        if (Number.isFinite(field.y)) field.y = Math.round(field.y * sy);
        if (Number.isFinite(field.width)) field.width = Math.round(field.width * sx);
        if (Number.isFinite(field.height)) field.height = Math.round(field.height * sy);

        if (Number.isFinite(field.height)) {
          field.height = Math.max(37, field.height);
        }
      }
    } catch (e) {
      console.warn("[Yousign] signature placement mapping failed:", e.message || e);
    }
  }

  await yousignClient.addSignatureField(sr.id, signer.id, doc.id, field);

  const activated = await yousignClient.activateSignatureRequest(sr.id);

  const signatureLink = activated?.signers?.[0]?.signature_link || null;
  const expiresAtStr = activated?.signers?.[0]?.signature_link_expiration_date || null;

  await pool.query(
    `UPDATE documenti
       SET yousign_signature_request_id = $1,
           yousign_document_id = $2,
           yousign_signer_id = $3,
           yousign_status = $4,
           yousign_signature_link = $5,
           yousign_signature_link_expires_at = $6
     WHERE id = $7`,
    [
      sr.id,
      doc.id,
      signer.id,
      activated.status,
      signatureLink,
      expiresAtStr ? new Date(expiresAtStr) : null,
      documentoId,
    ]
  );

  // 4) notifica app (qui ci agganciamo alla tua tabella comunicazioni)
  const { sendExpoPush } = require("../services/expoPush");

  async function notifyFirmaRichiesta(utenteId, documentoId, nomeFile) {
    const t = await pool.query("SELECT expo_token FROM push_tokens WHERE utente_id = $1", [utenteId]);
    const tokens = t.rows.map(r => r.expo_token);

    await sendExpoPush(tokens, {
      title: "Firma richiesta",
      body: `Devi firmare: ${nomeFile}`,
      data: { type: "SIGN_DOCUMENT", documentoId },
    });
  }
  await notifyFirmaRichiesta(utenteId, documentoId, nomeFile);


  return {
    ok: true,
    signatureRequestId: sr.id,
    status: activated.status,
  };
}

const SIGNED_DIR = path.join(__dirname, "..", "uploads", "documenti", "signed");
if (!fs.existsSync(SIGNED_DIR)) fs.mkdirSync(SIGNED_DIR, { recursive: true });

router.post("/:id/sync-signed", requireAuth, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isInteger(docId) || docId <= 0) {
      return res.status(400).json({ error: "ID documento non valido" });
    }

    const q = await pool.query(
      `SELECT id, nome_file, url_file,
              yousign_signature_request_id, yousign_document_id, yousign_status
         FROM documenti
        WHERE id = $1
        LIMIT 1`,
      [docId]
    );
    if (!q.rows.length) return res.status(404).json({ error: "Documento non trovato" });

    const d = q.rows[0];
    if (!d.yousign_signature_request_id || !d.yousign_document_id) {
      return res.status(400).json({ error: "Documento non collegato a Yousign" });
    }

    // (consigliato) verifica status SR prima del download
    const sr = await yousignClient.getSignatureRequest(d.yousign_signature_request_id);
    if (sr.status !== "done") {
      return res.status(409).json({ error: "Firma non completata", yousign_status: sr.status });
    }

    // scarica PDF firmato
    const pdfBuf = await yousignClient.downloadSignatureRequestDocument(
      d.yousign_signature_request_id,
      d.yousign_document_id
    );

    // path dell'originale (quello attualmente in url_file)
    const absOriginal = path.join(__dirname, "..", d.url_file);
    if (!fs.existsSync(absOriginal)) {
      return res.status(404).json({ error: "File originale non trovato sul server" });
    }

    // (opzionale ma consigliato) backup del non firmato
    const ORIGINAL_BACKUP_DIR = path.join(__dirname, "..", "uploads", "documenti", "original_backup");
    if (!fs.existsSync(ORIGINAL_BACKUP_DIR)) fs.mkdirSync(ORIGINAL_BACKUP_DIR, { recursive: true });

    const origBase = path.basename(absOriginal);
    const backupPath = path.join(ORIGINAL_BACKUP_DIR, `${docId}_ORIG_${Date.now()}_${origBase}`);
    fs.copyFileSync(absOriginal, backupPath);

    // ✅ sovrascrivi l'originale con il firmato
    fs.writeFileSync(absOriginal, pdfBuf);

    await pool.query(
      `UPDATE documenti
          SET signed_at = NOW(),
              yousign_status = 'done',
              url_file_signed = NULL
        WHERE id = $1`,
      [docId]
    );

    return res.json({
      ok: true,
      documentoId: docId,
      url_file: d.url_file,               // stesso path di prima
      replaced: true,
      backup_original: `uploads/documenti/original_backup/${path.basename(backupPath)}`
    });
  } catch (e) {
    console.error("sync-signed error:", e.response?.data || e);
    res.status(500).json({ error: "Errore sync firmato" });
  }
});


/* ==================================================================== */
/*  POST /documenti/upload (singolo — compatibilità)                     */
/* ==================================================================== */
router.post('/upload', requireAuth, (req, res) => {
  uploadSingle(req, res, async (err) => {
    try {
      if (err) throw err;
      if (!req.file) return res.status(400).json({ error: 'File mancante' });

      const { tipo_documento, data_scadenza } = req.body;
      const require_signature = parseBool(req.body.require_signature || req.body.requireSignature);
      let signaturePlacement = null;
      if (req.body.signature_placement || req.body.signaturePlacement) {
        try {
          signaturePlacement = JSON.parse(req.body.signature_placement || req.body.signaturePlacement);
        } catch {
          signaturePlacement = null;
        }
      }

      if (!validateTipo(tipo_documento)) {
        return res.status(400).json({ error: 'Tipo documento non valido' });
      }
      const tipoNorm = normalizeTipo(tipo_documento);

      const { targetUserId, autoreId } = await resolveTargetUserId(req);

      const relPath = `uploads/documenti/${req.file.filename}`;

      const inserted = await insertDocumentoRows({
        utenteIds: [targetUserId],
        tipo: tipoNorm,
        nome_file: req.file.originalname,
        relPath,
        caricato_da: autoreId,
        data_scadenza,
        require_signature,
      });

      // rispondo subito
      res.json({
        message: 'Documento caricato correttamente!',
        documentoId: inserted[0].id,
        require_signature: !!require_signature,
      });

      // fire-and-forget Yousign
      if (require_signature) {
        startYousignForDocumento({
          documentoId: inserted[0].id,
          utenteId: targetUserId,
          nomeFile: req.file.originalname,
          urlFile: relPath,
          signaturePlacement,
        }).catch((e) => {
          console.error("Yousign start failed (upload):", e.response?.data || e);
        });
      }
    } catch (e) {
      console.error('Errore upload documento:', e);
      const msg = e.message || 'Errore interno server';
      const code =
        msg === 'Utente non trovato' ? 404 :
        msg === 'utente_id richiesto' || msg === 'utente_id non valido' ? 400 :
        500;
      res.status(code).json({ error: msg });
    }
  });
});

/* ==================================================================== */
/*  POST /documenti/upload-multi — 1 file → molti utenti                 */
/* ==================================================================== */
router.post('/upload-multi', requireAuth, (req, res) => {
  uploadSingle(req, res, async (err) => {
    try {
      if (err) throw err;
      if (!req.file) return res.status(400).json({ error: 'File mancante' });

      const { tipo_documento, utente_ids, data_scadenza } = req.body;
      const require_signature = parseBool(req.body.require_signature || req.body.requireSignature);

      if (!validateTipo(tipo_documento)) {
        return res.status(400).json({ error: 'Tipo documento non valido' });
      }
      const tipoNorm = normalizeTipo(tipo_documento);

      let ids = [];
      try { ids = JSON.parse(utente_ids || '[]'); } catch(_) {}
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'utente_ids richiesto' });
      }

      // verifica che tutti gli id esistano
      const uniq = [...new Set(ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0))];
      if (uniq.length !== ids.length) {
        return res.status(400).json({ error: 'utente_ids non validi' });
      }
      const check = await pool.query('SELECT id FROM utenti WHERE id = ANY($1::int[])', [uniq]);
      if (check.rows.length !== uniq.length) {
        return res.status(404).json({ error: 'Alcuni utenti non esistono' });
      }

      const autoreId = await resolveAutoreId(req); // può essere null
      const relPath = `uploads/documenti/${req.file.filename}`;

      await insertDocumentoRows({
        utenteIds: uniq,
        tipo: tipoNorm,
        nome_file: req.file.originalname,
        relPath,
        caricato_da: autoreId,
        data_scadenza,
        require_signature,
      });

      res.json({ message: `Documento assegnato a ${uniq.length} dipendenti.` });
    } catch (e) {
      console.error('upload-multi:', e);
      res.status(500).json({ error: e.message || 'Errore interno server' });
    }
  });
});

/* ==================================================================== */
/*  POST /documenti/split — Dividi PDF per range e assegna               */
/* ==================================================================== */
router.post('/split', requireAuth, (req, res) => {
  uploadSingle(req, res, async (err) => {
    try {
      if (err) throw err;
      const { file } = req;
      if (!file) return res.status(400).json({ error: 'File mancante' });
      if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
        return res.status(400).json({ error: 'Lo split è disponibile solo per PDF' });
      }

      const { ranges, tipo_documento, utente_ids, data_scadenza } = req.body;
      const require_signature = parseBool(req.body.require_signature || req.body.requireSignature);

      if (!validateTipo(tipo_documento)) {
        return res.status(400).json({ error: 'Tipo documento non valido' });
      }
      const tipoNorm = normalizeTipo(tipo_documento);

      let ids = [];
      try { ids = JSON.parse(utente_ids || '[]'); } catch(_) {}
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'utente_ids richiesto' });
      }
      if (!ranges) return res.status(400).json({ error: 'ranges richiesto' });

      const absPath = path.join(__dirname, '..', 'uploads', 'documenti', file.filename);
      const pdfBytes = fs.readFileSync(absPath);
      const srcPdf = await PDFDocument.load(pdfBytes);
      const total = srcPdf.getPageCount();

      // parse ranges es: 1-2,3,4-6 -> [[1,2],[3,3],[4,6]]
      const parts = String(ranges)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(r => {
          const [a,b] = r.split('-').map(n => parseInt(n,10));
          const from = Math.max(1, a);
          const to   = Math.min(total, b ? b : a);
          if (Number.isNaN(from) || Number.isNaN(to) || from>to) throw new Error(`Range non valido: ${r}`);
          return [from, to];
        });

      const caricato_da = await resolveAutoreId(req);
      const base = path.basename(file.filename, path.extname(file.filename));

      for (let i=0; i<parts.length; i++) {
        const [from, to] = parts[i];
        const outPdf = await PDFDocument.create();
        const pages = await outPdf.copyPages(srcPdf, Array.from({length: to-from+1}, (_,k)=> from-1+k));
        pages.forEach(p => outPdf.addPage(p));
        const outBytes = await outPdf.save();

        const outName = `${base}_part${i+1}.pdf`;
        const relPath = `uploads/documenti/${outName}`;
        fs.writeFileSync(path.join(__dirname, '..', relPath), outBytes);

        await insertDocumentoRows({
          utenteIds: ids,
          tipo: tipoNorm,
          nome_file: `${file.originalname} (part ${i+1} ${from}-${to})`,
          relPath,
          caricato_da,
          data_scadenza,
          require_signature,
        });
      }

      res.json({ message: `Creati ${parts.length} documenti e assegnati a ${ids.length} dipendenti.` });
    } catch (e) {
      console.error('split:', e);
      res.status(500).json({ error: e.message || 'Errore interno server' });
    }
  });
});

/* ==================================================================== */
/*  POST /documenti/merge — Unisci più PDF e assegna                     */
/* ==================================================================== */
router.post('/merge', requireAuth, (req, res) => {
  uploadManyPdf(req, res, async (err) => {
    try {
      if (err) throw err;
      const files = req.files || [];
      if (files.length < 2) return res.status(400).json({ error: 'Seleziona almeno 2 PDF' });
      for (const f of files) {
        if (path.extname(f.originalname).toLowerCase() !== '.pdf') {
          return res.status(400).json({ error: 'Tutti i file devono essere PDF' });
        }
      }

      const { tipo_documento, utente_ids, data_scadenza } = req.body;
      const require_signature = parseBool(req.body.require_signature || req.body.requireSignature);

      if (!validateTipo(tipo_documento)) {
        return res.status(400).json({ error: 'Tipo documento non valido' });
      }
      const tipoNorm = normalizeTipo(tipo_documento);

      let ids = [];
      try { ids = JSON.parse(utente_ids || '[]'); } catch(_) {}
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'utente_ids richiesto' });
      }

      const merged = await PDFDocument.create();
      for (const f of files) {
        const bytes = fs.readFileSync(path.join(__dirname, '..', 'uploads', 'documenti', f.filename));
        const pdf   = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const mergedBytes = await merged.save();

      const firstBase = path.basename(files[0].filename, path.extname(files[0].filename));
      const outName = `${firstBase}_MERGED_${Date.now()}.pdf`;
      const relPath = `uploads/documenti/${outName}`;
      fs.writeFileSync(path.join(__dirname, '..', relPath), mergedBytes);

      const caricato_da = await resolveAutoreId(req);
      await insertDocumentoRows({
        utenteIds: ids,
        tipo: tipoNorm,
        nome_file: files.map(f=>f.originalname).join(' + '),
        relPath,
        caricato_da,
        data_scadenza,
        require_signature,
      });

      res.json({ message: `Documento unito e assegnato a ${ids.length} dipendenti.` });
    } catch (e) {
      console.error('merge:', e);
      res.status(500).json({ error: e.message || 'Errore interno server' });
    }
  });
});

/* ==================================================================== */
/*  GET /documenti/miei (mobile)                                         */
/* ==================================================================== */
router.get('/miei', requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      'SELECT id FROM utenti WHERE email = $1',
      [req.user.email]
    );
    if (q.rows.length === 0)
      return res.status(404).json({ error: 'Utente non trovato' });

    const { rows } = await pool.query(
      `SELECT id, tipo_documento, nome_file, url_file, url_file_signed,
              data_upload, data_scadenza,
              require_signature, yousign_status, yousign_signature_link
         FROM documenti
        WHERE utente_id = $1
        ORDER BY tipo_documento, data_upload DESC`,
      [q.rows[0].id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /documenti/miei', err);
    res.status(500).json({ error: 'Errore interno server' });
  }
});

/* ==================================================================== */
/*  GET /documenti/utente/:id (gestionale)                               */
/* ==================================================================== */
router.get('/utente/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo_documento, nome_file, url_file, url_file_signed,
              data_upload, data_scadenza,
              require_signature, yousign_status, yousign_signature_link
         FROM documenti
        WHERE utente_id = $1
        ORDER BY tipo_documento, data_upload DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Errore lista documenti:', err);
    res.status(500).json({ error: 'Errore interno server' });
  }
});

router.get('/da-firmare', requireAuth, async (req, res) => {
  try {
    const q = await pool.query('SELECT id FROM utenti WHERE email = $1', [req.user.email]);
    if (!q.rows.length) return res.status(404).json({ error: 'Utente non trovato' });

    const userId = q.rows[0].id;

    const { rows } = await pool.query(
      `SELECT id, tipo_documento, nome_file, url_file, data_upload, url_file_signed,
              require_signature, yousign_status, yousign_signature_link
         FROM documenti
        WHERE utente_id = $1
          AND require_signature = true
          AND COALESCE(yousign_status,'') NOT IN ('completed','signed','done')
        ORDER BY data_upload DESC`,
      [userId]
    );

    res.json(rows);
  } catch (e) {
    console.error('GET /documenti/da-firmare', e);
    res.status(500).json({ error: 'Errore interno server' });
  }
});


/* ==================================================================== */
/*  GET /documenti/:id/download                                          */
/* ==================================================================== */
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT nome_file, url_file, url_file_signed
         FROM documenti
        WHERE id = $1`,
      [req.params.id]
    );

    if (q.rows.length === 0)
      return res.status(404).json({ error: 'Documento non trovato' });

    const { nome_file, url_file, url_file_signed } = q.rows[0];

    // 👉 se esiste il firmato uso quello, altrimenti l’originale
    const chosenPath = url_file_signed || url_file;
    const abs = path.join(__dirname, '..', chosenPath);

    if (!fs.existsSync(abs))
      return res.status(404).json({ error: 'File non trovato' });

    res.download(abs, nome_file);
  } catch (err) {
    console.error('GET /documenti/:id/download', err);
    res.status(500).json({ error: 'Errore download' });
  }
});


/* ==================================================================== */
/*  GET /documenti/tipi — DISTINCT dal DB                               */
/* ==================================================================== */
router.get('/tipi', requireAuth, async (_req, res) => {
  try {
    const q = await pool.query(
      `SELECT DISTINCT tipo_documento
         FROM documenti
        WHERE tipo_documento IS NOT NULL
          AND tipo_documento <> ''
        ORDER BY tipo_documento ASC`
    );
    const tipi = q.rows.map(r => r.tipo_documento);
    res.json(tipi);
  } catch (err) {
    console.error('GET /documenti/tipi', err);
    res.status(500).json({ error: 'Errore nel caricamento tipi' });
  }
});

/* ==================================================================== */
/*  GET /documenti/:id/view                                              */
/* ==================================================================== */
router.get('/:id/view', requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      "SELECT nome_file, url_file, url_file_signed FROM documenti WHERE id = $1",
      [req.params.id]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Documento non trovato' });

    const { nome_file, url_file, url_file_signed } = q.rows[0];
    const chosenPath = url_file_signed || url_file;
    const abs = path.join(__dirname, "..", chosenPath);

    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File non trovato' });

    const ctype = mime.lookup(abs) || 'application/octet-stream';
    res.setHeader('Content-Type', ctype);
    res.setHeader('Content-Disposition', `inline; filename="${nome_file}"`);
    res.sendFile(abs);
  } catch (err) {
    console.error('GET /documenti/:id/view', err);
    res.status(500).json({ error: 'Errore view' });
  }
});

/* ==================================================================== */
/*  DELETE /documenti/:id                                                */
/* ==================================================================== */
router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID non valido' });
  }

  try {
    const q = await pool.query(
      'SELECT url_file, url_file_signed FROM documenti WHERE id = $1',
      [id]
    );
    if (!q.rows.length) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }

    const { url_file, url_file_signed } = q.rows[0];
    const absOriginal = path.join(__dirname, '..', url_file);
    const absSigned = url_file_signed ? path.join(__dirname, '..', url_file_signed) : null;

    // (opzionale) pulizia firme
    try {
      await pool.query('DELETE FROM firme WHERE documento_id = $1', [id]);
    } catch (e) {
      console.warn('DELETE firme fallito (ok se non esistono firme):', e.message);
    }

    await pool.query('DELETE FROM documenti WHERE id = $1', [id]);

    if (fs.existsSync(absOriginal)) fs.unlinkSync(absOriginal);
    if (absSigned && fs.existsSync(absSigned)) fs.unlinkSync(absSigned);

    res.json({ message: 'Documento eliminato' });
  } catch (err) {
    console.error('DELETE /documenti/:id', err);
    res.status(500).json({ error: 'Errore eliminazione documento' });
  }
});

module.exports = router;
