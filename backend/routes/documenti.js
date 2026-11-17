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
const { PDFDocument } = require('pdf-lib');
const requireAuth = require('../middleware/requireAuth');

/* ---------- Multer ---------- */
const storage = multer.memoryStorage();
const uploadSingle  = multer({ storage }).single('file');
const uploadManyPdf = multer({ storage }).array('files', 20);
const yousignClient = require('../services/yousignClient');
const { creaChiaveS3, caricaBufferSuS3, scaricaBufferDaS3, urlFirmatoGet, eliminaDaS3 } = require("../lib/s3");
const { sendExpoPush } = require("../services/expoPush");
const { safeSendMail } = require("../lib/notifier");

const {
  normalizzaChiaveS3,
  normalizeTipo,
  validateTipo,
  parseBool,
  appendNomeCognome,
  parseJsonSafe,
  fmtDataIt,
  applicaTestiPdf,
  parseSignaturePlacement,
} = require('../services/documenti/helpers');

const {
  getUserPushTokens,
  resolveAutoreId,
  resolveTargetUserId,
  insertDocumentoRows,
} = require('../services/documenti/db');

const { fireAndForgetDocumentNotifications } = require('../services/documenti/notifications');

const {
  sleep,
  YOUSIGN_DELAY_MS,
  markYousignInitError,
  startYousignForDocumento,
} = require('../services/documenti/yousign');

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
      const signaturePlacement = parseSignaturePlacement(req.body);

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
      fireAndForgetDocumentNotifications(inserted, tipoNorm, {
        emailSubject: req.body.email_subject,
        emailBody: req.body.email_body,
      });

      // fire-and-forget Yousign
      if (require_signature) {
        startYousignForDocumento({
          documentoId: inserted[0].id,
          utenteId: targetUserId,
          nomeFile: req.file.originalname,
          urlFile: relPath,
          signaturePlacement,
        }).catch((e) => markYousignInitError(inserted[0].id, e, "upload"));
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
      const appendNames = parseBool(req.body.append_names || req.body.appendNames || req.body.includi_nome_cognome);
      const signaturePlacement = parseSignaturePlacement(req.body);

      const isPdfUpload =
        req.file.mimetype === 'application/pdf' || /\.pdf$/i.test(req.file.originalname || '');
      const headerPlacement = isPdfUpload
        ? parseJsonSafe(req.body.header_placement || req.body.headerPlacement)
        : null;
      const datePlacement = isPdfUpload
        ? parseJsonSafe(req.body.date_placement || req.body.datePlacement)
        : null;
      const wantsHeader = !!headerPlacement;
      const wantsDate = !!datePlacement;
      const bakeText = wantsHeader || wantsDate;
      const dataOggi = fmtDataIt();

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

      const check = await pool.query('SELECT id, nome, cognome FROM utenti WHERE id = ANY($1::int[])', [uniq]);
      if (check.rows.length !== uniq.length) {
        return res.status(404).json({ error: 'Alcuni utenti non esistono' });
      }
      const userById = new Map(check.rows.map((r) => [r.id, r]));

      const autoreId = await resolveAutoreId(req);
      const batch_id = randomUUID();

      const safeNomeFile = String(req.body?.nome_file || req.file.originalname).trim() || req.file.originalname;
      const finalNomeFile = safeNomeFile.toLowerCase().endsWith('.pdf')
        ? safeNomeFile
        : `${safeNomeFile}.pdf`;

      // nome file specifico per destinatario (se richiesto "Includi nome e cognome")
      const nomeFilePerUtente = (uid) => {
        if (!appendNames) return finalNomeFile;
        const u = userById.get(uid);
        return u ? appendNomeCognome(finalNomeFile, u.nome, u.cognome) : finalNomeFile;
      };

      // buffer PDF personalizzato per destinatario (intestazione + data "stampate" nel file)
      const bufferPerUtente = async (u) => {
        if (!bakeText) return req.file.buffer;
        const displayName =
          [u?.nome, u?.cognome].filter(Boolean).join(' ').trim() || 'dipendente';
        return applicaTestiPdf(req.file.buffer, [
          wantsHeader && {
            text: `Gent. dipendente ${displayName}`,
            placement: headerPlacement,
          },
          wantsDate && { text: dataOggi, placement: datePlacement },
        ].filter(Boolean));
      };

      // richiede una copia S3 per destinatario se: firma, oppure testi stampati nel PDF
      const perUser = require_signature || bakeText;

      let inserted = [];

      if (perUser) {
        for (const uid of uniq) {
          const u = userById.get(uid) || {};
          const nomeFileUid = nomeFilePerUtente(uid);
          const buf = await bufferPerUtente(u);
          const chiaveS3 = creaChiaveS3({
            utenteId: uid,
            tipoDocumento: tipoNorm,
            nomeFile: nomeFileUid,
          });

          await caricaBufferSuS3({
            chiave: chiaveS3,
            buffer: buf,
            contentType: req.file.mimetype,
          });

          const rows = await insertDocumentoRows({
            utenteIds: [uid],
            tipo: tipoNorm,
            nome_file: nomeFileUid,
            nome_file_base: finalNomeFile,
            relPath: chiaveS3,
            caricato_da: autoreId,
            data_scadenza,
            require_signature,
            batch_id,
          });
          inserted.push(...rows);
        }
      } else {
        // un solo file fisico su S3, condiviso da tutti i destinatari
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

        if (appendNames) {
          for (const uid of uniq) {
            const rows = await insertDocumentoRows({
              utenteIds: [uid],
              tipo: tipoNorm,
              nome_file: nomeFilePerUtente(uid),
              nome_file_base: finalNomeFile,
              relPath: chiaveS3,
              caricato_da: autoreId,
              data_scadenza,
              require_signature,
              batch_id,
            });
            inserted.push(...rows);
          }
        } else {
          inserted = await insertDocumentoRows({
            utenteIds: uniq,
            tipo: tipoNorm,
            nome_file: finalNomeFile,
            nome_file_base: finalNomeFile,
            relPath: chiaveS3,
            caricato_da: autoreId,
            data_scadenza,
            require_signature,
            batch_id,
          });
        }
      }

      res.json({
        message: require_signature
          ? `Documento assegnato a ${uniq.length} dipendenti e firma avviata.`
          : `Documento assegnato a ${uniq.length} dipendenti.`,
      });
      fireAndForgetDocumentNotifications(inserted, tipoNorm, {
        emailSubject: req.body.email_subject,
        emailBody: req.body.email_body,
      });

      if (require_signature) {
        (async () => {
          for (let i = 0; i < inserted.length; i++) {
            const doc = inserted[i];
            try {
              await startYousignForDocumento({
                documentoId: doc.id,
                utenteId: doc.utente_id,
                nomeFile: doc.nome_file || finalNomeFile,
                urlFile: doc.url_file,
                signaturePlacement,
              });
            } catch (e) {
              await markYousignInitError(doc.id, e, "upload-multi");
            }
            if (i < inserted.length - 1) await sleep(YOUSIGN_DELAY_MS);
          }
        })();
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
      fireAndForgetDocumentNotifications(createdDocs, tipoNorm, {
        emailSubject: req.body.email_subject,
        emailBody: req.body.email_body,
      });

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
      fireAndForgetDocumentNotifications(inserted, tipoNorm, {
        emailSubject: req.body.email_subject,
        emailBody: req.body.email_body,
      });

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
    const limit = Math.min(parseInt(req.query.limit) || 25, 500);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM (
         SELECT 1 FROM documenti d
         GROUP BY COALESCE(d.batch_id::text, d.url_file)
       ) t`
    );
    const total = countRows[0]?.total || 0;

    const { rows } = await pool.query(
      `SELECT
         MIN(d.id)                                  AS id,
         COALESCE(d.batch_id::text, d.url_file)     AS group_key,
         MAX(d.batch_id::text)::uuid                AS batch_id,
         MAX(d.url_file)                            AS url_file,
         MAX(d.tipo_documento)                      AS tipo_documento,
         MAX(COALESCE(d.nome_file_base, d.nome_file)) AS nome_file,
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
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ items: rows, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
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

/* ─── POST /documenti/remind-firma ───────────────────────── */
router.post('/remind-firma', requireAuth, async (req, res) => {
  const { doc_ids } = req.body;
  if (!Array.isArray(doc_ids) || doc_ids.length === 0)
    return res.status(400).json({ error: 'doc_ids mancanti' });

  const placeholders = doc_ids.map((_, i) => `$${i + 1}`).join(',');
  let docs;
  try {
    docs = await pool.query(
      `SELECT d.id, d.utente_id, d.nome_file, d.tipo_documento, d.yousign_signature_link,
              u.nome, u.cognome, u.email
         FROM documenti d
         JOIN utenti u ON u.id = d.utente_id
        WHERE d.id IN (${placeholders})
          AND d.require_signature = true
          AND COALESCE(d.yousign_status, '') NOT IN ('completed', 'signed', 'done', 'canceled', 'expired', 'init_error')`,
      doc_ids
    );
  } catch (err) {
    console.error('remind-firma query', err);
    return res.status(500).json({ error: 'Errore database' });
  }

  let sent = 0;
  const errors = [];

  for (const doc of docs.rows) {
    // Push notification (awaited per vedere eventuali errori nei log)
    try {
      const tokens = await getUserPushTokens(doc.utente_id);
      if (tokens.length) {
        await sendExpoPush(tokens, {
          title: 'Promemoria firma',
          body: `Firma richiesta: ${doc.nome_file}`,
          data: { type: 'SIGN_DOCUMENT', documentoId: doc.id },
        });
        console.log(`[remind-firma] push inviata utente=${doc.utente_id} tokens=${tokens.length}`);
      } else {
        console.log(`[remind-firma] nessun token per utente=${doc.utente_id}`);
      }
    } catch (e) {
      console.error(`[remind-firma] push error utente=${doc.utente_id}`, e.message);
    }

    if (!doc.email) {
      errors.push({ id: doc.id, reason: 'email_mancante' });
      continue;
    }

    const linkHtml = doc.yousign_signature_link
      ? `<p style="margin-top:16px">
           <a href="${doc.yousign_signature_link}" style="display:inline-block;padding:10px 20px;background:#6A57D3;color:#fff;font-weight:700;text-decoration:none;border-radius:8px">
             Firma il documento →
           </a>
         </p>`
      : `<p style="margin-top:16px;color:#64748B;font-size:13px">
           Apri l'app ClockEasy per accedere al documento e firmarlo.
         </p>`;

    const result = await safeSendMail({
      to: doc.email,
      subject: `Promemoria firma: ${doc.nome_file}`,
      html: `
        <p>Gentile <b>${doc.nome} ${doc.cognome}</b>,</p>
        <p>ti ricordiamo che è ancora richiesta la tua firma sul documento:</p>
        <p style="font-weight:700">${doc.nome_file}${doc.tipo_documento ? ` — ${doc.tipo_documento}` : ''}</p>
        ${linkHtml}
        <p style="margin-top:24px;color:#64748B;font-size:13px">ClockEasy — Gestionale HR</p>
      `,
    });
    if (result.ok) sent++;
    else errors.push({ id: doc.id, reason: result.reason });
  }

  res.json({ sent, errors });
});

module.exports = router;
