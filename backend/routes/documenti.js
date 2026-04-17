/**
 * /backend/routes/documenti.js — upload, lista, download, delete, tipi
 * + NEW: upload-multi, split, merge (pdf-lib)
 */
const express = require('express');
const router  = express.Router();
const { randomUUID } = require('crypto');
const pool    = require('../db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { PDFDocument } = require('pdf-lib');
const requireAuth = require('../middleware/requireAuth');

/* ---------- Multer ---------- */
const storage = multer.memoryStorage();
const uploadSingle  = multer({ storage }).single('file');
const uploadManyPdf = multer({ storage }).array('files', 20);
const yousignClient = require('../services/yousignClient');
const os = require("os");
const { creaChiaveS3, caricaBufferSuS3, scaricaBufferDaS3, urlFirmatoGet, eliminaDaS3 } = require("../lib/s3");
const { sendExpoPush } = require("../services/expoPush");
const { safeSendMail } = require("../lib/notifier");

/* ==================================================================== */
/*  Helpers                                                             */
/* ==================================================================== */
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

async function notifyNewDocumentAssigned({ utenteId, documentoId, nomeFile, tipoDocumento }) {
  try {
    const u = await pool.query(
      `SELECT nome, cognome, email
         FROM utenti
        WHERE id = $1
        LIMIT 1`,
      [utenteId]
    );

    const user = u.rows[0];
    if (!user) return;

    const displayName =
      [user.nome, user.cognome].filter(Boolean).join(" ").trim() || "dipendente";

    // PUSH
    const tokens = await getUserPushTokens(utenteId);
    if (tokens.length) {
      await sendExpoPush(tokens, {
        title: "Nuovo documento",
        body: nomeFile,
        data: {
          type: "NEW_DOCUMENT",
          documentoId,
        },
      });
    }

    // EMAIL
    if (user.email) {
      await safeSendMail({
        to: user.email,
        subject: "ClockEasy - Nuovo documento disponibile",
        text:
`Ciao ${displayName},

è stato caricato un nuovo documento su ClockEasy.

Documento: ${nomeFile}
Tipo: ${tipoDocumento || "-"}

Accedi all'app ClockEasy per visualizzarlo.

Messaggio automatico, non rispondere a questa email.`,
        html: `
          <p>Ciao <strong>${displayName}</strong>,</p>
          <p>è stato caricato un nuovo documento su <strong>ClockEasy</strong>.</p>
          <p>
            <strong>Documento:</strong> ${nomeFile}<br />
            <strong>Tipo:</strong> ${tipoDocumento || "-"}
          </p>
          <p>Accedi all'app ClockEasy per visualizzarlo.</p>
          <p style="color:#666;font-size:12px;">Messaggio automatico, non rispondere a questa email.</p>
        `,
      });
    }
  } catch (e) {
    console.error("notifyNewDocumentAssigned error:", e);
  }
}

function fireAndForgetDocumentNotifications(rows, tipoDocumento) {
  Promise.allSettled(
    (rows || []).map((doc) =>
      notifyNewDocumentAssigned({
        utenteId: doc.utente_id,
        documentoId: doc.id,
        nomeFile: doc.nome_file,
        tipoDocumento,
      })
    )
  ).catch((e) => {
    console.error("fireAndForgetDocumentNotifications error:", e);
  });
}

function normalizzaChiaveS3(pathDb) {
  if (!pathDb) return null;
  if (pathDb.startsWith("s3://")) return pathDb.replace("s3://", "");
  return pathDb; // es: uploads/documenti/...
}


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

async function insertDocumentoRows({ utenteIds, tipo, nome_file, relPath, caricato_da, data_scadenza, require_signature, batch_id }) {
  const rows = [];
  for (const uid of utenteIds) {
    const r = await pool.query(
      `INSERT INTO documenti
         (utente_id, tipo_documento, nome_file, url_file, caricato_da, data_upload, data_scadenza, require_signature, batch_id)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8)
       RETURNING id, utente_id, nome_file, url_file, require_signature`,
      [uid, tipo, nome_file, relPath, caricato_da, data_scadenza || null, !!require_signature, batch_id || null]
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
  // ✅ scarico da S3 e creo un file temporaneo (Yousign vuole un path)
  let tempPath = null;
  try {
    const key = normalizzaChiaveS3(urlFile);
    const buf = await scaricaBufferDaS3({ chiave: key });

    tempPath = path.join(
      os.tmpdir(),
      `clockeasy_${documentoId}_${Date.now()}_${path.basename(key)}`
    );

    fs.writeFileSync(tempPath, buf);
  } catch (e) {
    await pool.query(
      `UPDATE documenti SET yousign_status = $1 WHERE id = $2`,
      ["file_not_found", documentoId]
    );
    return { ok: false, reason: "file_not_found" };
  }

  const absPath = tempPath;

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
  async function notifyFirmaRichiesta(utenteId, documentoId, nomeFile) {
    const tokens = await getUserPushTokens(utenteId);
    if (!tokens.length) return;

    await sendExpoPush(tokens, {
      title: "Firma richiesta",
      body: `Devi firmare: ${nomeFile}`,
      data: { type: "SIGN_DOCUMENT", documentoId },
    });
  }

  await notifyFirmaRichiesta(utenteId, documentoId, nomeFile);


  try { if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}

  return {
    ok: true,
    signatureRequestId: sr.id,
    status: activated.status,
  };
}


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
    // ✅ chiave S3 dell'originale
    const keyOriginale = normalizzaChiaveS3(d.url_file);
    if (!keyOriginale) {
      return res.status(404).json({ error: "Chiave documento non valida" });
    }

    // (opzionale ma consigliato) backup del non firmato su S3
    try {
      const origBuf = await scaricaBufferDaS3({ chiave: keyOriginale });
      const backupKey = `uploads/documenti/original_backup/${docId}_ORIG_${Date.now()}_${path.basename(keyOriginale)}`;
      await caricaBufferSuS3({
        chiave: backupKey,
        buffer: origBuf,
        contentType: "application/pdf",
      });
    } catch (e) {
      console.warn("Backup originale su S3 fallito:", e?.message || e);
    }

    // ✅ sovrascrivi l'originale su S3 con il firmato
    await caricaBufferSuS3({
      chiave: keyOriginale,
      buffer: pdfBuf,
      contentType: "application/pdf",
    });


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

      const { tipo_documento, data_scadenza, nome_file } = req.body;
      const batch_id = req.body.batch_id || null;
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

      const safeNomeFile = String(nome_file || req.file.originalname).trim() || req.file.originalname;
      const finalNomeFile = safeNomeFile.toLowerCase().endsWith('.pdf')
        ? safeNomeFile
        : `${safeNomeFile}.pdf`;

      const { targetUserId, autoreId } = await resolveTargetUserId(req);

      // 1) carica su S3
      const chiaveS3 = creaChiaveS3({
        utenteId: targetUserId,
        tipoDocumento: tipoNorm,
        nomeFile: finalNomeFile,
      });
      await caricaBufferSuS3({
        chiave: chiaveS3,
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
      });

      // 2) nel DB salvo la chiave S3 al posto del path locale
      const relPath = chiaveS3;


      const inserted = await insertDocumentoRows({
        utenteIds: [targetUserId],
        tipo: tipoNorm,
        nome_file: finalNomeFile,
        relPath,
        caricato_da: autoreId,
        data_scadenza,
        require_signature,
        batch_id,
      });

      res.json({
        message: 'Documento caricato correttamente!',
        documentoId: inserted[0].id,
        require_signature: !!require_signature,
      });

      // push + mail documento
      fireAndForgetDocumentNotifications(inserted, tipoNorm);

      // fire-and-forget Yousign
      if (require_signature) {
        startYousignForDocumento({
          documentoId: inserted[0].id,
          utenteId: targetUserId,
          nomeFile: req.file.originalname,
          urlFile: relPath,
          signaturePlacement,
        }).catch(async (e) => {
          console.error("Yousign start failed (upload):", {
            message: e.message,
            status: e.response?.status,
            data: e.response?.data,
            stack: e.stack,
          });

          try {
            await pool.query(
              `UPDATE documenti
                  SET yousign_status = $1,
                      yousign_signature_request_id = NULL,
                      yousign_document_id = NULL,
                      yousign_signer_id = NULL,
                      yousign_signature_link = NULL,
                      yousign_signature_link_expires_at = NULL
                WHERE id = $2`,
              ['init_error', inserted[0].id]
            );
          } catch (dbErr) {
            console.error("Errore update init_error:", dbErr);
          }
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

      const uniq = [...new Set(ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0))];
      if (uniq.length !== ids.length) {
        return res.status(400).json({ error: 'utente_ids non validi' });
      }

      const check = await pool.query('SELECT id FROM utenti WHERE id = ANY($1::int[])', [uniq]);
      if (check.rows.length !== uniq.length) {
        return res.status(404).json({ error: 'Alcuni utenti non esistono' });
      }

      const autoreId = await resolveAutoreId(req);
      const batch_id = randomUUID();

      const safeNomeFile = String(req.body?.nome_file || req.file.originalname).trim() || req.file.originalname;
      const finalNomeFile = safeNomeFile.toLowerCase().endsWith('.pdf')
        ? safeNomeFile
        : `${safeNomeFile}.pdf`;

      const chiaveS3 = creaChiaveS3({
        utenteId: 0,
        tipoDocumento: tipoNorm,
        nomeFile: finalNomeFile,
      });

      await caricaBufferSuS3({
        chiave: chiaveS3,
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
      });

      const relPath = chiaveS3;

      const inserted = await insertDocumentoRows({
        utenteIds: uniq,
        tipo: tipoNorm,
        nome_file: finalNomeFile,
        relPath,
        caricato_da: autoreId,
        data_scadenza,
        require_signature,
        batch_id,
      });

      res.json({ message: `Documento assegnato a ${uniq.length} dipendenti.` });
      fireAndForgetDocumentNotifications(inserted, tipoNorm);

      if (require_signature) {
        console.warn("[Yousign] upload-multi con firma: da gestire caso multi (scelta business).");
      }
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

      const uniq = [...new Set(ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0))];
      if (uniq.length !== ids.length) {
        return res.status(400).json({ error: 'utente_ids non validi' });
      }
      const check = await pool.query('SELECT id FROM utenti WHERE id = ANY($1::int[])', [uniq]);
      if (check.rows.length !== uniq.length) {
        return res.status(404).json({ error: 'Alcuni utenti non esistono' });
      }

      // ✅ carico PDF sorgente da buffer (memoryStorage)
      const srcPdf = await PDFDocument.load(file.buffer);
      const total = srcPdf.getPageCount();

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
      const batch_id = randomUUID();
      const createdDocs = [];

      // ✅ per ogni parte: genera pdf bytes -> carica su S3 -> inserisci su DB
      for (let i=0; i<parts.length; i++) {
        const [from, to] = parts[i];

        const outPdf = await PDFDocument.create();
        const pages = await outPdf.copyPages(
          srcPdf,
          Array.from({ length: to - from + 1 }, (_,k) => (from - 1 + k))
        );
        pages.forEach(p => outPdf.addPage(p));

        const outBytes = await outPdf.save();
        const outBuffer = Buffer.from(outBytes);

        const nomeParte = `${path.basename(file.originalname, ".pdf")}_part${i+1}.pdf`;

        // chiave S3 "shared" (oppure per utente, se vuoi copie separate)
        const chiaveS3 = creaChiaveS3({
          utenteId: 0,
          tipoDocumento: tipoNorm,
          nomeFile: nomeParte,
        });

        await caricaBufferSuS3({
          chiave: chiaveS3,
          buffer: outBuffer,
          contentType: "application/pdf",
        });

        const inserted = await insertDocumentoRows({
          utenteIds: uniq,
          tipo: tipoNorm,
          nome_file: `${file.originalname} (parte ${i + 1} ${from}-${to})`,
          relPath: chiaveS3,
          caricato_da,
          data_scadenza,
          require_signature,
          batch_id,
        });

        createdDocs.push(...inserted);
      }

      res.json({ message: `Creati ${parts.length} documenti e assegnati a ${ids.length} dipendenti.` });
      fireAndForgetDocumentNotifications(createdDocs, tipoNorm);

      if (require_signature) {
        console.warn("[Yousign] split con firma: da definire strategia (di solito firma solo alcune parti).");
      }
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

      const uniq = [...new Set(ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0))];
      if (uniq.length !== ids.length) {
        return res.status(400).json({ error: 'utente_ids non validi' });
      }
      const check = await pool.query('SELECT id FROM utenti WHERE id = ANY($1::int[])', [uniq]);
      if (check.rows.length !== uniq.length) {
        return res.status(404).json({ error: 'Alcuni utenti non esistono' });
      }

      const merged = await PDFDocument.create();

      for (const f of files) {
        const pdf = await PDFDocument.load(f.buffer);
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }

      const mergedBytes = await merged.save();
      const mergedBuffer = Buffer.from(mergedBytes);

      const nomeUnito = `MERGE_${Date.now()}_${files.map(f => path.basename(f.originalname, ".pdf")).join("_")}.pdf`;

      const chiaveS3 = creaChiaveS3({
        utenteId: 0,
        tipoDocumento: tipoNorm,
        nomeFile: nomeUnito,
      });

      await caricaBufferSuS3({
        chiave: chiaveS3,
        buffer: mergedBuffer,
        contentType: "application/pdf",
      });

      const caricato_da = await resolveAutoreId(req);
      const batch_id = randomUUID();

      const inserted = await insertDocumentoRows({
        utenteIds: uniq,
        tipo: tipoNorm,
        nome_file: files.map(f => f.originalname).join(' + '),
        relPath: chiaveS3,
        caricato_da,
        data_scadenza,
        require_signature,
        batch_id,
      });

      res.json({ message: `Documento unito e assegnato a ${ids.length} dipendenti.` });
      fireAndForgetDocumentNotifications(inserted, tipoNorm);

      if (require_signature) {
        console.warn("[Yousign] merge con firma: ok, ma definire se parte firma automatica.");
      }
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
          AND yousign_signature_request_id IS NOT NULL
          AND yousign_signature_link IS NOT NULL
          AND COALESCE(yousign_status,'') NOT IN ('completed','signed','done','init_error','canceled','expired','declined')
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
/*  GET /documenti  — cronologia globale raggruppata per batch           */
/* ==================================================================== */
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { rows } = await pool.query(
      `SELECT
         MIN(d.id)                                  AS id,
         COALESCE(d.batch_id::text, d.url_file)     AS group_key,
         MAX(d.batch_id::text)::uuid                AS batch_id,
         MAX(d.url_file)                            AS url_file,
         MAX(d.tipo_documento)                      AS tipo_documento,
         MAX(d.nome_file)                           AS nome_file,
         MIN(d.data_upload)                         AS data_upload,
         MAX(d.data_scadenza::text)                 AS data_scadenza,
         BOOL_OR(d.require_signature)               AS require_signature,
         COUNT(*)::int                              AS n_destinatari,
         json_agg(
           json_build_object(
             'id',                     d.id,
             'utente_id',              d.utente_id,
             'nome',                   u.nome,
             'cognome',                u.cognome,
             'sede',                   u.sede,
             'email',                  u.email,
             'societa_nome',           s.ragione_sociale,
             'yousign_status',         d.yousign_status,
             'yousign_signature_link', d.yousign_signature_link,
             'signed_at',              d.signed_at
           ) ORDER BY u.cognome, u.nome
         )                                          AS destinatari
       FROM documenti d
       LEFT JOIN utenti  u ON u.id = d.utente_id
       LEFT JOIN societa s ON s.id = u.societa_id
       GROUP BY COALESCE(d.batch_id::text, d.url_file)
       ORDER BY MIN(d.data_upload) DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /documenti', err);
    res.status(500).json({ error: 'Errore interno server' });
  }
});

/* ==================================================================== */
/*  DELETE /documenti/batch — elimina tutti i record di un batch         */
/* ==================================================================== */
router.delete('/batch', requireAuth, async (req, res) => {
  const { batch_id, url_file } = req.body;
  if (!batch_id && !url_file) return res.status(400).json({ error: 'batch_id o url_file richiesto' });

  try {
    const q = batch_id
      ? await pool.query('SELECT id, url_file, url_file_signed FROM documenti WHERE batch_id = $1', [batch_id])
      : await pool.query('SELECT id, url_file, url_file_signed FROM documenti WHERE url_file = $1', [url_file]);

    if (!q.rows.length) return res.status(404).json({ error: 'Documento non trovato' });

    try { await pool.query('DELETE FROM firme WHERE documento_id = ANY($1::int[])', [q.rows.map(r => r.id)]); } catch {}

    if (batch_id) await pool.query('DELETE FROM documenti WHERE batch_id = $1', [batch_id]);
    else          await pool.query('DELETE FROM documenti WHERE url_file = $1', [url_file]);

    // elimina file S3 una sola volta (tutti condividono lo stesso url_file nel caso upload-multi/split/merge)
    const uniqueFiles = [...new Set(q.rows.map(r => r.url_file).filter(Boolean))];
    for (const f of uniqueFiles) {
      try { await eliminaDaS3({ chiave: normalizzaChiaveS3(f) }); } catch (e) { console.warn('S3 batch delete:', e?.message); }
    }
    const signedFiles = [...new Set(q.rows.map(r => r.url_file_signed).filter(Boolean))];
    for (const f of signedFiles) {
      try { await eliminaDaS3({ chiave: normalizzaChiaveS3(f) }); } catch {}
    }

    res.json({ ok: true, deleted: q.rows.length });
  } catch (err) {
    console.error('DELETE /documenti/batch', err);
    res.status(500).json({ error: 'Errore eliminazione batch' });
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

    if (!q.rows.length) return res.status(404).json({ error: 'Documento non trovato' });

    const { nome_file, url_file, url_file_signed } = q.rows[0];
    const chosen = url_file_signed || url_file;

    const chiave = normalizzaChiaveS3(chosen);
    if (!chiave) return res.status(404).json({ error: 'File non trovato' });

    // Presigned URL (il browser scarica da S3)
    const url = await urlFirmatoGet({ chiave, scadeSecondi: 120 });

    return res.redirect(url);
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
    const chosen = url_file_signed || url_file;

    const chiave = normalizzaChiaveS3(chosen);
    if (!chiave) return res.status(404).json({ error: 'File non trovato' });

    const url = await urlFirmatoGet({ chiave, scadeSecondi: 120 });

    // inline view
    return res.redirect(url);
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

    // (opzionale) pulizia firme
    try {
      await pool.query('DELETE FROM firme WHERE documento_id = $1', [id]);
    } catch (e) {
      console.warn('DELETE firme fallito (ok se non esistono firme):', e.message);
    }

    await pool.query('DELETE FROM documenti WHERE id = $1', [id]);

    // Elimina da S3 solo se nessun altro record condivide lo stesso file
    const chiave1 = normalizzaChiaveS3(url_file);
    const chiave2 = url_file_signed ? normalizzaChiaveS3(url_file_signed) : null;

    if (chiave1) {
      const stillUsed = await pool.query(
        'SELECT 1 FROM documenti WHERE url_file = $1 LIMIT 1', [url_file]
      );
      if (!stillUsed.rows.length) {
        try { await eliminaDaS3({ chiave: chiave1 }); } catch (e) {
          console.warn("Elimina S3 originale fallito:", e?.message || e);
        }
      }
    }

    if (chiave2) {
      const stillUsedSigned = await pool.query(
        'SELECT 1 FROM documenti WHERE url_file_signed = $1 OR url_file = $1 LIMIT 1', [url_file_signed]
      );
      if (!stillUsedSigned.rows.length) {
        try { await eliminaDaS3({ chiave: chiave2 }); } catch (e) {
          console.warn("Elimina S3 firmato fallito:", e?.message || e);
        }
      }
    }

    return res.json({ message: 'Documento eliminato' });
  } catch (err) {
    console.error('DELETE /documenti/:id', err);
    res.status(500).json({ error: 'Errore eliminazione documento' });
  }
});


router.get('/:id/presigned', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID documento non valido' });
    }

    const q = await pool.query(
      `SELECT url_file, url_file_signed
         FROM documenti
        WHERE id = $1
        LIMIT 1`,
      [id]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Documento non trovato' });

    const chosen = q.rows[0].url_file_signed || q.rows[0].url_file;
    const chiave = normalizzaChiaveS3(chosen);
    if (!chiave) return res.status(404).json({ error: 'File non trovato' });

    const signedUrl = await urlFirmatoGet({ chiave, scadeSecondi: 120 });
    return res.json({ url: signedUrl });
  } catch (e) {
    console.error('GET /documenti/:id/presigned', e);
    res.status(500).json({ error: 'Errore presigned' });
  }
});

/* ==================================================================== */
/*  PATCH /documenti/:id — aggiorna tipo_documento e/o nome_file         */
/* ==================================================================== */
router.patch('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID non valido' });
  }

  const { tipo_documento, nome_file } = req.body;

  if (tipo_documento === undefined && nome_file === undefined) {
    return res.status(400).json({ error: 'Nessun campo da aggiornare' });
  }

  const setClauses = [];
  const values     = [];
  let   idx        = 1;

  if (tipo_documento !== undefined) {
    if (!validateTipo(tipo_documento)) {
      return res.status(400).json({ error: 'Tipo documento non valido' });
    }
    setClauses.push(`tipo_documento = $${idx++}`);
    values.push(normalizeTipo(tipo_documento));
  }

  if (nome_file !== undefined) {
    const clean = String(nome_file).trim();
    if (!clean || clean.length > 255) {
      return res.status(400).json({ error: 'Nome file non valido' });
    }
    setClauses.push(`nome_file = $${idx++}`);
    values.push(clean);
  }

  values.push(id); // ultimo parametro = WHERE id

  try {
    const q = await pool.query(
      `UPDATE documenti
          SET ${setClauses.join(', ')}
        WHERE id = $${idx}
        RETURNING id, tipo_documento, nome_file`,
      values
    );

    if (!q.rows.length) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }

    return res.json({ ok: true, ...q.rows[0] });
  } catch (err) {
    console.error('PATCH /documenti/:id', err);
    res.status(500).json({ error: 'Errore aggiornamento documento' });
  }
});

module.exports = router;
