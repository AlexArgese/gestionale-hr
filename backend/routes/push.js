const express = require("express");
const router = express.Router();
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");

router.post("/register", requireAuth, async (req, res) => {
  try {
    const expoPushToken = String(req.body?.expoPushToken || "").trim();
    const platform = String(req.body?.platform || "").trim() || null;

    if (
      !expoPushToken.startsWith("ExponentPushToken") &&
      !expoPushToken.startsWith("ExpoPushToken")
    ) {
      return res.status(400).json({ error: "expoPushToken non valido" });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: "Utente non autenticato" });
    }

    await pool.query(
      `
      INSERT INTO push_tokens (utente_id, expo_push_token, platform, attivo, updated_at)
      VALUES ($1, $2, $3, true, NOW())
      ON CONFLICT (expo_push_token)
      DO UPDATE SET
        utente_id = EXCLUDED.utente_id,
        platform = EXCLUDED.platform,
        attivo = true,
        updated_at = NOW()
      `,
      [req.user.id, expoPushToken, platform]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("push/register", e);
    return res.status(500).json({ error: "Errore interno server" });
  }
});

module.exports = router;