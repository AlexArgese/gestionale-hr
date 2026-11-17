/**
 * backend/services/libroPaga/excel.js
 * Genera il libro paga del mese come base precompilata, sul modello Excel
 * «TEMPLATE LIBRO PAGA CON OPZIONI»: una scheda di 6 righe per dipendente
 * (3 di intestazione + 3 di dati), un foglio per blocco.
 *
 * ClockEasy compila calendario, domeniche, festività e giorni lavorati; le
 * formule restano attive, così ferie, malattie, extra e trasferte inserite a
 * mano aggiornano da sole i totali. Ogni formula porta anche il risultato già
 * calcolato, per le anteprime che non ricalcolano.
 */
const ExcelJS = require('exceljs');
const { NOMI_MESI, giorniDelMese } = require('./calendario');
const { AREE, AREA_DA_ASSEGNARE, COEFF, FESTIVITA_LOCALI } = require('./config');
const { fmtDurata } = require('./dati');

/* -------------------------------------------------------------------------- */
/*                                   LAYOUT                                   */
/* -------------------------------------------------------------------------- */

const COL_BLOCCO = 1; // A: N° dip. / nome del blocco
const COL_CONTRATTO = 2; // B: tipo contratto / riposo
const COL_PRIMO_GIORNO = 3; // C: giorno 1

// Colonne dopo il calendario, nell'ordine del modello.
const RIEPILOGO = [
  { key: 'GG', label: null, width: 4.5 },
  { key: 'ORE', label: null, width: 7.8 },
  { key: 'FEST', label: null, width: 4 },
  { key: 'PAGA', label: 'RETR. H/G', width: 8 },
  { key: 'RETR_ORD', label: 'RETR. ORD', width: 8.5, grigio: true },
  { key: 'SUPER', label: 'SUPER/MIN', width: 6 },
  { key: 'ROL', label: 'ROL (0,05041)', width: 6.5 },
  { key: 'IM_DITTA', label: 'I.M. DITTA', width: 5.5 },
  { key: 'IM_INPS', label: 'I.M. INPS', width: 5.5 },
  { key: 'FEST_FISSI', label: 'FEST. FISSI', width: 6.5 },
  { key: 'FERIE', label: 'FERIE (0,10093)', width: 6.5 },
  { key: 'R1314', label: '13°/14°  (0,6679/0,7046)', width: 8.8 },
  { key: 'FEST20', label: 'FEST. 20%', width: 6 },
  { key: 'DOM10', label: 'DOM. 10%', width: 7.9 },
  { key: 'EXTRA', label: 'EXTRA', width: 6 },
  { key: 'TRASF', label: 'TRASF.', width: 8 },
  { key: 'LORDO', label: 'LORDO', width: 8, grigio: true },
  { key: 'LORDO_NT', label: 'LORDO SENZA TRASF', width: 8 },
  { key: 'ARROT', label: 'ARROT.', width: 7, grigio: true },
  { key: 'C0919', label: 0.0919, width: 6.2, pct: true },
  { key: 'C00217', label: 0.00217, width: 6.2, pct: true },
  { key: 'ESON', label: 'ESON. 0.80%', width: 6.2 },
  { key: 'EBTU', label: 'EBTU 0,20%', width: 6.2 },
  { key: 'RIT', label: 'RIT. FISC.', width: 6.2 },
  { key: 'ARAC', label: 'A.R.     A.C.', width: 6.2 },
  { key: 'TFR', label: 'TFR', width: 6.2 },
  { key: 'C1012', label: 1012, width: 6.2 },
  { key: 'BONUS', label: 'BONUS', width: 6.2 },
  { key: 'SOMMA', label: 'SOMMA PAGATA', width: 7, grigio: true },
];

const RIGHE_SCHEDA = 6;
const RIGHE_TRA_SCHEDE = 1;

function lettera(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function creaLayout(nGiorni) {
  const base = COL_PRIMO_GIORNO + nGiorni;
  const col = {};
  RIEPILOGO.forEach((c, i) => {
    col[c.key] = base + i;
  });
  return {
    nGiorni,
    colGiorno: (giorno) => COL_PRIMO_GIORNO + giorno - 1,
    ultimoGiorno: base - 1,
    col,
    ultima: base + RIEPILOGO.length - 1,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    STILI                                   */
/* -------------------------------------------------------------------------- */

const COLORE = {
  grigio: 'FFD9D9D9',
  domenica: 'FFFFFF00',
  festivita: 'FFFF0000',
  controllo: 'FFFFC000',
  mensile: 'FFFBE5D6',
  giornaliera: 'FFFFF2CC',
  oraria: 'FFE2EFDA',
  rosso: 'FFFF0000',
  bianco: 'FFFFFFFF',
};

const SOTTILE = { style: 'thin' };
const BORDO = { top: SOTTILE, left: SOTTILE, bottom: SOTTILE, right: SOTTILE };

function font(size, extra = {}) {
  return { name: 'Calibri', size, ...extra };
}

function riempi(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

const FMT = {
  euro: '0.00',
  oraria: '0.00000',
  ore: '0.00',
  orario: 'h:mm',
  oreTotali: '[h]:mm',
  pct: '0.00%',
};

function arrotonda(x, decimali) {
  const k = 10 ** decimali;
  return Math.round((x + Number.EPSILON) * k) / k;
}

/* -------------------------------------------------------------------------- */
/*                                   SCHEDA                                   */
/* -------------------------------------------------------------------------- */

function scriviScheda(ws, r0, dip, ctx) {
  const { layout, giorni, meseLabel, note, nomeFoglio } = ctx;
  const { col } = layout;
  const L = (c) => lettera(c);
  const rif = (key, riga) => `${L(col[key])}${riga}`;
  const fisso = dip.categoria === 'fisso';

  const rTitolo = r0;
  const rCalendario = r0 + 1;
  const rNome = r0 + 2;
  const r1 = r0 + 3;
  const r2 = r0 + 4;
  const r3 = r0 + 5;

  ws.getRow(rTitolo).height = 34.8;
  ws.getRow(r1).height = 11.4;
  ws.getRow(r2).height = 11.4;
  ws.getRow(r3).height = 11.4;

  /* ---------------- base: bordi e fondi di tutta la scheda ---------------- */
  for (let r = r0; r <= r3; r++) {
    for (let c = COL_BLOCCO; c <= layout.ultima; c++) {
      const cell = ws.getCell(r, c);
      cell.border = BORDO;
      cell.font = font(8);
    }
    RIEPILOGO.forEach((def) => {
      if (def.grigio) ws.getCell(r, col[def.key]).fill = riempi(COLORE.grigio);
    });
  }

  /* ------------------------- riga 1: intestazioni ------------------------- */
  const cNDip = ws.getCell(rTitolo, COL_BLOCCO);
  cNDip.value = 'N° Dip.';
  cNDip.font = font(10);

  const cTip = ws.getCell(rTitolo, COL_CONTRATTO);
  cTip.value = 'TIP. CONTR.';
  cTip.font = font(10, { bold: true });
  cTip.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  ws.mergeCells(rTitolo, COL_PRIMO_GIORNO, rTitolo, layout.ultimoGiorno);
  const cMese = ws.getCell(rTitolo, COL_PRIMO_GIORNO);
  cMese.value = `Giorni lavorativi ed ore eff. nel mese di: ${meseLabel}`;
  cMese.font = font(12, { bold: true });
  cMese.alignment = { horizontal: 'left', vertical: 'middle' };

  RIEPILOGO.forEach((def) => {
    if (def.label == null) return;
    const cell = ws.getCell(rTitolo, col[def.key]);
    cell.value = def.label;
    cell.font = font(8, { bold: true });
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (def.pct) cell.numFmt = FMT.pct;
  });

  /* -------------------------- riga 2: calendario -------------------------- */
  const cCal = ws.getCell(rCalendario, COL_CONTRATTO);
  cCal.value = 'CALENDARIO';
  cCal.font = font(8, { italic: true });

  giorni.forEach((g) => {
    const cell = ws.getCell(rCalendario, layout.colGiorno(g.giorno));
    cell.value = g.giorno;
    cell.font = font(6);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (g.festivita) {
      cell.fill = riempi(COLORE.festivita);
      cell.font = font(6, { bold: true, color: { argb: COLORE.bianco } });
      cell.note = g.festivita;
    } else if (g.domenica) {
      cell.fill = riempi(COLORE.domenica);
    }
  });

  [['GG', 'GG', 10, false], ['ORE', 'ORE', 10, false], ['FEST', 'FEST.', 8, true]].forEach(
    ([key, testo, size, bold]) => {
      const cell = ws.getCell(rCalendario, col[key]);
      cell.value = testo;
      cell.font = font(size, { bold });
      cell.alignment = { horizontal: 'center' };
    }
  );

  /* ----------------------- riga 3: nome e contratto ----------------------- */
  const cContratto = ws.getCell(rNome, COL_CONTRATTO);
  cContratto.value = fisso ? null : 'CHIAM.';
  cContratto.font = font(10, { bold: true });
  cContratto.alignment = { horizontal: 'center' };

  ws.mergeCells(rNome, COL_PRIMO_GIORNO, rNome, layout.ultimoGiorno);
  const cNome = ws.getCell(rNome, COL_PRIMO_GIORNO);
  const nomeCompleto = `${dip.cognome} ${dip.nome}`.trim().toUpperCase();
  cNome.value = `Cognome e nome: ${nomeCompleto}             Scad. :  ____________________`;
  cNome.font = font(9, { bold: true });
  cNome.alignment = { horizontal: 'left' };
  if (dip.avvisi.length) cNome.note = dip.avvisi.join('\n');
  dip.avvisi.forEach((testo) => {
    note.push({ dipendente: nomeCompleto, foglio: nomeFoglio, giorno: '', testo });
  });

  /* ------------------------ righe 4-6: blocco, riposo --------------------- */
  ws.mergeCells(r1, COL_BLOCCO, r3, COL_BLOCCO);
  const cBlocco = ws.getCell(r1, COL_BLOCCO);
  cBlocco.value = `${fisso ? 'FISSO' : 'INTERMIT.'} ${dip.area.nome}`;
  cBlocco.font = font(9, { bold: true, italic: true });
  cBlocco.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  ws.mergeCells(r1, COL_CONTRATTO, r3, COL_CONTRATTO);
  const cRiposo = ws.getCell(r1, COL_CONTRATTO);
  cRiposo.value = fisso ? 'RIPOSO G:' : null;
  cRiposo.alignment = { horizontal: 'left', vertical: 'top' };

  /* --------------------------- righe 4-6: giorni -------------------------- */
  // Fissi: i giorni lavorati vanno sulla 2ª riga (la 1ª è per i riposi «R»).
  // Intermittenti: giorni sulla 1ª riga, festivi lavorati sulla 2ª.
  const rGiorni = fisso ? r2 : r1;
  const turnoOre = dip.minutiTurno / 60;
  const turnoFrazione = dip.minutiTurno / 1440; // come orario Excel
  const domeniche = giorni.filter((g) => g.domenica);

  let giorniLavorati = 0;
  let domenicheLavorate = 0;
  let festiviLavorati = 0;

  giorni.forEach((g) => {
    const c = layout.colGiorno(g.giorno);
    for (const r of [r1, r2, r3]) {
      const cell = ws.getCell(r, c);
      cell.fill = riempi(COLORE.grigio);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (g.festivita) cell.font = font(8, { color: { argb: COLORE.rosso } });
    }

    const presenza = dip.giorni.get(g.giorno);
    if (presenza) {
      giorniLavorati++;
      if (g.domenica) domenicheLavorate++;
      const cell = ws.getCell(rGiorni, c);
      cell.value = 1;

      let avviso = null;
      if (presenza.aperto) {
        avviso = 'Uscita non timbrata';
      } else if (presenza.corta) {
        avviso = `Giornata corta: timbrate ${fmtDurata(presenza.minuti)} su ${fmtDurata(dip.minutiTurno)}`;
      }
      if (avviso) {
        cell.fill = riempi(COLORE.controllo);
        cell.note = avviso;
        note.push({ dipendente: nomeCompleto, foglio: nomeFoglio, giorno: g.giorno, testo: avviso });
      }

      if (!fisso && g.festivita) {
        festiviLavorati++;
        ws.getCell(r2, c).value = 1;
      }
    }

    // Ore del turno sotto ogni domenica, come nel modello.
    if (g.domenica) {
      const cell = ws.getCell(r3, c);
      if (fisso) {
        cell.value = turnoFrazione;
        cell.numFmt = FMT.orario;
      } else {
        cell.value = turnoOre;
      }
    }
  });

  const primoG = L(layout.colGiorno(1));
  const ultimoG = L(layout.ultimoGiorno);
  const cellaTurno = `${L(layout.colGiorno(domeniche[0].giorno))}${r3}`;
  const sommaDomeniche = `SUM(${domeniche
    .map((g) => `${L(layout.colGiorno(g.giorno))}${rGiorni}`)
    .join(',')})`;

  const formula = (riga, key, testo, risultato, numFmt, extra = {}) => {
    const cell = ws.getCell(riga, col[key]);
    cell.value = { formula: testo, result: risultato };
    if (numFmt) cell.numFmt = numFmt;
    cell.alignment = { horizontal: extra.centro ? 'center' : 'right', vertical: 'middle' };
    if (extra.rosso) cell.font = font(8, { color: { argb: COLORE.rosso } });
    return cell;
  };

  /* ---------------------- GG e ORE (comuni ai due tipi) ------------------- */
  ws.mergeCells(r1, col.GG, r2, col.GG);
  ws.mergeCells(r1, col.ORE, r2, col.ORE);
  const cGGlabel = ws.getCell(r1, col.FEST);
  cGGlabel.value = 'GG';
  cGGlabel.alignment = { horizontal: 'center', vertical: 'middle' };

  formula(r1, 'GG', `SUM(${primoG}${rGiorni}:${ultimoG}${rGiorni})`, giorniLavorati, null, { centro: true });
  formula(r3, 'GG', sommaDomeniche, domenicheLavorate, null, { centro: true });

  if (fisso) {
    /* ------------------------------- FISSO -------------------------------- */
    const mensile = dip.mensile == null ? 0 : dip.mensile;
    const giornaliera = arrotonda(mensile / COEFF.divisoreGiornaliero, 2);
    const oraria = arrotonda(mensile / COEFF.divisoreOrario, 5);
    const oreDomenicali = turnoFrazione * domenicheLavorate * 24;
    const festivi = 0; // in attesa della risposta della consulente (domanda 9)
    const festFissi = festivi * giornaliera * COEFF.festivoFissi;
    const rateo = dip.rateoMensile1314 ? mensile / 12 : 0;
    const dom10 = oreDomenicali * oraria * COEFF.domenica;

    formula(r1, 'ORE', `${cellaTurno}*${rif('GG', r1)}`, turnoFrazione * giorniLavorati, FMT.oreTotali, { centro: true });
    formula(r3, 'ORE', `${cellaTurno}*${rif('GG', r3)}`, turnoFrazione * domenicheLavorate, FMT.oreTotali, { centro: true });

    const cFest = ws.getCell(r2, col.FEST);
    cFest.value = festivi;
    cFest.font = font(8, { color: { argb: COLORE.rosso } });
    cFest.alignment = { horizontal: 'center', vertical: 'middle' };

    // Paga: mensile (da inserire o correggere), giornaliera e oraria derivate.
    const cMensile = ws.getCell(r1, col.PAGA);
    cMensile.value = dip.mensile;
    cMensile.numFmt = FMT.euro;
    cMensile.fill = riempi(COLORE.mensile);
    cMensile.alignment = { horizontal: 'center', vertical: 'middle' };
    formula(r2, 'PAGA', `ROUND(${rif('PAGA', r1)}/${COEFF.divisoreGiornaliero},2)`, giornaliera, FMT.euro, { centro: true })
      .fill = riempi(COLORE.giornaliera);
    formula(r3, 'PAGA', `ROUND(${rif('PAGA', r1)}/${COEFF.divisoreOrario},5)`, oraria, FMT.oraria, { centro: true })
      .fill = riempi(COLORE.oraria);

    formula(r3, 'RETR_ORD', `${rif('PAGA', r1)}`, mensile, FMT.euro);

    formula(r2, 'FEST_FISSI', `${rif('FEST', r2)}`, festivi, null, { rosso: true });
    formula(r3, 'FEST_FISSI', `${rif('FEST_FISSI', r2)}*${rif('PAGA', r2)}*${COEFF.festivoFissi}`, festFissi, FMT.euro);

    if (dip.rateoMensile1314) {
      formula(r2, 'R1314', `${rif('PAGA', r1)}/12`, rateo, FMT.euro);
      formula(r3, 'R1314', `${rif('PAGA', r1)}/12`, rateo, FMT.euro);
    }

    // Ore domenicali in decimale, ricavate dalle domeniche lavorate.
    formula(r2, 'DOM10', `${rif('ORE', r3)}*24`, oreDomenicali, FMT.ore);
    formula(r3, 'DOM10', `${rif('DOM10', r2)}*${rif('PAGA', r3)}*${COEFF.domenica}`, dom10, FMT.euro);

    const extraRateo = dip.rateoMensile1314 ? `,${rif('R1314', r2)}` : '';
    const lordo = mensile + festFissi + dom10 + rateo * 2;
    formula(r3, 'LORDO', `SUM(${rif('RETR_ORD', r3)}:${rif('TRASF', r3)}${extraRateo})`, lordo, FMT.euro);
    formula(r3, 'LORDO_NT', `SUM(${rif('RETR_ORD', r3)}:${rif('EXTRA', r3)}${extraRateo})`, lordo, FMT.euro);
    formula(r3, 'ARROT', `ROUND(${rif('LORDO_NT', r3)},0)`, arrotonda(lordo, 0), FMT.euro);
  } else {
    /* ---------------------------- INTERMITTENTE --------------------------- */
    const oraria = dip.oraria == null ? 0 : dip.oraria;
    const ore = giorniLavorati * turnoOre;
    const oreDomenicali = domenicheLavorate * turnoOre;
    const oreRol = ore * COEFF.rol;
    const oreFerie = ore * COEFF.ferie;
    const coeff1314 = arrotonda(oraria / 12, 4);
    const rateo = coeff1314 * ore;
    const oreFestive = festiviLavorati * turnoOre;

    const retrOrd = ore * oraria;
    const rol = oreRol * oraria;
    const ferie = oreFerie * oraria;
    const fest20 = oreFestive * oraria * COEFF.festivoIntermittenti;
    const dom10 = oreDomenicali * oraria * COEFF.domenica;

    formula(r1, 'ORE', `${rif('GG', r1)}*${cellaTurno}`, ore, FMT.ore, { centro: true });
    formula(r3, 'ORE', `${rif('GG', r3)}*${cellaTurno}`, oreDomenicali, FMT.ore, { centro: true });

    // Festivi lavorati: gli «1» della seconda riga.
    formula(r2, 'FEST', `SUM(${primoG}${r2}:${ultimoG}${r2})`, festiviLavorati, null, { centro: true, rosso: true });

    const cPaga = ws.getCell(r1, col.PAGA);
    cPaga.value = dip.oraria;
    cPaga.numFmt = FMT.oraria;
    cPaga.fill = riempi(COLORE.oraria);
    cPaga.alignment = { horizontal: 'center', vertical: 'middle' };
    const paga = rif('PAGA', r1);

    formula(r2, 'RETR_ORD', `${rif('ORE', r1)}*${paga}`, retrOrd, FMT.euro);

    formula(r1, 'ROL', `${rif('ORE', r1)}*${COEFF.rol}`, oreRol, FMT.ore);
    formula(r2, 'ROL', `${rif('ROL', r1)}*${paga}`, rol, FMT.euro);

    formula(r1, 'FERIE', `${rif('ORE', r1)}*${COEFF.ferie}`, oreFerie, FMT.ore);
    formula(r2, 'FERIE', `${rif('FERIE', r1)}*${paga}`, ferie, FMT.euro);

    // 13ª e 14ª: coefficiente = paga oraria / 12 (0,6679 per 8,01483 €).
    formula(r1, 'R1314', `ROUND(${paga}/12,4)*${rif('ORE', r1)}`, rateo, FMT.euro);
    formula(r2, 'R1314', `ROUND(${paga}/12,4)*${rif('ORE', r1)}`, rateo, FMT.euro);

    formula(r1, 'FEST20', `${rif('FEST', r2)}*${cellaTurno}`, oreFestive, FMT.ore);
    formula(r2, 'FEST20', `${rif('FEST20', r1)}*${paga}*${COEFF.festivoIntermittenti}`, fest20, FMT.euro);

    formula(r1, 'DOM10', `${rif('ORE', r3)}`, oreDomenicali, FMT.ore);
    formula(r2, 'DOM10', `${rif('DOM10', r1)}*${paga}*${COEFF.domenica}`, dom10, FMT.euro);

    const lordo = retrOrd + rol + ferie + rateo * 2 + fest20 + dom10;
    formula(r2, 'LORDO', `SUM(${rif('RETR_ORD', r2)}:${rif('TRASF', r2)},${rif('R1314', r1)})`, lordo, FMT.euro);
    formula(r2, 'LORDO_NT', `SUM(${rif('RETR_ORD', r2)}:${rif('EXTRA', r2)},${rif('R1314', r1)})`, lordo, FMT.euro);
    formula(r2, 'ARROT', `ROUND(${rif('LORDO_NT', r2)},0)`, arrotonda(lordo, 0), FMT.euro);
  }
}

/* -------------------------------------------------------------------------- */
/*                                    FOGLI                                   */
/* -------------------------------------------------------------------------- */

function titolo(str) {
  return str
    .toLowerCase()
    .replace(/(^|[\s&])([a-zà-ù])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

function nomeFoglioBlocco(area, categoria) {
  const prefisso = categoria === 'fisso' ? 'Fisso' : 'Intermit.';
  return `${prefisso} ${titolo(area.nome)}`.slice(0, 31);
}

function creaFoglioBlocco(wb, nome, dipendenti, ctx) {
  const { layout, giorni } = ctx;
  const fisso = dipendenti[0].categoria === 'fisso';
  const ws = wb.addWorksheet(nome, {
    pageSetup: {
      paperSize: 8, // A3
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  ws.getColumn(COL_BLOCCO).width = 20.3;
  ws.getColumn(COL_CONTRATTO).width = 9.5;
  giorni.forEach((g) => {
    // Nei fogli dei fissi le domeniche ospitano l'orario del turno (es. 6:40).
    ws.getColumn(layout.colGiorno(g.giorno)).width = g.domenica && fisso ? 4.8 : 2.8;
  });
  RIEPILOGO.forEach((def) => {
    ws.getColumn(layout.col[def.key]).width = def.width;
  });

  let riga = 1;
  for (const dip of dipendenti) {
    scriviScheda(ws, riga, dip, { ...ctx, nomeFoglio: nome });
    riga += RIGHE_SCHEDA + RIGHE_TRA_SCHEDE;
  }
  return ws;
}

function creaFoglioNote(wb, { meseLabel, giorni, note, generatoIl, totaleDipendenti }) {
  const ws = wb.addWorksheet('Note e controlli');
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 9;
  ws.getColumn(4).width = 80;

  const grassetto = (cell, size = 11) => {
    cell.font = font(size, { bold: true });
  };

  const data = generatoIl.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
  grassetto(ws.addRow([`Libro paga ${meseLabel} — base precompilata da ClockEasy`]).getCell(1), 14);
  ws.addRow([`Generato il ${data}. Dipendenti: ${totaleDipendenti}.`]);
  ws.addRow([]);

  grassetto(ws.addRow(['Cosa è già compilato']).getCell(1));
  [
    'Calendario del mese, domeniche (giallo) e festività nazionali (rosso).',
    'Un «1» in ogni giorno con una timbratura. Fissi: seconda riga. Intermittenti: prima riga, con i festivi lavorati sulla seconda.',
    'Paghe del modello per ogni blocco, correggibili: giornaliera e oraria dei fissi si ricalcolano dallo stipendio mensile.',
    'Tutte le formule sono attive: ogni valore inserito a mano aggiorna totali e lordo.',
  ].forEach((t) => ws.addRow([t]));
  ws.addRow([]);

  grassetto(ws.addRow(['Da completare a mano']).getCell(1));
  [
    'Ferie, permessi, malattia (I.M. DITTA, I.M. INPS) e riposi «R»: i giorni senza timbratura sono vuoti.',
    'Fissi: numero di festivi (colonna FEST., in rosso), lasciato a 0.',
    'SUPER/MIN, EXTRA, TRASF., N° Dip., scadenza del contratto, contributi e netto.',
    'Fissi Zoosafari & Hotel: 13ª a dicembre e 14ª a luglio.',
  ].forEach((t) => ws.addRow([t]));
  ws.addRow([]);

  grassetto(ws.addRow(['Festività del mese']).getCell(1));
  const feste = giorni.filter((g) => g.festivita);
  if (feste.length === 0) ws.addRow(['Nessuna festività nazionale in questo mese.']);
  feste.forEach((g) => {
    ws.addRow([`${g.giorno} — ${g.festivita}${g.domenica ? ' (cade di domenica)' : ''}`]);
  });
  ws.addRow([]);

  grassetto(ws.addRow(['Celle arancioni e avvisi da controllare']).getCell(1));
  const intestazione = ws.addRow(['Dipendente', 'Foglio', 'Giorno', 'Nota']);
  intestazione.eachCell((cell) => {
    cell.font = font(11, { bold: true });
    cell.fill = riempi(COLORE.grigio);
    cell.border = BORDO;
  });
  if (note.length === 0) ws.addRow(['Nessun avviso.']);
  note.forEach((n) => {
    const row = ws.addRow([n.dipendente, n.foglio, n.giorno, n.testo]);
    row.getCell(3).alignment = { horizontal: 'center' };
  });
  return ws;
}

/* -------------------------------------------------------------------------- */
/*                                  WORKBOOK                                  */
/* -------------------------------------------------------------------------- */

/**
 * dipendenti: l'elenco prodotto da dati.preparaDipendenti (già ordinato).
 * Ritorna un ExcelJS.Workbook pronto da scrivere.
 */
function generaLibroPaga({ anno, mese, dipendenti, generatoIl = new Date() }) {
  if (!Number.isInteger(anno) || !Number.isInteger(mese) || mese < 1 || mese > 12) {
    throw new Error(`Mese non valido: ${anno}-${mese}`);
  }
  const giorni = giorniDelMese(anno, mese, FESTIVITA_LOCALI);
  const layout = creaLayout(giorni.length);
  const meseLabel = `${NOMI_MESI[mese - 1]} ${anno}`;
  const note = [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ClockEasy';
  wb.created = generatoIl;
  // Excel ricalcola tutte le formule all'apertura.
  wb.calcProperties.fullCalcOnLoad = true;

  const ctx = { layout, giorni, meseLabel, note };
  for (const area of [...AREE, AREA_DA_ASSEGNARE]) {
    for (const categoria of ['fisso', 'intermittente']) {
      const gruppo = dipendenti.filter(
        (d) => d.area.id === area.id && d.categoria === categoria
      );
      if (gruppo.length === 0) continue;
      creaFoglioBlocco(wb, nomeFoglioBlocco(area, categoria), gruppo, ctx);
    }
  }

  creaFoglioNote(wb, {
    meseLabel,
    giorni,
    note,
    generatoIl,
    totaleDipendenti: dipendenti.length,
  });
  return wb;
}

module.exports = {
  generaLibroPaga,
  creaLayout,
  lettera,
  RIEPILOGO,
};
