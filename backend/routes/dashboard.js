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
        SELECT
          d.id,
          u.id AS utente_id,
          u.nome,
          u.cognome,
          d.nome_file,
          d.tipo_documento,
          d.yousign_status
        FROM documenti d
        JOIN utenti u ON u.id = d.utente_id
        WHERE d.require_signature = true
          AND COALESCE(d.yousign_status, '') NOT IN ('completed', 'signed', 'done')
        ORDER BY d.data_upload DESC
      `);

      res.json(result.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Errore avvisi documenti' });
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

  router.get('/dipendenti/stato', async (_, res) => {
  try {
    const totali = await pool.query(`SELECT COUNT(*) FROM utenti`);
    const attivi = await pool.query(`SELECT COUNT(*) FROM utenti WHERE stato_attivo = true`);

    res.json([
      { nome: 'Totali', totale: parseInt(totali.rows[0].count, 10) },
      { nome: 'Attivi', totale: parseInt(attivi.rows[0].count, 10) }
    ]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore stato dipendenti' });
  }
});

// --- 5. APP ADOPTION — utenti con app installata ---
router.get('/app/con-app', async (_, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.nome,
        u.cognome,
        u.email,
        u.sede,
        STRING_AGG(DISTINCT p.platform, ', ') AS piattaforme,
        MIN(p.created_at) AS prima_registrazione_app,
        MAX(p.updated_at) AS ultimo_utilizzo_app
      FROM utenti u
      JOIN push_tokens p ON p.utente_id = u.id
      WHERE u.stato_attivo = true
        AND u.archiviato = false
        AND u.app_access_revoked = false
        AND u.app_account_deleted_at IS NULL
        AND p.attivo = true
      GROUP BY u.id, u.nome, u.cognome, u.email, u.sede
      ORDER BY ultimo_utilizzo_app DESC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore app con-app' });
  }
});

// --- 6b. APP ADOPTION — invia email promemoria ---
router.post('/app/invia-promemoria', async (req, res) => {
  const { utente_ids } = req.body;
  if (!Array.isArray(utente_ids) || utente_ids.length === 0)
    return res.status(400).json({ error: 'Nessun utente selezionato' });

  const { safeSendMail } = require('../lib/notifier');

  const result = await pool.query(
    `SELECT id, nome, cognome, email FROM utenti WHERE id = ANY($1)`,
    [utente_ids]
  );

  let inviati = 0;
  const errori = [];

  for (const u of result.rows) {
    if (!u.email) { errori.push({ id: u.id, reason: 'email mancante' }); continue; }
    const html = buildPromemoriaHtml(u.nome);
    const { ok, reason } = await safeSendMail({
      to: u.email,
      subject: '📱 Scarica ClockEasy — la tua app HR aziendale',
      html,
    });
    if (ok) inviati++; else errori.push({ id: u.id, nome: u.nome, reason });
  }

  res.json({ inviati, errori });
});

function buildPromemoriaHtml(nome) {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F6F8FA;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FA;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(90deg,#D0933C,#6A57D3);padding:36px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:1px;text-transform:uppercase;">ClockEasy HR</p>
            <h1 style="margin:0;color:#fff;font-size:26px;font-weight:900;letter-spacing:0.3px;">📱 Scarica l'app aziendale</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:16px;color:#334155;">Ciao <strong>${nome}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.7;">
              Ti informiamo che l'app <strong>ClockEasy</strong> è disponibile sul tuo smartphone.<br>
              Con l'app puoi consultare i tuoi documenti, visualizzare i turni e restare sempre aggiornato sulle comunicazioni aziendali.
            </p>

            <!-- Divider -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td style="border-top:1px solid #E5E7EB;"></td></tr>
            </table>

            <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#0F172A;text-align:center;">Scegli il tuo sistema operativo:</p>

            <!-- CTA Buttons -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:0 8px 0 0;" width="50%">
                  <a href="https://apps.apple.com/it/app/clockeasy/id6759530029"
                     style="display:block;background:#0F172A;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:700;text-align:center;">
                    🍎&nbsp; App Store (iOS)
                  </a>
                </td>
                <td align="center" style="padding:0 0 0 8px;" width="50%">
                  <a href="https://play.google.com/store/apps/details?id=com.alexargese.clockeasy"
                     style="display:block;background:#6A57D3;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:700;text-align:center;">
                    ▶&nbsp; Google Play (Android)
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:28px 0 0;font-size:13px;color:#64748B;line-height:1.6;">
              Per qualsiasi difficoltà nell'installazione contatta il tuo responsabile HR.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;padding:18px 40px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5;">
              Messaggio automatico inviato da <strong>ClockEasy HR</strong> · Non rispondere a questa email
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// --- 6. APP ADOPTION — utenti senza app ---
router.get('/app/senza-app', async (_, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.nome,
        u.cognome,
        u.email,
        u.sede
      FROM utenti u
      WHERE u.stato_attivo = true
        AND u.archiviato = false
        AND u.app_access_revoked = false
        AND u.app_account_deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM push_tokens p
          WHERE p.utente_id = u.id AND p.attivo = true
        )
      ORDER BY u.cognome, u.nome
    `);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore app senza-app' });
  }
});

module.exports = router;
