/**
 * backend/services/presenze/teamLeader.js
 * Middleware e handler delle rotte Team Leader (/tl/*) di
 * /backend/routes/presenze.js.
 */
const pool = require('../../db');
const ExcelJS = require('exceljs');
const {
  localDateStr,
  getMinutiContratto,
  styleHeaderRow,
  toSuperscript,
  labelDurata,
} = require('./helpers');

function requireTL(req, res, next) {
  if (!req.user?.team_leader_sedi?.trim()) {
    return res.status(403).json({ error: 'Accesso riservato ai Team Leader' });
  }
  next();
}

function tlSedeConditions(sedi, values) {
  return sedi.map((sede) => {
    values.push(sede);
    return `EXISTS (
      SELECT 1 FROM unnest(string_to_array(COALESCE(u.sede, ''), ',')) AS s
      WHERE trim(s) = $${values.length}
    )`;
  });
}

// Restituisce le sedi effettive del TL, eventualmente filtrate a una sola se ?sede= è fornita e autorizzata
function resolveTLSedi(req, res) {
  const tlSedi = req.user.team_leader_sedi.split(',').map(s => s.trim()).filter(Boolean);
  const requestedSede = req.query.sede?.trim();
  if (!requestedSede) return tlSedi;
  if (!tlSedi.includes(requestedSede)) {
    res.status(403).json({ error: 'Sede non autorizzata' });
    return null;
  }
  return [requestedSede];
}

async function tlOggiHandler(req, res) {
  try {
    const effectiveSedi = resolveTLSedi(req, res);
    if (!effectiveSedi) return;
    const oggi = localDateStr(new Date());
    const values = [oggi];
    const conds = tlSedeConditions(effectiveSedi, values);

    const result = await pool.query(
      `SELECT u.nome, u.cognome, u.sede, p.ora_entrata, p.ora_uscita
         FROM presenze p
         JOIN utenti u ON u.id = p.utente_id
        WHERE p.data = $1
          AND (${conds.join(' OR ')})
        ORDER BY u.cognome, u.nome, p.ora_entrata`,
      values
    );
    res.json({ date: oggi, presenze: result.rows });
  } catch (err) {
    console.error('TL /tl/oggi', err);
    res.status(500).json({ error: 'Errore lettura presenze' });
  }
}

async function tlExportOggiHandler(req, res) {
  try {
    const effectiveSedi = resolveTLSedi(req, res);
    if (!effectiveSedi) return;
    const oggi = localDateStr(new Date());
    const values = [oggi];
    const conds = tlSedeConditions(effectiveSedi, values);

    const result = await pool.query(
      `SELECT u.nome, u.cognome
         FROM presenze p
         JOIN utenti u ON u.id = p.utente_id
        WHERE p.data = $1
          AND (${conds.join(' OR ')})
        GROUP BY u.id, u.nome, u.cognome
        ORDER BY u.cognome, u.nome`,
      values
    );

    const oggiLabel = `${oggi.slice(8, 10)}-${oggi.slice(5, 7)}-${oggi.slice(0, 4)}`;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Presenze ${oggiLabel}`);
    styleHeaderRow(sheet.addRow([`Dipendenti presenti oggi ${oggiLabel}`]));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    result.rows.forEach(r => sheet.addRow([`${r.cognome} ${r.nome}`]));
    sheet.getColumn(1).width = 32;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=presenze_oggi_${oggi}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('TL export-oggi', err);
    res.status(500).json({ error: 'Errore esportazione' });
  }
}

async function tlExportHandler(req, res) {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start e end sono obbligatori' });

  try {
    const effectiveSedi = resolveTLSedi(req, res);
    if (!effectiveSedi) return;
    const values = [];
    const conds = tlSedeConditions(effectiveSedi, values);

    const utentiRes = await pool.query(
      `SELECT u.id, u.nome, u.cognome, u.tipo_contratto
         FROM utenti u
        WHERE (${conds.join(' OR ')})
        ORDER BY u.cognome, u.nome`,
      values
    );

    if (utentiRes.rows.length === 0) {
      return res.status(404).json({ error: 'Nessun utente trovato nelle sedi assegnate' });
    }

    const utentiMap = new Map();
    utentiRes.rows.forEach(u => utentiMap.set(u.id, u));

    const endDateObj = new Date(end);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const adjustedEnd = localDateStr(endDateObj);

    const presenze = await pool.query(
      `SELECT utente_id, to_char(data, 'YYYY-MM-DD') AS data_str, note, ora_entrata, ora_uscita
         FROM presenze
        WHERE data >= $1 AND data < $2`,
      [start, adjustedEnd]
    );

    const noteLegend = {};
    const noteApici = {};
    let noteCounter = 1;

    const minutiAccumulati = new Map();
    presenze.rows.forEach((p) => {
      if (!utentiMap.has(p.utente_id)) return;
      const key = `${p.utente_id}-${p.data_str}`;
      const minuti = p.ora_entrata && p.ora_uscita
        ? (new Date(p.ora_uscita) - new Date(p.ora_entrata)) / 60000
        : 0;
      const current = minutiAccumulati.get(key) || { utenteId: p.utente_id, minutiTotali: 0, nota: null };
      current.minutiTotali += minuti;
      if (p.note && p.note.trim()) current.nota = p.note.trim();
      minutiAccumulati.set(key, current);
    });

    const presenzeMap = new Map();
    minutiAccumulati.forEach(({ utenteId, minutiTotali, nota }, key) => {
      const utente = utentiMap.get(utenteId);
      if (!utente) return;
      const minutiPrevisti = getMinutiContratto(utente.tipo_contratto);
      if (minutiTotali < minutiPrevisti) {
        if (minutiTotali > 0) presenzeMap.set(key, labelDurata(minutiTotali));
        return;
      }
      if (nota) {
        if (!noteApici[nota]) {
          const sup = toSuperscript(noteCounter);
          noteApici[nota] = sup;
          noteLegend[sup] = nota;
          noteCounter++;
        }
        presenzeMap.set(key, `P${noteApici[nota]}`);
      } else {
        presenzeMap.set(key, 'P');
      }
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Presenze');

    const giorni = [];
    let cursor = new Date(start);
    const fine = new Date(end);
    while (cursor <= fine) {
      giorni.push({ label: `${cursor.getDate()}/${cursor.getMonth() + 1}`, dateStr: localDateStr(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }

    styleHeaderRow(sheet.addRow(['Dipendente', ...giorni.map(d => d.label), 'Totale']));
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    sheet.getColumn(1).width = 28;
    for (let i = 2; i <= giorni.length + 1; i++) sheet.getColumn(i).width = 7;
    sheet.getColumn(giorni.length + 2).width = 8;

    const presenzePerGiorno = new Array(giorni.length).fill(0);
    utentiRes.rows.forEach((utente) => {
      const riga = [`${utente.nome} ${utente.cognome}`];
      let count = 0;
      giorni.forEach((g, idx) => {
        const valore = presenzeMap.get(`${utente.id}-${g.dateStr}`);
        if (valore) { count++; presenzePerGiorno[idx]++; }
        riga.push(valore || '');
      });
      riga.push(count);
      sheet.addRow(riga);
    });

    const totalExcelRow = sheet.addRow(['Totale', ...presenzePerGiorno, '']);
    totalExcelRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    });

    if (Object.keys(noteLegend).length > 0) {
      sheet.addRow([]);
      sheet.addRow(['Legenda note']);
      for (const [sup, nota] of Object.entries(noteLegend)) sheet.addRow([`${sup}: ${nota}`]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=presenze.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('TL export range', err);
    res.status(500).json({ error: 'Errore esportazione' });
  }
}

module.exports = {
  requireTL,
  tlOggiHandler,
  tlExportOggiHandler,
  tlExportHandler,
};
