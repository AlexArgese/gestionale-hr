// backend/routes/wb_manager.js
const express = require('express');
const pool = require('../db');
const { decryptToJson, encryptJson } = require('../lib/crypto');
const requireAuth = require('../middleware/requireAuth');
const { allowRoles } = require('../middleware/rbac');
const { getWbManagerId } = require('../lib/wbManager');

const router = express.Router();
router.use(requireAuth, allowRoles('wb_manager'));

// lista report
router.get('/reports', async (req, res) => {
  try {
    const { status, q } = req.query;
    const managerId = await getWbManagerId();
    const params = [managerId];
    let where = `WHERE manager_id = $1`;
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    if (q) { params.push(`%${q}%`); where += ` AND (protocol_code ILIKE $${params.length} OR title ILIKE $${params.length})`; }
    const { rows } = await pool.query(
      `SELECT id, protocol_code, title, is_anonymous, created_at, status, category_id,
              acknowledged_at, first_response_at, closed_at, last_update,
              policy_accepted, policy_version
       FROM wb_reports ${where}
       ORDER BY last_update DESC LIMIT 200`,
      params
    );
    res.json({ reports: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// cerca per protocol_code
router.get('/reports/by-protocol/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const managerId = await getWbManagerId();
    const { rows } = await pool.query(
      `SELECT id, protocol_code, title, status, created_at, last_update
       FROM wb_reports WHERE protocol_code=$1 AND manager_id=$2`,
      [code, managerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// dettaglio + thread decifrato
router.get('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const managerId = await getWbManagerId();
    const { rows: base } = await pool.query(
      `SELECT * FROM wb_reports WHERE id=$1 AND manager_id=$2`,
      [id, managerId]
    );
    if (!base.length) return res.status(404).json({ error: 'Not found' });
    const report = base[0];

    const description = report.description_encrypted
      ? (decryptToJson(report.description_encrypted).description || '')
      : '';

    const { rows: msgs } = await pool.query(
      `SELECT sender_role, body_encrypted, created_at
       FROM wb_messages WHERE report_id=$1 ORDER BY created_at ASC`,
      [id]
    );
    const messages = msgs.map(m => ({
      sender: m.sender_role,
      body: decryptToJson(m.body_encrypted).body,
      created_at: m.created_at
    }));

    await pool.query(
      `INSERT INTO wb_audit (report_id, actor_role, action) VALUES ($1,'manager','VIEWED')`,
      [id]
    );

    res.json({ report: {
        id: report.id,
        protocol_code: report.protocol_code,
        title: report.title,
        description,
        is_anonymous: report.is_anonymous,
        reporter_user_id: report.reporter_user_id,
        created_at: report.created_at,
        status: report.status,
        category_id: report.category_id,
        acknowledged_at: report.acknowledged_at,
        first_response_at: report.first_response_at,
        closed_at: report.closed_at,
        last_update: report.last_update,
        policy_accepted: report.policy_accepted,
        policy_version: report.policy_version
      },
      messages
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// risposta manager
router.post('/reports/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'Missing body' });

    const managerId = await getWbManagerId();
    const { rows: base } = await pool.query(
      `SELECT id, first_response_at FROM wb_reports WHERE id=$1 AND manager_id=$2`,
      [id, managerId]
    );
    if (!base.length) return res.status(404).json({ error: 'Not found' });

    const enc = encryptJson({ body });
    await pool.query(
      `INSERT INTO wb_messages (report_id, sender_role, body_encrypted)
       VALUES ($1,'manager',$2)`,
      [id, enc]
    );

    if (!base[0].first_response_at) {
      await pool.query(`UPDATE wb_reports SET first_response_at = now() WHERE id=$1`, [id]);
    }

    await pool.query(
      `INSERT INTO wb_audit (report_id, actor_role, action) VALUES ($1,'manager','MESSAGE_SENT')`,
      [id]
    );

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// cambio stato/categoria/ack
router.patch('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, category_id, acknowledge } = req.body;

    const managerId = await getWbManagerId();
    const { rows: base } = await pool.query(
      `SELECT id FROM wb_reports WHERE id=$1 AND manager_id=$2`,
      [id, managerId]
    );
    if (!base.length) return res.status(404).json({ error: 'Not found' });

    const fields = [];
    const params = [];
    let i = 1;

    if (status) { fields.push(`status = $${i++}`); params.push(status); }
    if (category_id) { fields.push(`category_id = $${i++}`); params.push(category_id); }
    if (acknowledge === true) { fields.push(`acknowledged_at = now()`); }

    if (!fields.length) return res.json({ updated: false });

    params.push(id);
    await pool.query(`UPDATE wb_reports SET ${fields.join(', ')} WHERE id = $${i}`, params);

    await pool.query(
      `INSERT INTO wb_audit (report_id, actor_role, action, meta)
       VALUES ($1,'manager','REPORT_UPDATED',$2)`,
      [id, { status, category_id, acknowledge }]
    );

    res.json({ updated: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
