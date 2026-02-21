// backend/lib/s3.js
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const REGIONE = process.env.AWS_REGION;
const BUCKET = process.env.AWS_S3_BUCKET;

if (!REGIONE || !BUCKET) {
  throw new Error("Mancano AWS_REGION o AWS_S3_BUCKET nelle variabili d'ambiente");
}

const s3 = new S3Client({
  region: REGIONE,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// chiave tipo: documenti/159/CONTRATTO/170..._file.pdf
function creaChiaveS3({ utenteId, tipoDocumento, nomeFile }) {
  const safeName = String(nomeFile || "file")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_");

  const tipo = String(tipoDocumento || "ALTRO").trim().toLowerCase(); // cartella leggibile
  const uid = Number.isInteger(Number(utenteId)) ? Number(utenteId) : 0;

  return `uploads/documenti/${uid}/${tipo}/${Date.now()}_${safeName}`;
}
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function scaricaBufferDaS3({ chiave }) {
  const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: chiave }));
  if (!r.Body) throw new Error("Body vuoto da S3");
  return await streamToBuffer(r.Body);
}


async function caricaBufferSuS3({ chiave, buffer, contentType }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: chiave,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  );
}

async function urlFirmatoGet({ chiave, scadeSecondi = 60, nomeDownload = null, inline = false }) {
  const params = { Bucket: BUCKET, Key: chiave };

  if (nomeDownload) {
    const dispo = inline ? "inline" : "attachment";
    params.ResponseContentDisposition = `${dispo}; filename="${nomeDownload}"`;
  }

  const cmd = new GetObjectCommand(params);
  return await getSignedUrl(s3, cmd, { expiresIn: scadeSecondi });
}


async function eliminaDaS3({ chiave }) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: chiave }));
}

module.exports = {
  creaChiaveS3,
  caricaBufferSuS3,
  scaricaBufferDaS3,
  urlFirmatoGet,
  eliminaDaS3,
};
