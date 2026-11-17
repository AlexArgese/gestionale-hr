/**
 * backend/services/libroPaga/calendario.js
 * Calendario del mese per il libro paga: giorni, domeniche e festività.
 * Funzioni pure, senza accesso a DB o rete: le festività nazionali sono date
 * fisse per legge più il Lunedì dell'Angelo, calcolato dalla data della Pasqua.
 */

const NOMI_MESI = [
  'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE',
];

// Festività nazionali a data fissa: [mese (1-12), giorno, nome]
const FESTIVITA_FISSE = [
  [1, 1, 'Capodanno'],
  [1, 6, 'Epifania'],
  [4, 25, 'Festa della Liberazione'],
  [5, 1, 'Festa del Lavoro'],
  [6, 2, 'Festa della Repubblica'],
  [8, 15, 'Ferragosto'],
  [11, 1, 'Ognissanti'],
  [12, 8, 'Immacolata Concezione'],
  [12, 25, 'Natale'],
  [12, 26, 'Santo Stefano'],
];

// Data della Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher).
function pasqua(anno) {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return { mese, giorno };
}

function lunediDellAngelo(anno) {
  const p = pasqua(anno);
  const d = new Date(Date.UTC(anno, p.mese - 1, p.giorno + 1));
  return { mese: d.getUTCMonth() + 1, giorno: d.getUTCDate() };
}

/**
 * Festività del mese: Map giorno -> nome.
 * `locali` aggiunge festività non nazionali (es. il patrono):
 * [{ mese, giorno, nome }].
 */
function festivitaDelMese(anno, mese, locali = []) {
  const out = new Map();
  for (const [m, g, nome] of FESTIVITA_FISSE) {
    if (m === mese) out.set(g, nome);
  }
  const angelo = lunediDellAngelo(anno);
  if (angelo.mese === mese) out.set(angelo.giorno, "Lunedì dell'Angelo");
  for (const f of locali) {
    if (f.mese === mese) out.set(f.giorno, f.nome);
  }
  return out;
}

function numeroGiorniDelMese(anno, mese) {
  return new Date(Date.UTC(anno, mese, 0)).getUTCDate();
}

/**
 * Giorni del mese, uno per elemento:
 * { giorno, dataStr: 'YYYY-MM-DD', domenica, festivita: nome | null }
 */
function giorniDelMese(anno, mese, locali = []) {
  const feste = festivitaDelMese(anno, mese, locali);
  const n = numeroGiorniDelMese(anno, mese);
  const mm = String(mese).padStart(2, '0');
  const giorni = [];
  for (let g = 1; g <= n; g++) {
    const giornoSettimana = new Date(Date.UTC(anno, mese - 1, g)).getUTCDay();
    giorni.push({
      giorno: g,
      dataStr: `${anno}-${mm}-${String(g).padStart(2, '0')}`,
      domenica: giornoSettimana === 0,
      festivita: feste.get(g) || null,
    });
  }
  return giorni;
}

// "2026-11" -> { anno: 2026, mese: 11 }; null se non valido.
function parseMese(str) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(str || ''));
  if (!m) return null;
  const anno = Number(m[1]);
  const mese = Number(m[2]);
  if (mese < 1 || mese > 12) return null;
  return { anno, mese };
}

module.exports = {
  NOMI_MESI,
  pasqua,
  lunediDellAngelo,
  festivitaDelMese,
  numeroGiorniDelMese,
  giorniDelMese,
  parseMese,
};
