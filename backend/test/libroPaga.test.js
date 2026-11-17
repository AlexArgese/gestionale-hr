/**
 * Test del libro paga. Esecuzione: node --test backend/test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pasqua,
  lunediDellAngelo,
  festivitaDelMese,
  giorniDelMese,
  parseMese,
} = require('../services/libroPaga/calendario');
const { classificaSede, preparaDipendenti } = require('../services/libroPaga/dati');
const { generaLibroPaga, creaLayout, lettera } = require('../services/libroPaga/excel');

const vicino = (a, b, eps = 0.005) =>
  assert.ok(Math.abs(a - b) < eps, `atteso ${b}, ottenuto ${a}`);

/* ------------------------------- calendario ------------------------------- */

test('Pasqua e Lunedì dell\'Angelo', () => {
  assert.deepEqual(pasqua(2024), { mese: 3, giorno: 31 });
  assert.deepEqual(pasqua(2025), { mese: 4, giorno: 20 });
  assert.deepEqual(pasqua(2026), { mese: 4, giorno: 5 });
  assert.deepEqual(pasqua(2027), { mese: 3, giorno: 28 });
  // Pasqua il 31 marzo: il lunedì cade nel mese dopo.
  assert.deepEqual(lunediDellAngelo(2024), { mese: 4, giorno: 1 });
  assert.deepEqual(lunediDellAngelo(2026), { mese: 4, giorno: 6 });
});

test('festività del mese', () => {
  assert.deepEqual([...festivitaDelMese(2026, 4).keys()].sort((a, b) => a - b), [6, 25]);
  assert.deepEqual([...festivitaDelMese(2026, 12).keys()].sort((a, b) => a - b), [8, 25, 26]);
  assert.equal(festivitaDelMese(2026, 9).size, 0);
  const conPatrono = festivitaDelMese(2026, 9, [{ mese: 9, giorno: 10, nome: 'Patrono' }]);
  assert.equal(conPatrono.get(10), 'Patrono');
});

test('giorni del mese: numero di giorni e domeniche', () => {
  assert.equal(giorniDelMese(2026, 2).length, 28);
  assert.equal(giorniDelMese(2028, 2).length, 29);
  assert.equal(giorniDelMese(2026, 10).length, 31);

  const nov = giorniDelMese(2026, 11);
  assert.equal(nov.length, 30);
  assert.deepEqual(nov.filter((g) => g.domenica).map((g) => g.giorno), [1, 8, 15, 22, 29]);
  assert.equal(nov[0].festivita, 'Ognissanti');
  assert.equal(nov[0].dataStr, '2026-11-01');
});

test('parseMese', () => {
  assert.deepEqual(parseMese('2026-11'), { anno: 2026, mese: 11 });
  assert.equal(parseMese('2026-13'), null);
  assert.equal(parseMese('novembre'), null);
});

/* ---------------------------------- dati ---------------------------------- */

test('blocco dalla sede', () => {
  assert.equal(classificaSede('ACQUAPARK').area.id, 'acquapark');
  assert.equal(classificaSede('ZooSafari').area.id, 'zoo_hotel');
  assert.equal(classificaSede('Hotel').area.id, 'zoo_hotel');
  assert.equal(classificaSede('Fasanolandia').area.id, 'fasanolandia');

  const piuSedi = classificaSede('Acquapark, ZooSafari');
  assert.equal(piuSedi.area.id, 'acquapark');
  assert.match(piuSedi.avviso, /Più sedi/);

  const ignota = classificaSede('Magazzino');
  assert.equal(ignota.area.id, 'da_assegnare');
  assert.match(ignota.avviso, /non riconosciuta/);
});

const UTENTI = [
  { id: 1, nome: 'Mario', cognome: 'Rossi', tipo_contratto: 'full_time', sede: 'ACQUAPARK', stato_attivo: true, ruolo: 'dipendente' },
  { id: 2, nome: 'Anna', cognome: 'Bianchi', tipo_contratto: 'chiamata_6', sede: 'ZooSafari', stato_attivo: true, ruolo: 'dipendente' },
  { id: 3, nome: 'Luca', cognome: 'Verdi', tipo_contratto: 'chiamata_6', sede: 'ACQUAPARK', stato_attivo: true, ruolo: 'dipendente' },
  { id: 4, nome: 'Sara', cognome: 'Neri', tipo_contratto: 'part_time_4', sede: 'Hotel', stato_attivo: true, ruolo: 'dipendente' },
  { id: 5, nome: 'Ada', cognome: 'Admin', tipo_contratto: 'full_time', sede: 'ACQUAPARK', stato_attivo: true, ruolo: 'admin' },
];

// Turno intero in un giorno di dicembre 2026 (ora locale del processo).
function turno(utente_id, giorno, minuti = null) {
  const data_str = `2026-12-${String(giorno).padStart(2, '0')}`;
  const entrata = new Date(2026, 11, giorno, 9, 0, 0);
  return {
    utente_id,
    data_str,
    ora_entrata: entrata,
    ora_uscita: minuti == null ? null : new Date(entrata.getTime() + minuti * 60000),
  };
}

const PRESENZE = [
  // Rossi (fisso 6:40): 3 giorni, di cui domenica 6 dicembre
  turno(1, 1, 400), turno(1, 2, 395), turno(1, 6, 400),
  // Bianchi (intermittente Zoo): domenica 6, festivo 8 (Immacolata), 9 corta, 10 aperta
  turno(2, 6, 360), turno(2, 8, 360), turno(2, 9, 180), turno(2, 10, null),
  // presenza di un altro mese: ignorata
  { utente_id: 2, data_str: '2026-11-30', ora_entrata: new Date(2026, 10, 30, 9), ora_uscita: new Date(2026, 10, 30, 15) },
];

test('preparaDipendenti: inclusione, ordine, giornate', () => {
  const dip = preparaDipendenti(UTENTI, PRESENZE, { anno: 2026, mese: 12 });

  // Verdi (intermittente senza timbrature) e l'admin senza timbrature restano fuori;
  // Neri (fisso attivo senza timbrature) resta in elenco.
  assert.deepEqual(dip.map((d) => d.cognome), ['Bianchi', 'Neri', 'Rossi']);

  const rossi = dip.find((d) => d.cognome === 'Rossi');
  assert.equal(rossi.categoria, 'fisso');
  assert.equal(rossi.mensile, 1378.55);
  assert.equal(rossi.giorni.size, 3);
  assert.equal(rossi.giorni.get(2).corta, false); // 5 minuti in meno: entro la tolleranza

  const bianchi = dip.find((d) => d.cognome === 'Bianchi');
  assert.equal(bianchi.categoria, 'intermittente');
  assert.equal(bianchi.oraria, 8.01483);
  assert.equal(bianchi.giorni.size, 4);
  assert.equal(bianchi.giorni.get(9).corta, true);
  assert.equal(bianchi.giorni.get(10).aperto, true);

  const neri = dip.find((d) => d.cognome === 'Neri');
  assert.equal(neri.mensile, null);
  assert.equal(neri.minutiTurno, 240);
  assert.ok(neri.avvisi.some((a) => /Part-time/.test(a)));
});

/* ---------------------------------- excel --------------------------------- */

function valore(ws, riga, colonna) {
  const v = ws.getCell(riga, colonna).value;
  return v && typeof v === 'object' && 'result' in v ? v.result : v;
}

test('layout: colonne dopo il calendario', () => {
  assert.equal(lettera(1), 'A');
  assert.equal(lettera(27), 'AA');
  assert.equal(lettera(61), 'BI');
  // Con 30 giorni le colonne coincidono con il modello: GG in AG, LORDO in AW.
  const l30 = creaLayout(30);
  assert.equal(lettera(l30.col.GG), 'AG');
  assert.equal(lettera(l30.col.LORDO), 'AW');
  assert.equal(lettera(l30.ultima), 'BI');
  // Con 31 giorni tutto scorre di una colonna.
  assert.equal(lettera(creaLayout(31).col.GG), 'AH');
});

test('scheda fisso Acquapark: importi come nel modello', () => {
  const dipendenti = preparaDipendenti(UTENTI, PRESENZE, { anno: 2026, mese: 12 });
  const wb = generaLibroPaga({ anno: 2026, mese: 12, dipendenti });
  const ws = wb.getWorksheet('Fisso Acquapark');
  assert.ok(ws, 'foglio Fisso Acquapark');
  const { col } = creaLayout(31);

  // Scheda in righe 1-6: dati in 4, 5, 6.
  assert.match(String(ws.getCell(3, 3).value), /ROSSI MARIO/);
  assert.equal(valore(ws, 4, col.GG), 3); // giorni lavorati
  assert.equal(valore(ws, 6, col.GG), 1); // domeniche lavorate
  assert.equal(valore(ws, 4, col.PAGA), 1378.55);
  assert.equal(valore(ws, 5, col.PAGA), 53.02);
  assert.equal(valore(ws, 6, col.PAGA), 8.01483);
  assert.equal(valore(ws, 6, col.RETR_ORD), 1378.55);
  vicino(valore(ws, 5, col.R1314), 114.879);
  vicino(valore(ws, 5, col.DOM10), 6.667); // ore domenicali in decimale
  vicino(valore(ws, 6, col.DOM10), 6.6667 * 8.01483 * 0.1);
  // Lordo = stipendio + 13ª + 14ª + maggiorazione domenicale
  vicino(valore(ws, 6, col.LORDO), 1378.55 + 2 * (1378.55 / 12) + 6.6667 * 8.01483 * 0.1);
  assert.match(ws.getCell(6, col.LORDO).value.formula, /^SUM\(AL6:AW6,AS5\)$/);
});

test('scheda intermittente Zoo: lordo corretto e festivi lavorati', () => {
  const dipendenti = preparaDipendenti(UTENTI, PRESENZE, { anno: 2026, mese: 12 });
  const wb = generaLibroPaga({ anno: 2026, mese: 12, dipendenti });
  const ws = wb.getWorksheet('Intermit. Zoosafari & Hotel');
  assert.ok(ws, 'foglio Intermit. Zoosafari & Hotel');
  const { col, colGiorno } = creaLayout(31);

  const paga = 8.01483;
  const ore = 4 * 6;
  assert.equal(valore(ws, 4, col.GG), 4);
  assert.equal(valore(ws, 4, col.ORE), ore);
  assert.equal(valore(ws, 5, col.FEST), 1); // 8 dicembre lavorato
  assert.equal(ws.getCell(5, colGiorno(8)).value, 1);
  assert.equal(valore(ws, 6, col.GG), 1); // domenica 6 dicembre

  const retr = ore * paga;
  const rol = ore * 0.05041 * paga;
  const ferie = ore * 0.10093 * paga;
  const rateo = 0.6679 * ore;
  const fest = 6 * paga * 0.2;
  const dom = 6 * paga * 0.1;
  vicino(valore(ws, 5, col.RETR_ORD), retr);
  vicino(valore(ws, 5, col.R1314), rateo);
  vicino(valore(ws, 5, col.LORDO), retr + rol + ferie + 2 * rateo + fest + dom);
  assert.ok(valore(ws, 5, col.LORDO) > 0, 'il lordo non deve essere 0 come nel modello');

  // Giornata corta e uscita non timbrata: segnalate con una nota.
  assert.match(ws.getCell(4, colGiorno(9)).note, /Giornata corta/);
  assert.match(ws.getCell(4, colGiorno(10)).note, /Uscita non timbrata/);
});

test('fissi Zoosafari & Hotel: nessun rateo di 13ª/14ª nel lordo', () => {
  const utenti = [
    { id: 9, nome: 'Zoe', cognome: 'Gialli', tipo_contratto: 'full_time', sede: 'ZooSafari', stato_attivo: true, ruolo: 'dipendente' },
  ];
  const dipendenti = preparaDipendenti(utenti, [], { anno: 2026, mese: 11 });
  const wb = generaLibroPaga({ anno: 2026, mese: 11, dipendenti });
  const ws = wb.getWorksheet('Fisso Zoosafari & Hotel');
  const { col } = creaLayout(30);
  assert.equal(valore(ws, 4, col.PAGA), 2231.84);
  assert.equal(valore(ws, 5, col.PAGA), 85.84);
  assert.equal(valore(ws, 6, col.PAGA), 12.97581);
  assert.equal(ws.getCell(5, col.R1314).value, null);
  assert.equal(valore(ws, 6, col.LORDO), 2231.84);
  assert.equal(ws.getCell(6, col.LORDO).value.formula, 'SUM(AK6:AV6)');
});
