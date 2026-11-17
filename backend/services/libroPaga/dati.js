/**
 * backend/services/libroPaga/dati.js
 * Prepara i dipendenti del libro paga a partire da anagrafica e timbrature:
 * blocco (dalla sede), fisso o intermittente (dal tipo di contratto), giorni
 * lavorati nel mese. `preparaDipendenti` è pura; `caricaDatiMese` legge dal DB.
 */
const { getMinutiContratto } = require('../presenze/helpers');
const { numeroGiorniDelMese } = require('./calendario');
const {
  AREE,
  AREA_DA_ASSEGNARE,
  TOLLERANZA_GIORNATA_CORTA_MIN,
  MINUTI_TURNO_DEFAULT,
} = require('./config');

const RUOLI_NON_DIPENDENTI = new Set(['admin', 'wb_manager']);

function fmtDurata(minuti) {
  const tot = Math.round(minuti);
  const h = Math.floor(tot / 60);
  const m = tot % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

// Blocco del dipendente dal campo sede (una o più sedi separate da virgola).
function classificaSede(sedeStr) {
  const sedi = String(sedeStr || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const trovate = [];
  for (const sede of sedi) {
    const area = AREE.find((a) => a.match.test(sede));
    if (area && !trovate.includes(area)) trovate.push(area);
  }

  if (trovate.length === 0) {
    return {
      area: AREA_DA_ASSEGNARE,
      avviso: sedi.length
        ? `Sede non riconosciuta (${sedi.join(', ')}): blocco da assegnare`
        : 'Nessuna sede in anagrafica: blocco da assegnare',
    };
  }
  if (trovate.length > 1) {
    return {
      area: trovate[0],
      avviso: `Più sedi in anagrafica (${sedi.join(', ')}): assegnato al blocco ${trovate[0].nome}`,
    };
  }
  return { area: trovate[0], avviso: null };
}

function classificaContratto(tipoContratto, area) {
  const tipo = String(tipoContratto || '');
  const intermittente = /^chiamata/.test(tipo);
  const categoria = intermittente ? 'intermittente' : 'fisso';
  const avvisi = [];

  let minutiTurno = getMinutiContratto(tipo);
  if (!minutiTurno) {
    minutiTurno = MINUTI_TURNO_DEFAULT[categoria];
    avvisi.push(
      `Tipo di contratto non riconosciuto (${tipo || 'vuoto'}): usato il turno di ${fmtDurata(minutiTurno)}`
    );
  }

  let mensile = null;
  let oraria = null;
  if (intermittente) {
    oraria = area.intermittente.oraria;
    if (oraria == null) avvisi.push('Paga oraria da inserire');
  } else if (/^part_time/.test(tipo)) {
    avvisi.push(`Part-time ${fmtDurata(minutiTurno)}: stipendio mensile da inserire`);
  } else {
    mensile = area.fisso.mensile;
    if (mensile == null) avvisi.push('Stipendio mensile da inserire');
  }

  return {
    categoria,
    minutiTurno,
    mensile,
    oraria,
    rateoMensile1314: !intermittente && area.fisso.rateoMensile1314,
    avvisi,
  };
}

/**
 * utenti: [{ id, nome, cognome, tipo_contratto, sede, stato_attivo, ruolo }]
 * presenze: [{ utente_id, data_str: 'YYYY-MM-DD', ora_entrata, ora_uscita }]
 *
 * Ritorna i dipendenti da stampare, ordinati per cognome:
 * { id, cognome, nome, area, categoria, minutiTurno, mensile, oraria,
 *   rateoMensile1314, avvisi: [string],
 *   giorni: Map<giorno, { minuti, aperto, corta }> }
 */
function preparaDipendenti(utenti, presenze, { anno, mese }) {
  const prefisso = `${anno}-${String(mese).padStart(2, '0')}-`;
  const nGiorni = numeroGiorniDelMese(anno, mese);

  const perUtente = new Map();
  for (const p of presenze) {
    if (!p.data_str || !p.data_str.startsWith(prefisso)) continue;
    const giorno = Number(p.data_str.slice(8, 10));
    if (!(giorno >= 1 && giorno <= nGiorni)) continue;
    if (!perUtente.has(p.utente_id)) perUtente.set(p.utente_id, new Map());
    const giorni = perUtente.get(p.utente_id);
    const g = giorni.get(giorno) || { minuti: 0, aperto: false, corta: false };
    if (p.ora_entrata && p.ora_uscita) {
      g.minuti += (new Date(p.ora_uscita) - new Date(p.ora_entrata)) / 60000;
    } else {
      g.aperto = true;
    }
    giorni.set(giorno, g);
  }

  const dipendenti = [];
  for (const u of utenti) {
    const giorni = perUtente.get(u.id) || new Map();
    const { area, avviso } = classificaSede(u.sede);
    const contratto = classificaContratto(u.tipo_contratto, area);

    // In elenco: chi ha timbrato nel mese, più i fissi attivi senza timbrature
    // (lo stipendio mensile non dipende dalle presenze).
    const fissoAttivo =
      contratto.categoria === 'fisso' &&
      u.stato_attivo !== false &&
      !RUOLI_NON_DIPENDENTI.has(u.ruolo);
    if (giorni.size === 0 && !fissoAttivo) continue;

    for (const g of giorni.values()) {
      g.corta =
        !g.aperto && g.minuti < contratto.minutiTurno - TOLLERANZA_GIORNATA_CORTA_MIN;
    }

    const avvisi = [];
    if (avviso) avvisi.push(avviso);
    avvisi.push(...contratto.avvisi);
    if (giorni.size === 0) avvisi.push('Nessuna timbratura nel mese');

    dipendenti.push({
      id: u.id,
      cognome: String(u.cognome || '').trim(),
      nome: String(u.nome || '').trim(),
      area,
      categoria: contratto.categoria,
      minutiTurno: contratto.minutiTurno,
      mensile: contratto.mensile,
      oraria: contratto.oraria,
      rateoMensile1314: contratto.rateoMensile1314,
      avvisi,
      giorni,
    });
  }

  dipendenti.sort(
    (a, b) =>
      a.cognome.localeCompare(b.cognome, 'it', { sensitivity: 'base' }) ||
      a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })
  );
  return dipendenti;
}

// Legge anagrafica e timbrature del mese. Filtri opzionali come nell'export
// presenze: sedi (nomi) e società (ragione sociale).
async function caricaDatiMese(pool, { anno, mese, sedi = [], societa = [] }) {
  const values = [];
  const filters = [];

  if (sedi.length > 0) {
    const cond = sedi.map((nomeSede) => {
      values.push(String(nomeSede).trim());
      return `EXISTS (
        SELECT 1 FROM unnest(string_to_array(COALESCE(u.sede, ''), ',')) AS sede_item
        WHERE trim(sede_item) = $${values.length}
      )`;
    });
    filters.push(`(${cond.join(' OR ')})`);
  }
  if (societa.length > 0) {
    const cond = societa.map((nome) => {
      values.push(String(nome).trim());
      return `s.ragione_sociale = $${values.length}`;
    });
    filters.push(`(${cond.join(' OR ')})`);
  }
  const filterSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const utenti = await pool.query(
    `SELECT u.id, u.nome, u.cognome, u.tipo_contratto, u.sede, u.stato_attivo, u.ruolo
       FROM utenti u
       LEFT JOIN societa s ON s.id = u.societa_id
       ${filterSql}`,
    values
  );
  if (utenti.rows.length === 0) return [];

  const mm = String(mese).padStart(2, '0');
  const inizio = `${anno}-${mm}-01`;
  const fine =
    mese === 12 ? `${anno + 1}-01-01` : `${anno}-${String(mese + 1).padStart(2, '0')}-01`;

  const presenze = await pool.query(
    `SELECT utente_id, to_char(data, 'YYYY-MM-DD') AS data_str, ora_entrata, ora_uscita
       FROM presenze
      WHERE data >= $1 AND data < $2 AND utente_id = ANY($3::int[])`,
    [inizio, fine, utenti.rows.map((u) => u.id)]
  );

  return preparaDipendenti(utenti.rows, presenze.rows, { anno, mese });
}

module.exports = {
  fmtDurata,
  classificaSede,
  classificaContratto,
  preparaDipendenti,
  caricaDatiMese,
};
