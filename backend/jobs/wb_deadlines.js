// backend/jobs/wb_deadlines.js
const cron = require('node-cron');
const pool = require('../db');
const { getWbManagerId } = require('../lib/wbManager');
const { sendManagerDeadlineEmail } = require('../lib/wbMailer');

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
        const protocols = needAck.map(r => r.protocol_code);
        console.log('[WB] Reminder ACK 7gg:', protocols);
        try {
          await sendManagerDeadlineEmail({ type: 'ack', protocols });
        } catch (e) {
          console.warn('[WB] deadline mail ack errore:', e.message);
        }
      }

      if (needResp.length) {
        const protocols = needResp.map(r => r.protocol_code);
        console.log('[WB] Reminder RISCONTRO 3 mesi:', protocols);
        try {
          await sendManagerDeadlineEmail({ type: 'riscontro', protocols });
        } catch (e) {
          console.warn('[WB] deadline mail riscontro errore:', e.message);
        }
      }
    } catch (e) {
      console.error('WB deadlines job error:', e);
    }
  }, { timezone: 'Europe/Rome' });
}

module.exports = { startWbDeadlinesJob };
