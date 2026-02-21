// backend/scripts/upload_documenti_to_s3.js
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const mime = require("mime-types");
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION;

if (!BUCKET || !REGION) {
  console.error("❌ Devi impostare AWS_S3_BUCKET e AWS_REGION nelle variabili di ambiente");
  process.exit(1);
}

const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";

if (!accessKeyId || !secretAccessKey) {
  console.error("❌ Devi impostare AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY nelle variabili di ambiente");
  process.exit(1);
}

const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId, secretAccessKey },
});

const LOCAL_DIR = process.argv[2]; // es: /Users/.../backend/uploads/documenti

const ERROR_LOG = path.join(process.cwd(), "upload_errors.txt");
const OK_LOG = path.join(process.cwd(), "upload_success.txt");

// azzera i log ad ogni esecuzione (se preferisci appendere, commenta queste 2 righe)
try { fs.writeFileSync(ERROR_LOG, ""); } catch {}
try { fs.writeFileSync(OK_LOG, ""); } catch {}

async function* walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    // ✅ salta file/cartelle nascosti (es: .DS_Store, ._AppleDouble, ecc.)
    if (e.name.startsWith(".")) continue;

    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function toS3Key(localFile) {
  // vogliamo la chiave S3 uguale alla path relativa sotto "backend/"
  // es: .../backend/uploads/documenti/99/contratto/x.pdf  -> uploads/documenti/99/contratto/x.pdf
  const marker = `${path.sep}backend${path.sep}`;
  const idx = localFile.lastIndexOf(marker);

  if (idx === -1) {
    // fallback: carica dentro uploads/documenti/
    return `uploads/documenti/${path.basename(localFile)}`.split(path.sep).join("/");
  }

  const rel = localFile.slice(idx + marker.length); // e.g. uploads/documenti/...
  return rel.split(path.sep).join("/");
}

async function esisteGia(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e) {
    // NotFound / 404 = non esiste => ok
    if (e?.$metadata?.httpStatusCode === 404) return false;
    if (e?.name === "NotFound") return false;
    // altri errori (permessi, chiavi ecc.) li gestiamo come "non esiste" ma loggando quando accade nell'upload
    return false;
  }
}

async function uploadOne(filePath, key) {
  const contentType = mime.lookup(filePath) || "application/octet-stream";
  const body = fs.createReadStream(filePath);

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return { key, contentType };
}

function logError(filePath, key, err) {
  const msg = `❌ FILE: ${filePath}\n   KEY:  ${key}\n   ERRORE: ${err?.name || ""} ${err?.message || err}\n\n`;
  process.stderr.write(msg);
  try { fs.appendFileSync(ERROR_LOG, msg); } catch {}
}

function logOk(key) {
  const msg = `✅ ${key}\n`;
  process.stdout.write(msg);
  try { fs.appendFileSync(OK_LOG, msg); } catch {}
}

(async () => {
  if (!LOCAL_DIR) {
    console.error("Uso: node scripts/upload_documenti_to_s3.js /percorso/assoluto/uploads/documenti");
    process.exit(1);
  }

  const stat = await fsp.stat(LOCAL_DIR).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    console.error("❌ Cartella non trovata:", LOCAL_DIR);
    process.exit(1);
  }

  console.log("Bucket:", BUCKET);
  console.log("Regione:", REGION);
  console.log("Cartella locale:", LOCAL_DIR);
  console.log("Modalità:", "riprendi (salta file già presenti su S3)");
  console.log("Log errori:", ERROR_LOG);
  console.log("Log successi:", OK_LOG);
  console.log("\nInizio upload...\n");

  let caricati = 0;
  let saltati = 0;
  let errori = 0;

  for await (const file of walk(LOCAL_DIR)) {
    const key = toS3Key(file);

    try {
      // ✅ riprendi: se esiste già su S3, salta
      const gia = await esisteGia(key);
      if (gia) {
        saltati++;
        continue;
      }

      await uploadOne(file, key);
      caricati++;
      logOk(key);
    } catch (e) {
      errori++;
      logError(file, key, e);
    }
  }

  console.log("\nFinito.");
  console.log("Caricati:", caricati);
  console.log("Saltati (già su S3):", saltati);
  console.log("Errori:", errori);

  if (errori > 0) process.exit(2);
})();
