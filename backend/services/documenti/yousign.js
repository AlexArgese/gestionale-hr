/**
 * backend/services/documenti/yousign.js
 * Avvio/gestione del flusso di firma Yousign per i documenti, usato dalle
 * rotte di /backend/routes/documenti.js.
 */
const pool = require('../../db');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PDFDocument } = require('pdf-lib');
const yousignClient = require('../yousignClient');
const { scaricaBufferDaS3 } = require('../../lib/s3');
const { sendExpoPush } = require('../expoPush');
const { normalizzaChiaveS3 } = require('./helpers');
const { getUserPushTokens } = require('./db');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const YOUSIGN_DELAY_MS = 2500; // ms tra una signature request e l'altra nei batch
const YOUSIGN_MAX_ATTEMPTS = 5; // tentativi in caso di 429 (rate limit) da Yousign
const YOUSIGN_WAIT_ON_429_MS = 65000; // attesa tra un tentativo e l'altro dopo un 429

async function markYousignInitError(documentoId, e, context) {
  console.error(`Yousign start failed (${context}):`, {
    documentoId,
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
      ['init_error', documentoId]
    );
  } catch (dbErr) {
    console.error("Errore update init_error:", dbErr);
  }
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

  // 3) flow yousign (YouSign: max 128 chars sul campo name), con retry su 429 (rate limit)
  let sr, doc, signer, activated;

  for (let attempt = 1; attempt <= YOUSIGN_MAX_ATTEMPTS; attempt++) {
    try {
      sr = await yousignClient.createSignatureRequest({
        name: `Firma: ${nomeFile}`.substring(0, 128).trim(),
        deliveryMode: "email",
      });

      doc = await yousignClient.uploadDocumentToRequest(sr.id, absPath);

      signer = await yousignClient.addSigner(sr.id, {
        firstName: (user.nome || "Dipendente").trim(),
        lastName: (user.cognome || "").trim(),
        email: user.email.trim(),
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

      activated = await yousignClient.activateSignatureRequest(sr.id);

      break;
    } catch (e) {
      if (e.response?.status === 429 && attempt < YOUSIGN_MAX_ATTEMPTS) {
        console.warn(
          `[Yousign] 429 rate limit su documento ${documentoId}, tentativo ${attempt}/${YOUSIGN_MAX_ATTEMPTS}, attendo ${YOUSIGN_WAIT_ON_429_MS / 1000}s...`
        );
        await sleep(YOUSIGN_WAIT_ON_429_MS);
        continue;
      }
      throw e;
    }
  }

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

module.exports = {
  sleep,
  YOUSIGN_DELAY_MS,
  YOUSIGN_MAX_ATTEMPTS,
  YOUSIGN_WAIT_ON_429_MS,
  markYousignInitError,
  startYousignForDocumento,
};
