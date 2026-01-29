const express = require("express");
const router = express.Router();
const pool = require("../db");
const path = require("path");
const fs = require("fs");
const yousignClient = require("../services/yousignClient");

// Yousign ti chiamerà qui
router.post("/webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    console.log("[YOUSIGN WEBHOOK]", JSON.stringify(req.body, null, 2));

    const signatureRequestId = req.body?.data?.signature_request?.id;
    const status = req.body?.data?.signature_request?.status;
    const documentIdFromEvent = req.body?.data?.signature_request?.documents?.[0]?.id;

    if (!signatureRequestId) return res.json({ ok: true, ignored: true });

    // aggiorna status sempre (utile)
    await pool.query(
    `UPDATE documenti
        SET yousign_status = $1::text,
            yousign_completed_at = CASE
            WHEN $1::text IN ('completed','done','signed') THEN NOW()
            ELSE yousign_completed_at
            END
    WHERE yousign_signature_request_id = $2`,
    [String(status || "unknown"), signatureRequestId]
    );


    // se non è done, non scaricare nulla
    const st = String(status || "unknown").toLowerCase();

    // considera "finali" più status possibili
    const isFinal = ["done", "completed", "signed"].includes(st);

    // se non è finale, non scaricare nulla
    if (!isFinal) return res.json({ ok: true, status: st });


    // prendi il record documento dal DB
    const q = await pool.query(
      `SELECT id, url_file, yousign_document_id
         FROM documenti
        WHERE yousign_signature_request_id = $1
        LIMIT 1`,
      [signatureRequestId]
    );
    if (!q.rows.length) return res.json({ ok: true, ignored: true, reason: "doc_not_found_in_db" });

    const d = q.rows[0];

    // usa document id dal DB se presente, altrimenti quello dell'evento
    const yousignDocId = d.yousign_document_id || documentIdFromEvent;
    if (!yousignDocId) return res.json({ ok: true, ignored: true, reason: "missing_yousign_document_id" });

    // scarica il PDF firmato
    const pdfBuf = await yousignClient.downloadSignatureRequestDocument(signatureRequestId, yousignDocId);

    // sovrascrivi il file originale su disco
    const absOriginal = path.join(__dirname, "..", d.url_file);
    if (!fs.existsSync(absOriginal)) {
      console.warn("[YOUSIGN] file originale non trovato:", absOriginal);
      return res.json({ ok: true, warning: "original_file_missing" });
    }

    fs.writeFileSync(absOriginal, pdfBuf);

    // marca firmato
    await pool.query(
      `UPDATE documenti
          SET signed_at = NOW(),
              yousign_status = 'done',
              url_file_signed = NULL
        WHERE id = $1`,
      [d.id]
    );

    console.log("[YOUSIGN] Firmato salvato al posto dell'originale. documentoId:", d.id);

    res.json({ ok: true, saved: true, documentoId: d.id });
  } catch (e) {
    console.error("webhook error", e);
    res.status(200).json({ ok: true }); // evita retry infiniti
  }
});

module.exports = router;
