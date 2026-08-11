/**
 * Script one-shot: rilancia il flow YouSign per tutti i documenti
 * del 8 agosto 2026 con yousign_status = 'init_error'.
 *
 * Esegui con:  node scripts/retry_yousign_agosto8.js
 * (dalla cartella backend, con .env caricato)
 */
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const os = require("os");
const { PDFDocument } = require("pdf-lib");
const pool = require("../db");
const yousignClient = require("../services/yousignClient");
const { scaricaBufferDaS3 } = require("../lib/s3");
const { sendExpoPush } = require("../services/expoPush");

const DELAY_MS = 2500; // 2.5 sec tra ogni richiesta (~24/min, sotto rate limit YouSign)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizzaChiaveS3(pathDb) {
  if (!pathDb) return null;
  if (pathDb.startsWith("s3://")) return pathDb.replace("s3://", "");
  return pathDb;
}

async function getUserPushTokens(utenteId) {
  const t = await pool.query(
    `SELECT expo_push_token FROM push_tokens WHERE utente_id = $1 AND attivo = true`,
    [utenteId]
  );
  return t.rows.map((r) => r.expo_push_token).filter(Boolean);
}

async function retryDoc(doc) {
  const { id: documentoId, utente_id: utenteId, nome_file: nomeFile, url_file: urlFile } = doc;

  // 1) Scarica da S3
  let tempPath = null;
  try {
    const key = normalizzaChiaveS3(urlFile);
    const buf = await scaricaBufferDaS3({ chiave: key });
    tempPath = path.join(os.tmpdir(), `retry_${documentoId}_${Date.now()}_${path.basename(key)}`);
    fs.writeFileSync(tempPath, buf);
  } catch (e) {
    await pool.query(`UPDATE documenti SET yousign_status = $1 WHERE id = $2`, ["file_not_found", documentoId]);
    return { ok: false, reason: "file_not_found", id: documentoId };
  }

  // Tenta il flow YouSign con retry su 429
  const MAX_ATTEMPTS = 5;
  const WAIT_ON_429_MS = 65000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const srName = `Firma: ${nomeFile}`.substring(0, 128).trim();
      const sr = await yousignClient.createSignatureRequest({
        name: srName,
        deliveryMode: "email",
      });

      const ysDoc = await yousignClient.uploadDocumentToRequest(sr.id, tempPath);

      const signer = await yousignClient.addSigner(sr.id, {
        firstName: (doc.nome || "Dipendente").trim(),
        lastName: (doc.cognome || "").trim(),
        email: doc.email.trim(),
      });

      await yousignClient.addSignatureField(sr.id, signer.id, ysDoc.id, null);

      const activated = await yousignClient.activateSignatureRequest(sr.id);

      const signatureLink = activated?.signers?.[0]?.signature_link || null;
      const expiresAtStr = activated?.signers?.[0]?.signature_link_expiration_date || null;

      await pool.query(
        `UPDATE documenti
           SET yousign_signature_request_id = $1,
               yousign_document_id          = $2,
               yousign_signer_id            = $3,
               yousign_status               = $4,
               yousign_signature_link       = $5,
               yousign_signature_link_expires_at = $6
         WHERE id = $7`,
        [sr.id, ysDoc.id, signer.id, activated.status, signatureLink, expiresAtStr ? new Date(expiresAtStr) : null, documentoId]
      );

      try {
        const tokens = await getUserPushTokens(utenteId);
        if (tokens.length) {
          await sendExpoPush(tokens, {
            title: "Firma richiesta",
            body: `Devi firmare: ${nomeFile}`,
            data: { type: "SIGN_DOCUMENT", documentoId },
          });
        }
      } catch {}

      try { if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      return { ok: true, id: documentoId, srId: sr.id, status: activated.status };

    } catch (e) {
      const status = e.response?.status;
      if (status === 429 && attempt < MAX_ATTEMPTS) {
        process.stdout.write(` [429 rate limit, attendo ${WAIT_ON_429_MS / 1000}s...] `);
        await sleep(WAIT_ON_429_MS);
        continue;
      }

      const errData = e.response?.data;
      await pool.query(
        `UPDATE documenti
           SET yousign_status               = 'init_error',
               yousign_signature_request_id = NULL,
               yousign_document_id          = NULL,
               yousign_signer_id            = NULL,
               yousign_signature_link       = NULL,
               yousign_signature_link_expires_at = NULL
         WHERE id = $1`,
        [documentoId]
      );
      try { if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      return { ok: false, reason: e.message, details: errData, id: documentoId };
    }
  }
}

async function main() {
  const res = await pool.query(`
    SELECT d.id, d.utente_id, d.nome_file, d.url_file,
           u.nome, u.cognome, u.email
    FROM documenti d
    JOIN utenti u ON u.id = d.utente_id
    WHERE d.yousign_status = 'init_error'
      AND d.require_signature = true
      AND d.data_upload::date = '2026-08-08'
    ORDER BY d.id
  `);

  const docs = res.rows;
  console.log(`\n▶  Documenti da recuperare: ${docs.length}\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    process.stdout.write(`[${i + 1}/${docs.length}] doc #${doc.id} — ${doc.email} ... `);

    const result = await retryDoc(doc);

    if (result.ok) {
      ok++;
      console.log(`✅ ${result.status}`);
    } else {
      fail++;
      console.log(`❌ ${result.reason}`, result.details ? JSON.stringify(result.details) : "");
    }

    if (i < docs.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n✅ OK: ${ok}  ❌ Falliti: ${fail}  Totale: ${docs.length}`);
  await pool.end();
}

main().catch((e) => {
  console.error("Errore fatale:", e);
  process.exit(1);
});
