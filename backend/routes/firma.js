// backend/routes/firma.js
const express = require("express");
const router = express.Router();
const yousignClient = require("../services/yousignClient");
const path = require("path");

console.log("✅ YOUSIGN CLIENT IMPORT:", yousignClient);

// TEST: crea una signature request vuota
router.post("/test", async (req, res) => {
  try {
    const data = await yousignClient.createSignatureRequest({
      name: "Test ClockEasy",
      deliveryMode: "email",
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/test-doc", async (req, res) => {
  try {
    // 1) crea una signature request
    const sr = await yousignClient.createSignatureRequest({
      name: "Contratto test",
      deliveryMode: "email",
    });

    // 2) usa un PDF di test semplice
    const filePath = path.join(
      __dirname,
      "..",
      "uploads",
      "documenti",
      "159",
      "comunicazioni",
      "COMUNICATO IMPORTANTE.pdf"
    );

    // 3) allega il PDF
    const doc = await yousignClient.uploadDocumentToRequest(sr.id, filePath);

    res.json({ ok: true, signatureRequest: sr, document: doc });
  } catch (err) {
    console.error("[/firma/test-doc] error", err.response?.data || err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/test-flow", async (req, res) => {
  try {
    // 1) Signature request
    const sr = await yousignClient.createSignatureRequest({
      name: "Contratto completo",
      deliveryMode: "email",
    });

    // 2) Documento
    const filePath = path.join(
      __dirname,
      "..",
      "uploads",
      "documenti",
      "159",
      "comunicazioni",
      "COMUNICATO IMPORTANTE 2.pdf"
    );
    const doc = await yousignClient.uploadDocumentToRequest(sr.id, filePath);

    // 3) Signer
    const signer = await yousignClient.addSigner(sr.id, {
      firstName: "Alex",
      lastName: "Argese",
      email: "argesealex@gmail.com",
    });

    // 4) Field firma sul documento
    const field = await yousignClient.addSignatureField(
      sr.id,
      signer.id,
      doc.id
    );

    // 5) Attivazione (manda l’email e rende tutto vivo)
    const activated = await yousignClient.activateSignatureRequest(sr.id);

    res.json({
      ok: true,
      sr,
      doc,
      signer,
      field,
      activated,
    });
  } catch (err) {
    console.error("[/firma/test-flow]", err.response?.data || err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


router.post("/create", async (req, res) => {
  try {
    const { filePath, signer } = req.body;

    if (!filePath || !signer?.firstName || !signer?.lastName || !signer?.email) {
      return res.status(400).json({
        ok: false,
        error: "Missing params: filePath, signer.firstName, signer.lastName, signer.email",
      });
    }

    // 1) Signature request
    const sr = await yousignClient.createSignatureRequest({
      name: "Contratto",
      deliveryMode: "email",
    });

    // 2) Documento (accetta path relativo oppure assoluto)
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(__dirname, "..", filePath);

    const doc = await yousignClient.uploadDocumentToRequest(sr.id, absolutePath);

    // 3) Signer
    const createdSigner = await yousignClient.addSigner(sr.id, signer);

    // 4) Campo firma
    await yousignClient.addSignatureField(sr.id, createdSigner.id, doc.id);

    // 5) Activate
    const activated = await yousignClient.activateSignatureRequest(sr.id);

    const signatureLink = activated?.signers?.[0]?.signature_link || null;

    return res.json({
      ok: true,
      signatureRequestId: sr.id,
      documentId: doc.id,
      signerId: createdSigner.id,
      status: activated.status,
      signatureLink,
    });
  } catch (err) {
    console.error("[/firma/create]", err.response?.data || err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      details: err.response?.data,
    });
  }
});

module.exports = router;

