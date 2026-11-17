/**
 * backend/services/documenti/helpers.js
 * Funzioni di utilità pure (nessun accesso a DB/S3/API esterne) usate dalle
 * rotte di /backend/routes/documenti.js.
 */
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

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

function parseBool(v) {
  return v === true || v === "true" || v === 1 || v === "1" || v === "on";
}

/** token "pulito" per usare nome/cognome dentro un nome file */
function sanitizeNameToken(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

/**
 * Inserisce "_Nome_Cognome" prima dell'estensione.
 * es: ("CONTRATTO 2024.pdf", "Mario", "Rossi") -> "CONTRATTO 2024_Mario_Rossi.pdf"
 */
function appendNomeCognome(fileName, nome, cognome) {
  const token = [sanitizeNameToken(nome), sanitizeNameToken(cognome)]
    .filter(Boolean)
    .join("_");
  if (!token) return fileName;
  const m = String(fileName).match(/^(.*?)(\.[A-Za-z0-9]+)$/);
  return m ? `${m[1]}_${token}${m[2]}` : `${fileName}_${token}`;
}

function parseJsonSafe(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** data odierna in formato it: GG/MM/AAAA */
function fmtDataIt(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** rende una stringa scrivibile con Helvetica standard (WinAnsi) */
function sanitizeWinAnsi(s) {
  return String(s || "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

/**
 * Normalizza un placement (px o percentuale) in frazioni 0..1 TOP-LEFT
 * riferite all'area VISIBILE della pagina (come la mostra pdf.js), + indice pagina.
 * Ritorna anche wf/hf (frazione larghezza/altezza del riquadro).
 */
function frazioneDaPlacement(pl) {
  if (!pl || typeof pl !== "object") return null;

  const pageIndex = Math.max(
    0,
    Math.round(
      Number.isFinite(Number(pl.pageIndex))
        ? Number(pl.pageIndex)
        : Number.isFinite(Number(pl.page))
        ? Number(pl.page) - 1
        : 0
    )
  );

  let xf;
  let yf;
  let wf;
  let hf;

  const xPct = Number(pl.xPct);
  const yPct = Number(pl.yPct);
  if (Number.isFinite(xPct) && Number.isFinite(yPct)) {
    xf = xPct;
    yf = yPct;
    wf = Number(pl.wPct);
    hf = Number(pl.hPct);
  } else {
    const pageW = Number(pl.pageW);
    const pageH = Number(pl.pageH);
    if (!(pageW > 0 && pageH > 0)) return null;
    xf = Number(pl.x) / pageW;
    yf = Number(pl.y) / pageH;
    wf = Number(pl.width) / pageW;
    hf = Number(pl.height) / pageH;
  }

  if (!Number.isFinite(xf) || !Number.isFinite(yf)) return null;

  return {
    xf: clamp01(xf),
    yf: clamp01(yf),
    wf: Number.isFinite(wf) ? Math.max(0, wf) : 0,
    hf: Number.isFinite(hf) ? Math.max(0, hf) : 0,
    pageIndex,
  };
}

/**
 * Scrive testi fissi (intestazione / data) dentro il PDF con pdf-lib, 12px Helvetica.
 * Mappa la posizione nello STESSO spazio visibile mostrato da pdf.js:
 * tiene conto di CropBox e rotazione della pagina. La baseline del testo è
 * centrata verticalmente nel riquadro, allineata al bordo sinistro.
 * Ritorna un Buffer nuovo; in caso di errore ritorna il buffer originale.
 */
async function applicaTestiPdf(buffer, jobs = []) {
  const validi = (jobs || []).filter((j) => j && j.text && j.placement);
  if (!validi.length) return buffer;

  try {
    const pdf = await PDFDocument.load(buffer);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();
    const SIZE = 12;

    for (const j of validi) {
      const fr = frazioneDaPlacement(j.placement);
      if (!fr) continue;

      const page = pages[Math.min(fr.pageIndex, pages.length - 1)];
      if (!page) continue;

      const cb = page.getCropBox(); // { x, y, width, height }
      const cw = cb.width;
      const ch = cb.height;
      const rot = (((page.getRotation().angle || 0) % 360) + 360) % 360;
      const rotated = rot === 90 || rot === 270;

      // dimensioni "viste" (come pdf.js): per 90/270 sono scambiate
      const vw = rotated ? ch : cw;
      const vh = rotated ? cw : ch;

      const text = sanitizeWinAnsi(j.text);
      const boxH = fr.hf * vh;

      // ancora nello spazio visibile (origine in alto a sx)
      const vX = fr.xf * vw;
      // baseline = centro verticale del riquadro (+ correzione cap-height)
      const vY = fr.yf * vh + (boxH > 0 ? boxH / 2 : SIZE / 2) + SIZE * 0.32;

      // visibile(top-left) -> cropbox-local top-left nello spazio NON ruotato (cw x ch)
      let xTl;
      let yTl;
      if (rot === 90) {
        xTl = vY;
        yTl = ch - vX;
      } else if (rot === 180) {
        xTl = cw - vX;
        yTl = ch - vY;
      } else if (rot === 270) {
        xTl = cw - vY;
        yTl = vX;
      } else {
        xTl = vX;
        yTl = vY;
      }

      const X = cb.x + xTl;
      const Y = cb.y + (ch - yTl); // -> origine in basso

      page.drawText(text, {
        x: X,
        y: Y,
        size: SIZE,
        font,
        color: rgb(0, 0, 0),
        rotate: degrees(rot), // testo orizzontale anche su pagine ruotate
      });
    }

    const out = await pdf.save();
    return Buffer.from(out);
  } catch (e) {
    console.warn("[documenti] applicaTestiPdf fallito, uso l'originale:", e.message || e);
    return buffer;
  }
}

function parseSignaturePlacement(body) {
  if (body?.signature_placement || body?.signaturePlacement) {
    try {
      return JSON.parse(body.signature_placement || body.signaturePlacement);
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = {
  normalizzaChiaveS3,
  normalizeTipo,
  validateTipo,
  parseBool,
  sanitizeNameToken,
  appendNomeCognome,
  parseJsonSafe,
  fmtDataIt,
  clamp01,
  sanitizeWinAnsi,
  frazioneDaPlacement,
  applicaTestiPdf,
  parseSignaturePlacement,
};
