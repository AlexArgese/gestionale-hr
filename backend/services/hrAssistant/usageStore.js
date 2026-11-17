// backend/services/hrAssistant/usageStore.js
//
// Traccia il costo (USD) delle chiamate all'assistente HR, con un limite di
// spesa giornaliero e uno mensile per tutta l'azienda, più un limite
// giornaliero per singolo utente (così un utente non esaurisce il budget di
// tutti). Nota: i limiti sono configurati in "euro" mentre Anthropic fattura in
// USD — per semplicità li trattiamo 1:1 (€ = $), un'approssimazione accettabile
// viste le cifre in gioco (pochi euro/mese).
const pool = require('../../db');
const { ensureSchema } = require('./schema');
const { oggiRoma } = require('./dateUtils');

const BUDGET_GIORNALIERO = Number(process.env.HR_ASSISTANT_BUDGET_GIORNALIERO_USD || 0.15);
const BUDGET_MENSILE = Number(process.env.HR_ASSISTANT_BUDGET_MENSILE_USD || 5);
const BUDGET_GIORNALIERO_UTENTE = Number(process.env.HR_ASSISTANT_BUDGET_GIORNALIERO_UTENTE_USD || 0.05);

function primoDelMeseStr() {
  return `${oggiRoma().slice(0, 7)}-01`;
}

async function registraUso({ utenteId, inputTokens, outputTokens, costoUsd }) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO hr_assistant_usage (data, creato_da, costo_usd, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5)`,
    [oggiRoma(), utenteId || null, costoUsd, inputTokens, outputTokens]
  );
}

function voce(speso, limite) {
  return { speso, limite, percentuale: Math.round((speso / limite) * 1000) / 10 };
}

async function getConsumo(utenteId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(costo_usd) FILTER (WHERE data = $1), 0)::float AS oggi,
            COALESCE(SUM(costo_usd), 0)::float AS mese,
            COALESCE(SUM(costo_usd) FILTER (WHERE data = $1 AND creato_da IS NOT DISTINCT FROM $3), 0)::float AS utente_oggi
       FROM hr_assistant_usage
      WHERE data >= $2`,
    [oggiRoma(), primoDelMeseStr(), utenteId ?? null]
  );
  const r = rows[0];
  return {
    oggi: voce(r.oggi, BUDGET_GIORNALIERO),
    mese: voce(r.mese, BUDGET_MENSILE),
    utente_oggi: voce(r.utente_oggi, BUDGET_GIORNALIERO_UTENTE),
  };
}

module.exports = { registraUso, getConsumo };
