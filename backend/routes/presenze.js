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

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// 🔹 Data locale "YYYY-MM-DD" (evita UTC)
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toSuperscript(n) {
  const map = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(n).split('').map(c => map[c] || c).join('');
}

/* -------------------------------------------------------------------------- */
/*                                   EXPORT                                   */
/* -------------------------------------------------------------------------- */

router.get('/export', async (req, res) => {
  const { start, end, solo_presenti } = req.query;

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

    const filterSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const utentiQuery = `
      SELECT u.id, u.nome, u.cognome
      FROM utenti u
      ${filterSql}
      ORDER BY u.cognome, u.nome
    `;

    const utenti = await pool.query(utentiQuery, values);

    if (utenti.rows.length === 0) {
      return res.status(404).json({ error: 'Nessun utente trovato' });
    }

    // fine +1 giorno in formato locale
    const endDateObj = new Date(end);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const adjustedEnd = localDateStr(endDateObj);

    const presenze = await pool.query(
      `
      SELECT utente_id, to_char(data, 'YYYY-MM-DD') AS data_str, note
      FROM presenze
      WHERE data >= $1 AND data < $2
      `,
      [start, adjustedEnd]
    );

    const noteLegend = {};
    const noteApici = {};
    let noteCounter = 1;

    const presenzeMap = new Map();
    presenze.rows.forEach((p) => {
      const key = `${p.utente_id}-${p.data_str}`;
      if (p.note && p.note.trim()) {
        const nota = p.note.trim();
        if (!noteApici[nota]) {
          const sup = toSuperscript(noteCounter);
          noteApici[nota] = sup;
          noteLegend[sup] = nota;
          noteCounter++;
        }
        const sup = noteApici[nota];
        presenzeMap.set(key, `P${sup}`);
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
    sheet.addRow(intestazioni);

    const righe = [];
    const presenzePerGiorno = new Array(giorni.length).fill(0);

    utenti.rows.forEach((utente) => {
      const riga = [`${utente.nome} ${utente.cognome}`];
      let count = 0;

      giorni.forEach((g, idx) => {
        const chiave = `${utente.id}-${g.dateStr}`;
        const valore = presenzeMap.get(chiave);
        if (valore) {
          count++;
          presenzePerGiorno[idx]++;
        }
        riga.push(valore || '');
      });

      riga.push(count);

      if (!solo_presenti || count > 0) {
        righe.push(riga);
      }
    });

    righe.forEach((r) => sheet.addRow(r));

    const totalRow = ['Totale'];
    presenzePerGiorno.forEach((c) => totalRow.push(c));
    totalRow.push('');
    sheet.addRow(totalRow);

    if (Object.keys(noteLegend).length > 0) {
      sheet.addRow([]);
      sheet.addRow(['Legenda note']);
      for (const [sup, nota] of Object.entries(noteLegend)) {
        sheet.addRow([`${sup}: ${nota}`]);
      }
    }

    sheet.addTable({
      name: 'PresenzeTable',
      ref: 'A1',
      headerRow: true,
      totalsRow: true,
      style: { theme: 'TableStyleMedium9', showRowStripes: true },
      columns: intestazioni.map((h, i) => ({
        name: h,
        totalsRowFunction:
          i === 0 || i === intestazioni.length - 1 ? undefined : 'sum',
      })),
      rows: righe.map((r) => r.slice()),
    });

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

  delete validTokens[token]; // ✅ token usa-e-getta

  const utente_id = req.user.id; // ✅ preso dal login, non dal client
  if (!utente_id) {
    return res.status(401).json({ error: 'Utente non autenticato' });
  }

  const now = new Date();
  const oggi = localDateStr(now);

  const existing = await pool.query(
    `SELECT * FROM presenze WHERE utente_id = $1 AND data = $2`,
    [utente_id, oggi]
  );

  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO presenze (utente_id, data, ora_entrata) VALUES ($1, $2, $3)`,
      [utente_id, oggi, now]
    );
  } else if (!existing.rows[0].ora_uscita) {
    await pool.query(
      `UPDATE presenze SET ora_uscita = $1 WHERE utente_id = $2 AND data = $3`,
      [now, utente_id, oggi]
    );
  }

  res.json({ message: 'Timbratura registrata!' });
});

router.get('/oggi', requireAuth, async (req, res) => {
  const utente_id = req.user.id;

  if (!utente_id) {
    return res.status(401).json({ error: 'Non autenticato' });
  }
  const oggi = localDateStr(new Date()); // ✅ locale

  const r = await pool.query(
    `SELECT ora_entrata, ora_uscita
       FROM presenze
      WHERE utente_id = $1 AND data = $2
      LIMIT 1`,
    [utente_id, oggi]
  );

  if (r.rows.length === 0) {
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
