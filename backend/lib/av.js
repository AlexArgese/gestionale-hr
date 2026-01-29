// backend/lib/av.js
const { execFile } = require('child_process');
const pool = require('../db');

const MODE = (process.env.WB_AV_MODE || 'disabled').toLowerCase(); // 'disabled' | 'local'
const CLAMSCAN = process.env.CLAMSCAN_BIN || 'clamscan';            // es. /opt/homebrew/bin/clamscan
const DEBUG = process.env.WB_AV_DEBUG === '1';

function clamscan(filePath) {
  return new Promise((resolve) => {
    // -i = mostra solo infetti (FOUND). Per i puliti non stampa "OK".
    execFile(CLAMSCAN, ['-i', filePath], { timeout: 60_000 }, (err, stdout = '', stderr = '') => {
      const code = err ? err.code : 0;
      if (DEBUG) console.log('[AV] run', { CLAMSCAN, filePath, code, stdout, stderr });

      // Mappatura ufficiale ClamAV:
      // 0 = pulito, 1 = infetti trovati, 2 = errore
      if (code === 0) return resolve('clean');
      if (code === 1) return resolve('quarantined');
      return resolve('pending'); // problemi scanner (database mancante, ecc.)
    });
  });
}

async function scanAndUpdate(reportId, attachmentId, filePath) {
  try {
    if (MODE === 'disabled') return 'pending';
    const status = await clamscan(filePath);
    await pool.query(
      `UPDATE wb_attachments SET av_status = $1 WHERE id = $2 AND report_id = $3`,
      [status, attachmentId, reportId]
    );
    if (DEBUG) console.log('[AV] update', { attachmentId, status });
    return status;
  } catch (e) {
    if (DEBUG) console.error('[AV] error', e);
    return 'pending';
  }
}

module.exports = { scanAndUpdate, MODE, CLAMSCAN };
