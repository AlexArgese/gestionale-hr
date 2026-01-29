// backend/jobs/wb_retention.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { filePathFromStorageKey } = require('../lib/files');

function safeUnlink(p) { try { fs.unlinkSync(p); } catch (_) {} }

function startWbRetentionJob() {
  // tutti i giorni alle 03:30
  cron.schedule('30 3 * * *', async () => {
    try {
      // prendi i report da cancellare (chiusi da > 5 anni)
      const { rows: reports } = await pool.query(
        `SELECT id FROM wb_reports
         WHERE closed_at IS NOT NULL AND closed_at < now() - interval '5 years'`
      );

      for (const r of reports) {
        // raccogli file da cancellare
        const { rows: atts } = await pool.query(
          `SELECT storage_key FROM wb_attachments WHERE report_id=$1`,
          [r.id]
        );
        for (const a of atts) {
          const abs = filePathFromStorageKey(a.storage_key);
          safeUnlink(abs);
        }
        // DELETE CASCADE su wb_reports rimuove anche messages/attachments/reply_tokens
        await pool.query(`DELETE FROM wb_reports WHERE id=$1`, [r.id]);
        console.log('🧹 WB retention: deleted report', r.id);
      }
    } catch (e) {
      console.error('WB retention job error:', e);
    }
  }, { timezone: 'Europe/Rome' });
}

module.exports = { startWbRetentionJob };
