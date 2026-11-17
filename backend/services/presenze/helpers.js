/**
 * backend/services/presenze/helpers.js
 * Funzioni di utilità pure (nessun accesso a DB) usate dalle rotte di
 * /backend/routes/presenze.js e dai moduli services/presenze/*.
 */
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

const JITTER_USCITA_MS = 10 * 60 * 1000; // 10 minuti

// Applica un jitter random (± 10 minuti) all'uscita cappata, così da non
// lasciare un'uscita che cade esattamente a entrata + ore di contratto.
// Non scende mai sotto ora_entrata; se è nota l'ora reale di uscita non la supera mai.
function randomizzaUscitaCappata(cappata, entrata, limiteSuperiore) {
  const lower = Math.max(cappata.getTime() - JITTER_USCITA_MS, entrata.getTime() + 1000);
  const upperRaw = cappata.getTime() + JITTER_USCITA_MS;
  const upper = limiteSuperiore ? Math.min(upperRaw, limiteSuperiore.getTime() - 1000) : upperRaw;
  if (upper <= lower) return cappata;
  return new Date(Math.round(lower + Math.random() * (upper - lower)));
}

// 🔹 Data locale "YYYY-MM-DD" (evita UTC)
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMinutiContratto(tipoContratto) {
  const map = {
    full_time: 400,   // 6h 40m
    part_time_2: 120,
    part_time_3: 180,
    part_time_4: 240,
    part_time_6: 360,
    part_time_8: 480,
    chiamata_6: 360,
  };

  return map[tipoContratto] ?? 0;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function styleHeaderRow(row, bgColor = 'D0933C') {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgColor}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
  });
}

function autoWidths(sheet, min = 8, max = 50) {
  sheet.columns.forEach((col) => {
    let w = min;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value != null ? String(cell.value).length : 0;
      if (len > w) w = len;
    });
    col.width = Math.min(w + 3, max);
  });
}

function toSuperscript(n) {
  const map = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(n).split('').map(c => map[c] || c).join('');
}

function labelDurata(minuti) {
  if (minuti < 60)  return '<1h';
  if (minuti < 120) return '<2h';
  if (minuti < 180) return '<3h';
  if (minuti < 240) return '<4h';
  return 'P';
}

module.exports = {
  generateToken,
  randomizzaUscitaCappata,
  localDateStr,
  getMinutiContratto,
  addMinutes,
  styleHeaderRow,
  autoWidths,
  toSuperscript,
  labelDurata,
};
