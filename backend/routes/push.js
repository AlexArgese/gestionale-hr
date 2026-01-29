const express = require("express");
const router = express.Router();
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");

router.post("/register", requireAuth, async (req, res) => {
  try {
    const expoToken = String(req.body?.expoToken || "").trim();
    if (!expoToken.startsWith("ExponentPushToken") && !expoToken.startsWith("ExpoPushToken")) {
      return res.status(400).json({ error: "expoToken non valido" });
    }

    const q = await pool.query("SELECT id FROM utenti WHERE email = $1 LIMIT 1", [req.user.email]);
    if (!q.rows.length) return res.status(404).json({ error: "Utente non trovato" });

    const userId = q.rows[0].id;

    await pool.query(
      `INSERT INTO push_tokens (utente_id, expo_token)
       VALUES ($1, $2)
       ON CONFLICT (utente_id, expo_token) DO NOTHING`,
      [userId, expoToken]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("push/register", e);
    res.status(500).json({ error: "Errore interno server" });
  }
});

module.exports = router;
