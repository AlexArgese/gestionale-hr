const cron = require('node-cron');
const pool = require('../db');
const { sendExpoPush } = require('../services/expoPush');

function startTLReminderJob() {
  // Ogni giorno alle 12:00 (Europe/Rome)
  cron.schedule('0 12 * * *', async () => {
    console.log('[TL Reminder] Avvio notifica team leader ore 12');
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT pt.expo_push_token
        FROM utenti u
        JOIN push_tokens pt ON pt.utente_id = u.id
        WHERE u.stato_attivo = true
          AND u.team_leader_sedi IS NOT NULL
          AND trim(u.team_leader_sedi) <> ''
          AND pt.attivo = true
      `);

      if (rows.length === 0) {
        console.log('[TL Reminder] Nessun team leader con push token attivo');
        return;
      }

      const tokens = rows.map(r => r.expo_push_token);
      await sendExpoPush(tokens, {
        title: 'Riepilogo presenze',
        body: 'Controlla le presenze giornaliere',
        data: { type: 'TL_REMINDER' },
      });

      console.log(`[TL Reminder] Notifiche inviate a ${tokens.length} team leader`);
    } catch (e) {
      console.error('[TL Reminder] Errore:', e);
    }
  }, { timezone: 'Europe/Rome' });
}

module.exports = { startTLReminderJob };
