const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../db");
const path = require("path");
const yousignClient = require("../services/yousignClient");

router.post(
  "/webhook",
  express.json({
    type: "*/*",
    verify: (req, res, buf, encoding) => {
      if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || "utf8");
      }
    },
  }),
  async (req, res) => {
    try {
      const secret = process.env.YOUSIGN_WEBHOOK_SECRET;
      const receivedSignature = req.get("X-Yousign-Signature-256") || "";

      if (!secret) {
        console.error("[YOUSIGN WEBHOOK] Missing YOUSIGN_WEBHOOK_SECRET");
        return res.status(500).json({ ok: false, error: "missing_webhook_secret" });
      }

      const digest = crypto
        .createHmac("sha256", secret)
        .update(req.rawBody || "", "utf8")
        .digest("hex");

      const expectedSignature = `sha256=${digest}`;

      const isValid =
        receivedSignature &&
        receivedSignature.length === expectedSignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(receivedSignature, "utf8"),
          Buffer.from(expectedSignature, "utf8")
        );

      if (!isValid) {
        console.error("[YOUSIGN WEBHOOK] Invalid signature");
        return res.status(401).json({ ok: false, error: "invalid_signature" });
      }

      console.log("[YOUSIGN WEBHOOK]", JSON.stringify(req.body, null, 2));

      const signatureRequestId = req.body?.data?.signature_request?.id;
      const status = req.body?.data?.signature_request?.status;
      const documentIdFromEvent = req.body?.data?.signature_request?.documents?.[0]?.id;

      if (!signatureRequestId) return res.json({ ok: true, ignored: true });

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

      const st = String(status || "unknown").toLowerCase();
      const isFinal = ["done", "completed", "signed"].includes(st);

      if (!isFinal) return res.json({ ok: true, status: st });

      const q = await pool.query(
        `SELECT id, url_file, yousign_document_id
           FROM documenti
          WHERE yousign_signature_request_id = $1
          LIMIT 1`,
        [signatureRequestId]
      );

      if (!q.rows.length) {
        return res.json({ ok: true, ignored: true, reason: "doc_not_found_in_db" });
      }

      const d = q.rows[0];
      const yousignDocId = d.yousign_document_id || documentIdFromEvent;

      if (!yousignDocId) {
        return res.json({ ok: true, ignored: true, reason: "missing_yousign_document_id" });
      }

      const pdfBuf = await yousignClient.downloadSignatureRequestDocument(
        signatureRequestId,
        yousignDocId
      );

      const { caricaBufferSuS3, scaricaBufferDaS3 } = require("../lib/s3");

      const keyOriginale = d.url_file?.startsWith("s3://")
        ? d.url_file.replace("s3://", "")
        : d.url_file;

      if (!keyOriginale) {
        return res.json({ ok: true, warning: "missing_s3_key" });
      }

      try {
        const origBuf = await scaricaBufferDaS3({ chiave: keyOriginale });
        const backupKey = `uploads/documenti/original_backup/${d.id}_ORIG_${Date.now()}_${path.basename(keyOriginale)}`;
        await caricaBufferSuS3({
          chiave: backupKey,
          buffer: origBuf,
          contentType: "application/pdf",
        });
      } catch (e) {
        console.warn("Backup originale fallito:", e?.message || e);
      }

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
        [d.id]
      );

      console.log("[YOUSIGN] Firmato salvato al posto dell'originale. documentoId:", d.id);

      return res.json({ ok: true, saved: true, documentoId: d.id });
    } catch (e) {
      console.error("webhook error", e);
      return res.status(200).json({ ok: true });
    }
  }
);

module.exports = router;