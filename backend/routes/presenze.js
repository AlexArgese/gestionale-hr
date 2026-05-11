// routes/presenze.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const crypto = require('crypto');
const requireAuth = require('../middleware/requireAuth');

const validTokens = {};

// ✅ Pulizia automatica ogni 30 secondi
setInterval(() => {
  const now = Date.now();
  for (const token in validTokens) {
    if (validTokens[token].expiresAt < now) {
      delete validTokens[token];
    }
  }
}, 30 * 1000);

// ✅ Auto-chiude turni rimasti aperti dopo 24h con cappatura corretta
setInterval(async () => {
  try {
    const openShifts = await pool.query(
      `SELECT p.id, p.utente_id, p.ora_entrata, u.tipo_contratto
         FROM presenze p
         JOIN utenti u ON u.id = p.utente_id
        WHERE p.ora_uscita IS NULL
          AND p.ora_entrata < NOW() - INTERVAL '24 hours'`
    );
    for (const row of openShifts.rows) {
      const minutiPrevisti = getMinutiContratto(row.tipo_contratto);
      if (minutiPrevisti === 0) continue;
      const oraUscita = await calcolaOraUscitaCappata(row.utente_id, row, minutiPrevisti);
      if (!oraUscita) continue;
      await pool.query(
        `UPDATE presenze SET ora_uscita = $1 WHERE id = $2`,
        [oraUscita, row.id]
      );
    }
    if (openShifts.rows.length > 0) {
      console.log(`[auto-close] Chiusi ${openShifts.rows.length} turni aperti da >24h`);
    }
  } catch (e) {
    console.error('[auto-close] Errore chiusura turni', e);
  }
}, 60 * 60 * 1000); // ogni ora

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Calcola l'ora di uscita cappata tenendo conto dei minuti già lavorati
// negli altri turni chiusi della stessa giornata
async function calcolaOraUscitaCappata(utente_id, turno, minutiPrevisti) {
  const dataStr = localDateStr(new Date(turno.ora_entrata));

  const altriTurni = await pool.query(
    `SELECT ora_entrata, ora_uscita FROM presenze
     WHERE utente_id = $1 AND data = $2 AND ora_uscita IS NOT NULL AND id != $3`,
    [utente_id, dataStr, turno.id]
  );

  const minutiGiaLavorati = altriTurni.rows.reduce((acc, r) => {
    return acc + (new Date(r.ora_uscita) - new Date(r.ora_entrata)) / 60000;
  }, 0);

  const minutiRimasti = minutiPrevisti - minutiGiaLavorati;
  if (minutiRimasti <= 0) return new Date(turno.ora_entrata); // contratto già esaurito

  return addMinutes(new Date(turno.ora_entrata), minutiRimasti);
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

/* -------------------------------------------------------------------------- */
/*                           EXPORT PRESENZE OGGI                             */
/* -------------------------------------------------------------------------- */

router.get('/export-oggi', async (req, res) => {
  try {
    const oggi = localDateStr(new Date());
    const soloPresenti =
      req.query.solo_presenti === '1' ||
      req.query.solo_presenti === 'true' ||
      req.query.solo_presenti === 'on';

    const values = [oggi]; // $1 = oggi

    const filters = [];

    const sedi = req.query.sede
      ? Array.isArray(req.query.sede) ? req.query.sede : [req.query.sede]
      : [];

    if (sedi.length > 0) {
      const sedeConditions = sedi.map((nomeSede) => {
        values.push(nomeSede.trim());
        return `EXISTS (
          SELECT 1 FROM unnest(string_to_array(COALESCE(u.sede, ''), ',')) AS sede_item
          WHERE trim(sede_item) = $${values.length}
        )`;
      });
      filters.push(`(${sedeConditions.join(' OR ')})`);
    }

    const societaParam = req.query.societa
      ? Array.isArray(req.query.societa) ? req.query.societa : [req.query.societa]
      : [];

    if (societaParam.length > 0) {
      const societaConditions = societaParam.map((nome) => {
        values.push(nome.trim());
        return `s.ragione_sociale = $${values.length}`;
      });
      filters.push(`(${societaConditions.join(' OR ')})`);
    }

    // solo presenti = solo chi è attualmente dentro (turno aperto)
    if (soloPresenti) filters.push(`p.ora_uscita IS NULL`);

    const filterSql = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT u.nome, u.cognome
         FROM presenze p
         JOIN utenti u ON u.id = p.utente_id
         LEFT JOIN societa s ON s.id = u.societa_id
        WHERE p.data = $1
        ${filterSql}
        GROUP BY u.id, u.nome, u.cognome
        ORDER BY u.cognome, u.nome`,
      values
    );

    const oggiLabel = `${oggi.slice(8, 10)}-${oggi.slice(5, 7)}-${oggi.slice(0, 4)}`;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Presenze ${oggiLabel}`);
    styleHeaderRow(sheet.addRow([`Dipendenti presenti oggi ${oggiLabel}`]));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    result.rows.forEach((r) => {
      sheet.addRow([`${r.cognome} ${r.nome}`]);
    });
    sheet.getColumn(1).width = 32;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=presenze_oggi_${oggi}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Errore export presenze oggi', err);
    res.status(500).json({ error: 'Errore esportazione' });
  }
});

/* -------------------------------------------------------------------------- */
/*                                   EXPORT                                   */
/* -------------------------------------------------------------------------- */

router.get('/export', async (req, res) => {
  const { start, end } = req.query;
  const soloPresenti =
    req.query.solo_presenti === true ||
    req.query.solo_presenti === 'true' ||
    req.query.solo_presenti === '1' ||
    req.query.solo_presenti === 'on';
  const dettagli =
    req.query.dettagli === 'true' ||
    req.query.dettagli === '1';

  try {
    if (!start || !end) {
      return res.status(400).json({ error: 'Start e end date sono obbligatori' });
    }

    const filters = [];
    const values = [];

    // gestisce sede singola o multipla:
    // ?sede=Milano&sede=Roma
    const sedi = req.query.sede
      ? Array.isArray(req.query.sede)
        ? req.query.sede
        : [req.query.sede]
      : [];

    // filtro sedi cumulative nel campo testo utenti.sede
    if (sedi.length > 0) {
      const sedeConditions = sedi.map((nomeSede) => {
        values.push(nomeSede.trim());

        return `
          EXISTS (
            SELECT 1
            FROM unnest(string_to_array(COALESCE(u.sede, ''), ',')) AS sede_item
            WHERE trim(sede_item) = $${values.length}
          )
        `;
      });

      filters.push(`(${sedeConditions.join(' OR ')})`);
    }

    const utente_id = req.query.utente_id ? Number(req.query.utente_id) : null;
    if (utente_id) {
      filters.push(`u.id = $${values.length + 1}`);
      values.push(utente_id);
    }

    const societaParam = req.query.societa
      ? Array.isArray(req.query.societa)
        ? req.query.societa
        : [req.query.societa]
      : [];

    if (societaParam.length > 0) {
      const societaConditions = societaParam.map((nome) => {
        values.push(nome.trim());
        return `s.ragione_sociale = $${values.length}`;
      });
      filters.push(`(${societaConditions.join(' OR ')})`);
    }

    const filterSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const utentiQuery = `
      SELECT u.id, u.nome, u.cognome, u.tipo_contratto
      FROM utenti u
      LEFT JOIN societa s ON s.id = u.societa_id
      ${filterSql}
      ORDER BY u.cognome, u.nome
    `;

    const utenti = await pool.query(utentiQuery, values);
    const utentiMap = new Map();
    utenti.rows.forEach((u) => {
      utentiMap.set(u.id, u);
    });

    if (utenti.rows.length === 0) {
      return res.status(404).json({ error: 'Nessun utente trovato' });
    }

    // fine +1 giorno in formato locale
    const endDateObj = new Date(end);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const adjustedEnd = localDateStr(endDateObj);

    const presenze = await pool.query(
      `
      SELECT utente_id, to_char(data, 'YYYY-MM-DD') AS data_str, note,
            ora_entrata, ora_uscita
      FROM presenze
      WHERE data >= $1 AND data < $2
      `,
      [start, adjustedEnd]
    );

    const noteLegend = {};
    const noteApici = {};
    let noteCounter = 1;

    // Prima passata: somma i minuti di tutti i turni per (utente, giorno)
    // Supporta più turni nella stessa giornata
    const minutiAccumulati = new Map(); // key → { utenteId, minutiTotali, nota }
    presenze.rows.forEach((p) => {
      const key = `${p.utente_id}-${p.data_str}`;
      const minuti =
        p.ora_entrata && p.ora_uscita
          ? (new Date(p.ora_uscita) - new Date(p.ora_entrata)) / 60000
          : 0;
      const current = minutiAccumulati.get(key) || { utenteId: p.utente_id, minutiTotali: 0, nota: null };
      current.minutiTotali += minuti;
      if (p.note && p.note.trim()) current.nota = p.note.trim();
      minutiAccumulati.set(key, current);
    });

    // Seconda passata: determina la label in base al totale minuti della giornata
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
      const giorno = cursor.getDate();
      const mese = cursor.getMonth() + 1;
      const dataStr = localDateStr(cursor);
      giorni.push({ label: `${giorno}/${mese}`, dateStr: dataStr });
      cursor.setDate(cursor.getDate() + 1);
    }

    const intestazioni = ['Dipendente', ...giorni.map((d) => d.label), 'Totale'];
    styleHeaderRow(sheet.addRow(intestazioni));
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    sheet.getColumn(1).width = 28;
    for (let i = 2; i <= giorni.length + 1; i++) sheet.getColumn(i).width = 7;
    sheet.getColumn(giorni.length + 2).width = 8;

    const righe = [];
    const presenzePerGiorno = new Array(giorni.length).fill(0);

    utenti.rows.forEach((utente) => {
      const riga = [`${utente.nome} ${utente.cognome}`];
      let count = 0;
      let haPresenzaDaMostrare = false;

      giorni.forEach((g, idx) => {
        const chiave = `${utente.id}-${g.dateStr}`;
        const valore = presenzeMap.get(chiave);

        // per il filtro "solo presenti" basta che ci sia qualcosa
        if (valore) {
          haPresenzaDaMostrare = true;
        }

        // il totale invece continua a contare solo le vere P
        if (valore) {
        count++;
        presenzePerGiorno[idx]++;
        }

        riga.push(valore || '');
      });

      riga.push(count);

      if (!soloPresenti || haPresenzaDaMostrare) {
        righe.push(riga);
      }
    });

    righe.forEach((r) => sheet.addRow(r));

    const totalRow = ['Totale'];
    presenzePerGiorno.forEach((c) => totalRow.push(c));
    totalRow.push('');
    const totalExcelRow = sheet.addRow(totalRow);
    totalExcelRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    });

    if (Object.keys(noteLegend).length > 0) {
      sheet.addRow([]);
      sheet.addRow(['Legenda note']);
      for (const [sup, nota] of Object.entries(noteLegend)) {
        sheet.addRow([`${sup}: ${nota}`]);
      }
    }

    if (dettagli) {
      // Raggruppa i turni per giorno e per utente
      const byDayUtente = {};
      presenze.rows.forEach((p) => {
        if (!utentiMap.has(p.utente_id)) return; // ignora utenti fuori dai filtri
        if (!byDayUtente[p.data_str]) byDayUtente[p.data_str] = {};
        if (!byDayUtente[p.data_str][p.utente_id]) byDayUtente[p.data_str][p.utente_id] = [];
        byDayUtente[p.data_str][p.utente_id].push(p);
      });

      const fmtT = (d) => new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Rome' });

      for (const g of giorni) {
        const dayData = byDayUtente[g.dateStr] || {};
        const presentUtenti = utenti.rows.filter((u) => dayData[u.id]?.length > 0);
        if (presentUtenti.length === 0) continue;

        const maxTurni = Math.max(...presentUtenti.map((u) => dayData[u.id].length));
        const dataLabel = `${g.dateStr.slice(8, 10)}-${g.dateStr.slice(5, 7)}-${g.dateStr.slice(0, 4)}`;
        const daySheet = workbook.addWorksheet(dataLabel);

        const header = ['Dipendente', 'N° Turni'];
        for (let i = 1; i <= maxTurni; i++) header.push(`Entrata ${i}`, `Uscita ${i}`);
        header.push('Durata Totale', 'Simbolo', 'Note');
        styleHeaderRow(daySheet.addRow(header));
        daySheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
        daySheet.getColumn(1).width = 28;
        daySheet.getColumn(2).width = 10;
        for (let i = 3; i <= 2 + maxTurni * 2; i++) daySheet.getColumn(i).width = 12;
        daySheet.getColumn(3 + maxTurni * 2).width = 18;
        daySheet.getColumn(4 + maxTurni * 2).width = 10;
        daySheet.getColumn(5 + maxTurni * 2).width = 30;

        presentUtenti.forEach((utente) => {
          const shifts = [...dayData[utente.id]].sort(
            (a, b) => new Date(a.ora_entrata) - new Date(b.ora_entrata)
          );
          const row = [`${utente.cognome} ${utente.nome}`, shifts.length];

          for (let i = 0; i < maxTurni; i++) {
            const s = shifts[i];
            if (!s) { row.push('', ''); continue; }
            row.push(fmtT(s.ora_entrata), s.ora_uscita ? fmtT(s.ora_uscita) : 'In corso');
          }

          const allClosed = shifts.every((s) => s.ora_uscita);
          let durataStr;
          if (allClosed) {
            const totMin = shifts.reduce((acc, s) => acc + (new Date(s.ora_uscita) - new Date(s.ora_entrata)) / 60000, 0);
            const h = Math.floor(totMin / 60);
            const m = Math.round(totMin % 60);
            durataStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
          } else {
            durataStr = shifts.map((s) => {
              if (!s.ora_uscita) return 'In corso';
              const min = Math.round((new Date(s.ora_uscita) - new Date(s.ora_entrata)) / 60000);
              const h = Math.floor(min / 60);
              const m = min % 60;
              return h > 0 ? `${h}h ${m}m` : `${m}m`;
            }).join(' + ');
          }

          const simbolo = presenzeMap.get(`${utente.id}-${g.dateStr}`) || '';
          const nota = shifts.find((s) => s.note?.trim())?.note?.trim() || '';
          row.push(durataStr, simbolo, nota);
          daySheet.addRow(row);
        });
      }
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=presenze.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Errore esportazione presenze', err);
    res.status(500).json({ error: 'Errore esportazione' });
  }
});

/* -------------------------------------------------------------------------- */
/*                        QR CODE, TIMBRATURA, OGGI                           */
/* -------------------------------------------------------------------------- */

router.get('/qr', async (req, res) => {
  const token = generateToken();
  const expiresAt = Date.now() + 5 * 1000; // 5sec
  validTokens[token] = { expiresAt };

  const qrPayload = JSON.stringify({ token });
  const qrImage = await QRCode.toDataURL(qrPayload);

  res.json({ image: qrImage, token });
});

router.post('/timbratura', requireAuth, async (req, res) => {
  const { token } = req.body;

  const record = validTokens[token];
  if (!record || Date.now() > record.expiresAt) {
    return res.status(400).json({ error: 'Token scaduto o non valido' });
  }

  delete validTokens[token];

  const utente_id = req.user.id;
  if (!utente_id) {
    return res.status(401).json({ error: 'Utente non autenticato' });
  }

  const utenteRes = await pool.query(
    `SELECT tipo_contratto FROM utenti WHERE id = $1 LIMIT 1`,
    [utente_id]
  );

  if (utenteRes.rows.length === 0) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }

  const tipo_contratto = utenteRes.rows[0].tipo_contratto;
  const minutiPrevisti = getMinutiContratto(tipo_contratto);

  const now = new Date();
  const oggi = localDateStr(now);

  const lastShift = await pool.query(
    `SELECT * FROM presenze WHERE utente_id = $1 ORDER BY ora_entrata DESC LIMIT 1`,
    [utente_id]
  );

  const turnoAperto = lastShift.rows.length > 0 && lastShift.rows[0].ora_uscita === null
    ? lastShift.rows[0]
    : null;

  if (!turnoAperto) {
    await pool.query(
      `INSERT INTO presenze (utente_id, data, ora_entrata) VALUES ($1, $2, $3)`,
      [utente_id, oggi, now]
    );
    console.log(`[timbratura] entrata utente=${utente_id} data=${oggi}`);
  } else {
    let oraUscitaFinale = now;

    if (minutiPrevisti > 0) {
      const cappata = await calcolaOraUscitaCappata(utente_id, turnoAperto, minutiPrevisti);
      if (cappata < now) oraUscitaFinale = cappata;
    }

    await pool.query(
      `UPDATE presenze SET ora_uscita = $1 WHERE id = $2`,
      [oraUscitaFinale, turnoAperto.id]
    );
    console.log(`[timbratura] uscita utente=${utente_id} turno_id=${turnoAperto.id}`);
  }

  res.json({ message: 'Timbratura registrata!' });
});

router.get('/oggi', requireAuth, async (req, res) => {
  const utente_id = req.user.id;

  if (!utente_id) {
    return res.status(401).json({ error: 'Non autenticato' });
  }

  const r = await pool.query(
    `SELECT ora_entrata, ora_uscita
       FROM presenze
      WHERE utente_id = $1
      ORDER BY ora_entrata DESC
      LIMIT 1`,
    [utente_id]
  );

  if (r.rows.length === 0 || r.rows[0].ora_uscita !== null) {
    return res.json({ ora_entrata: null, ora_uscita: null });
  }

  res.json(r.rows[0]);
});

/* -------------------------------------------------------------------------- */
/*                               RANGE PER APP                                */
/* -------------------------------------------------------------------------- */

router.get('/range', requireAuth, async (req, res) => {
  try {
    const { start, end } = req.query;
    const utente_id = req.user.id;

    if (!utente_id || !start || !end) {
      return res.status(400).json({ error: 'Parametri mancanti' });
    }
    const q = await pool.query(
      `SELECT to_char(data,'YYYY-MM-DD') AS d, ora_entrata, ora_uscita
         FROM presenze
        WHERE utente_id = $1 AND data BETWEEN $2 AND $3
        ORDER BY data ASC`,
      [utente_id, start, end]
    );
    const byDate = {};
    q.rows.forEach(r => { byDate[r.d] = { in: r.ora_entrata, out: r.ora_uscita }; });
    res.json({ byDate });
  } catch (e) {
    console.error('range presenze', e);
    res.status(500).json({ error: 'Errore lettura presenze' });
  }
});

module.exports = router;
