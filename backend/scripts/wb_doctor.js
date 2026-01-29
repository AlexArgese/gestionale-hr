// backend/scripts/wb_doctor.js
require('dotenv').config();
const pool = require('../db');

(async () => {
  try {
    console.log('=== WB Doctor ===');

    // 1) Chiave AES
    const keyB64 = process.env.WB_AES_KEY || '';
    const keyBuf = Buffer.from(keyB64, 'base64');
    console.log('WB_AES_KEY length (bytes):', keyBuf.length);
    if (keyBuf.length !== 32) {
      console.error('❌ WB_AES_KEY non valida: deve essere base64 di 32 byte');
      process.exit(1);
    } else {
      console.log('✅ WB_AES_KEY OK');
    }

    // 2) Connessione DB
    const { rows: one } = await pool.query('SELECT 1 as ok');
    console.log('DB ping:', one[0].ok === 1 ? '✅ OK' : '❌ FAIL');

    // 3) Estensione pgcrypto
    const ext = await pool.query(
      "SELECT installed_version FROM pg_available_extensions WHERE name='pgcrypto'"
    );
    const installed = ext.rows.find(r => r.installed_version);
    console.log('pgcrypto:', installed ? '✅ installata' : '⚠️ non risulta installata');

    // 4) wb_manager presente
    const { rows: mgr } = await pool.query(
      "SELECT id, nome, cognome, email, role, stato_attivo FROM utenti WHERE role='wb_manager' AND stato_attivo=true LIMIT 5"
    );
    if (!mgr.length) {
      console.error('❌ Nessun utente role=wb_manager attivo');
      process.exit(1);
    } else {
      console.log('✅ wb_manager trovato:', mgr.map(m => `${m.id} ${m.email}`));
    }

    // 5) INSERT di prova "dry-run": genera protocol e controlla insert minimi
    const y = new Date().getFullYear();
    const num = String(Math.floor(Math.random()*1e6)).padStart(6,'0');
    const protocol = `WB-${y}-${num}`;

    // usa funzione cifratura come nel runtime
    const crypto = require('crypto');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    const pt = Buffer.from(JSON.stringify({ description: 'test doctor' }));
    const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    const packed = Buffer.concat([iv, tag, enc]);

    // prendi il primo manager
    const managerId = mgr[0].id;

    const ins = await pool.query(
      `INSERT INTO wb_reports (protocol_code, title, description_encrypted, is_anonymous, category_id, manager_id, acknowledged_at)
       VALUES ($1,$2,$3,true,$4,$5, now())
       RETURNING id, protocol_code`,
      [protocol, 'WB Doctor Test', packed, null, managerId]
    );
    console.log('✅ Insert wb_reports OK, id:', ins.rows[0].id, 'protocol:', ins.rows[0].protocol_code);

    // cleanup
    await pool.query('DELETE FROM wb_reports WHERE id=$1', [ins.rows[0].id]);
    console.log('🧹 cleanup OK');

    console.log('=== Tutto OK lato infrastruttura ===');
    process.exit(0);
  } catch (e) {
    console.error('❌ WB Doctor error:', e);
    process.exit(1);
  }
})();
