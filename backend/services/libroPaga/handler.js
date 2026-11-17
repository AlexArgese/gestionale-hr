/**
 * backend/services/libroPaga/handler.js
 * Handler della rotta admin GET /presenze/libro-paga di
 * /backend/routes/presenze.js: scarica il libro paga del mese come Excel.
 *
 * Query: mese=AAAA-MM (obbligatorio), sede=… e societa=… (opzionali, ripetibili,
 * stessi nomi dell'export presenze).
 */
const pool = require('../../db');
const { parseMese } = require('./calendario');
const { caricaDatiMese } = require('./dati');
const { generaLibroPaga } = require('./excel');

const lista = (v) => (v ? (Array.isArray(v) ? v : [v]) : []);

async function exportLibroPagaHandler(req, res) {
  try {
    const periodo = parseMese(req.query.mese);
    if (!periodo) {
      return res.status(400).json({ error: 'Mese obbligatorio, nel formato AAAA-MM' });
    }

    const dipendenti = await caricaDatiMese(pool, {
      ...periodo,
      sedi: lista(req.query.sede),
      societa: lista(req.query.societa),
    });
    if (dipendenti.length === 0) {
      return res.status(404).json({ error: 'Nessun dipendente trovato per il mese e i filtri scelti' });
    }

    const workbook = generaLibroPaga({ ...periodo, dipendenti });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=libro_paga_${req.query.mese}.xlsx`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Errore esportazione libro paga', err);
    if (!res.headersSent) res.status(500).json({ error: 'Errore esportazione libro paga' });
  }
}

module.exports = { exportLibroPagaHandler };
