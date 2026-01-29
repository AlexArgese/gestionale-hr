const express = require('express');
const router = express.Router();
const pool = require('../db');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// --- 1. METRICHE ----------------------------------------------------------
router.get('/metriche', async (_, res) => {
    try {
      const attivi = await pool.query(`SELECT COUNT(*) FROM utenti WHERE stato_attivo = true`);
      const contratti = await pool.query(`
        SELECT COUNT(*) FROM utenti u
        LEFT JOIN documenti d ON d.utente_id = u.id AND d.tipo_documento = 'Contratto'
        WHERE u.stato_attivo = true AND d.id IS NULL
      `);
      const scaduti = await pool.query(`
        SELECT COUNT(*) FROM documenti
        WHERE data_scadenza IS NOT NULL AND data_scadenza < CURRENT_DATE
      `);
      const incompleti = await pool.query(`
        SELECT COUNT(*) FROM utenti
        WHERE cellulare IS NULL OR cellulare = ''
            OR codice_fiscale IS NULL OR codice_fiscale = ''
            OR cognome IS NULL OR cognome = ''
            OR email IS NULL OR email = ''
            OR data_nascita IS NULL
      `);
  
      res.json({
        dipendentiAttivi: attivi.rows[0].count,
        contrattiMancanti: contratti.rows[0].count,
        documentiScaduti: scaduti.rows[0].count,
        profiliIncompleti: incompleti.rows[0].count
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Errore metriche' });
    }
  });
  
  
  
  // --- 2. DISTRIBUZIONE PER SOCIETÀ ----------------------------------------
  router.get('/distribuzione/societa', async (_, res) => {
    try {
      const result = await pool.query(`
        SELECT s.ragione_sociale as societa, COUNT(*) as totale
        FROM utenti u
        JOIN societa s ON u.societa_id = s.id
        WHERE u.stato_attivo = true
        GROUP BY s.ragione_sociale
      `);
      res.json(
        result.rows.map(r => ({
          societa: r.societa,
          totale: parseInt(r.totale, 10)
        }))
      );      
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Errore distribuzione' });
    }
  });
  
  
  // --- 3. STORICO ASSUNZIONI ----------------------------------------------
  router.get('/storico/assunzioni', async (_, res) => {
    try {
      const result = await pool.query(`
        SELECT
          TO_CHAR(data_assunzione, 'YYYY-MM') as mese,
          COUNT(*) as totale
        FROM utenti
        WHERE data_assunzione IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      `);
      res.json(result.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Errore storico assunzioni' });
    }
  });
  
  
  
  // --- 4. AVVISI DOCUMENTI --------------------------------------------------
  router.get('/avvisi/documenti', async (_, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.nome, u.cognome, 'Contratto mancante o scaduto' as problema
        FROM utenti u
        LEFT JOIN documenti d ON d.utente_id = u.id AND d.tipo_documento = 'Contratto'
        WHERE u.stato_attivo = true AND (
          d.id IS NULL OR (d.data_scadenza IS NOT NULL AND d.data_scadenza < CURRENT_DATE)
        )
      `);
      res.json(result.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Errore avvisi' });
    }
  });
  
// Scarica tutti i documenti di un certo tipo in uno ZIP
router.get('/download-massivo/:tipo', async (req, res) => {
    const { tipo } = req.params;
  
    try {
      const result = await pool.query(`
        SELECT d.nome_file, d.url_file, u.nome, u.cognome
        FROM documenti d
        JOIN utenti u ON d.utente_id = u.id
        WHERE d.tipo_documento = $1
      `, [tipo]);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Nessun documento trovato' });
      }
  
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=documenti_${tipo}.zip`);
  
      const archive = archiver('zip');
      archive.pipe(res);
  
      for (const row of result.rows) {
        const filePath = path.join(__dirname, '..', row.url_file);
        const fileName = `${row.cognome}_${row.nome}_${row.nome_file}`;
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: fileName });
        }
      }
  
      archive.finalize();
    } catch (err) {
      console.error('Errore ZIP:', err);
      res.status(500).json({ error: 'Errore generazione ZIP' });
    }
  });

module.exports = router;
