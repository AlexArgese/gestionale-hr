const express = require("express");
const router = express.Router();
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");

router.post("/register", requireAuth, async (req, res) => {
  try {
    console.log("PUSH REGISTER HIT", {
      userId: req.user?.id,
      email: req.user?.email,
      body: req.body,
      auth: !!req.headers.authorization,
    });

    const expoPushToken = String(req.body?.expoPushToken || "").trim();
    const platform = String(req.body?.platform || "").trim() || null;

    console.log("PUSH REGISTER PARSED", { expoPushToken, platform });

    if (
      !expoPushToken.startsWith("ExponentPushToken") &&
      !expoPushToken.startsWith("ExpoPushToken")
    ) {
      console.log("PUSH REGISTER INVALID TOKEN", expoPushToken);
      return res.status(400).json({ error: "expoPushToken non valido" });
    }

    if (!req.user?.id) {
      console.log("PUSH REGISTER NO USER ID");
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

    console.log("PUSH REGISTER OK", { userId: req.user.id, expoPushToken });

    return res.json({ ok: true });
  } catch (e) {
    console.error("push/register", e);
    return res.status(500).json({ error: "Errore interno server" });
  }
});

module.exports = router;