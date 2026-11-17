// backend/services/hrAssistant/pricing.js
// Prezzi ufficiali Anthropic in USD per milione di token (input/output), API
// diretta. Per Haiku 5.5 vale la tariffa per prompt fino a 100K token (sopra
// costa 5×: l'assistente non ci arriva mai).
const PREZZI_USD_PER_MILIONE = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

// Moltiplicatori sul prezzo di input per la cache del prompt (TTL 5 minuti).
const MOLTIPLICATORE_SCRITTURA_CACHE = 1.25;
const MOLTIPLICATORE_LETTURA_CACHE = 0.1;

// Modello non in tabella: meglio sovrastimare (prezzo più alto noto) che far
// sforare il budget in silenzio.
const PREZZO_PRUDENZIALE = Object.values(PREZZI_USD_PER_MILIONE).reduce((max, p) =>
  p.output > max.output ? p : max
);

function calcolaCostoUsd(model, usage) {
  let prezzi = PREZZI_USD_PER_MILIONE[model];
  if (!prezzi) {
    console.warn(`[assistenteHr] Prezzo sconosciuto per il modello "${model}": uso la tariffa più alta nota`);
    prezzi = PREZZO_PRUDENZIALE;
  }
  const input = usage?.input_tokens || 0;
  const scritturaCache = usage?.cache_creation_input_tokens || 0;
  const letturaCache = usage?.cache_read_input_tokens || 0;
  const output = usage?.output_tokens || 0;
  const costoInput =
    input + scritturaCache * MOLTIPLICATORE_SCRITTURA_CACHE + letturaCache * MOLTIPLICATORE_LETTURA_CACHE;
  return (costoInput / 1e6) * prezzi.input + (output / 1e6) * prezzi.output;
}

module.exports = { calcolaCostoUsd };
