// backend/services/yousignClient.js
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");


const baseURL =
  process.env.YOUSIGN_BASE_URL || "https://api-sandbox.yousign.app/v3";
const apiKey = process.env.YOUSIGN_API_KEY;

if (!apiKey) {
  console.warn(
    "[Yousign] WARNING: YOUSIGN_API_KEY non impostata nel .env"
  );
}


const api = axios.create({
  baseURL,
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});

async function request(method, url, data, config = {}) {
  try {
    const res = await api.request({ method, url, data, ...config });
    return res.data;
  } catch (err) {
    console.error(
      "[Yousign] Error",
      method,
      url,
      err.response?.status,
      err.response?.data
    );
    throw err;
  }
}

async function createSignatureRequest({ name, deliveryMode = "email" }) {
  const payload = {
    name,
    delivery_mode: deliveryMode,
    timezone: "Europe/Rome",
  };

  return request("POST", "/signature_requests", payload);
}


async function downloadSignatureRequestDocument(signatureRequestId, documentId) {
  try {
    const res = await api.get(
      `/signature_requests/${signatureRequestId}/documents/${documentId}/download`,
      {
        responseType: "arraybuffer",
        headers: { Accept: "application/pdf" },
      }
    );
    return Buffer.from(res.data);
  } catch (err) {
    const status = err.response?.status;
    let body = err.response?.data;

    // se è arraybuffer/buffer -> converti in stringa leggibile
    if (body && (Buffer.isBuffer(body) || body instanceof ArrayBuffer)) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      body = buf.toString("utf8");
    }

    console.error("[Yousign] download failed", {
      status,
      body,
      message: err.message,
      code: err.code,
    });

    throw err;
  }
}


async function getSignatureRequest(signatureRequestId) {
  return request("GET", `/signature_requests/${signatureRequestId}`, null);
}


async function uploadDocumentToRequest(signatureRequestId, filePath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  form.append("nature", "signable_document"); // tipo documento
  form.append("name", "Contratto test");

  try {
    const res = await api.post(
      `/signature_requests/${signatureRequestId}/documents`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    return res.data;
  } catch (err) {
    console.error(
      "[Yousign] Error uploadDocumentToRequest",
      err.response?.status,
      err.response?.data
    );
    throw err;
  }
}

async function addSigner(signatureRequestId, signerData) {
  const payload = {
    info: {
      first_name: signerData.firstName,
      last_name: signerData.lastName,
      email: signerData.email,
      locale: "it",
      // phone_number: signerData.phoneNumber || null, // servirà se usiamo otp_sms
    },
    signature_level: "electronic_signature",          // SES semplice
    signature_authentication_mode: "no_otp",          // 👈 NOME GIUSTO + valore valido
    fields: [],
  };

  console.log("🔥 PAYLOAD SIGNER INVIATO:", payload);

  return request(
    "POST",
    `/signature_requests/${signatureRequestId}/signers`,
    payload
  );
}



async function addSignatureField(signatureRequestId, signerId, documentId, field) {
  const safeField = field && typeof field === "object" ? field : {};
  const payload = {
    signer_id: signerId,
    type: "signature",
    page: Number.isFinite(safeField.page) ? safeField.page : 1, // 1-based
    x: Number.isFinite(safeField.x) ? safeField.x : 100,
    y: Number.isFinite(safeField.y) ? safeField.y : 100,
    width: Number.isFinite(safeField.width) ? safeField.width : 180,
    height: Number.isFinite(safeField.height) ? safeField.height : 60,
  };

  return request(
    "POST",
    `/signature_requests/${signatureRequestId}/documents/${documentId}/fields`,
    payload
  );
}




async function activateSignatureRequest(signatureRequestId) {
  return request(
    "POST",
    `/signature_requests/${signatureRequestId}/activate`,
    {}
  );
}

module.exports = {
  createSignatureRequest,
  uploadDocumentToRequest,
  addSigner,
  addSignatureField,
  activateSignatureRequest,
  downloadSignatureRequestDocument,
  getSignatureRequest,
};
