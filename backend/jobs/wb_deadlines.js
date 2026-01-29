// backend/jobs/wb_deadlines.js
const cron = require('node-cron');
const pool = require('../db');
const { getWbManagerId } = require('../lib/wbManager');

// Esegue ogni giorno alle 08:00 (Europe/Rome)
function startWbDeadlinesJob() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const managerId = await getWbManagerId();

      const { rows: needAck } = await pool.query(
        `SELECT protocol_code FROM wb_reports
         WHERE acknowledged_at IS NULL
           AND created_at < now() - interval '7 days'
           AND manager_id = $1`,
        [managerId]
      );

      const { rows: needResp } = await pool.query(
        `SELECT protocol_code FROM wb_reports
         WHERE first_response_at IS NULL
           AND created_at < now() - interval '3 months'
           AND manager_id = $1`,
        [managerId]
      );

      if (needAck.length) {
        console.log('🟡 Reminder ACK 7gg:', needAck.map(r => r.protocol_code));
        // TODO: invia email/Slack all’avvocato
      }
      if (needResp.length) {
        console.log('🔴 Reminder RISCONTRO 3 mesi:', needResp.map(r => r.protocol_code));
        // TODO: invia email/Slack
      }
    } catch (e) {
      console.error('WB deadlines job error:', e);
    }
  }, { timezone: 'Europe/Rome' });
}

module.exports = { startWbDeadlinesJob };
