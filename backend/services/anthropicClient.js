// backend/services/anthropicClient.js
const Anthropic = require('@anthropic-ai/sdk');

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

if (!apiKey) {
  console.warn('[Anthropic] WARNING: ANTHROPIC_API_KEY non impostata nel .env');
}

const client = new Anthropic({ apiKey });

// Note su Claude Haiku 5.5:
// - il thinking adattivo è attivo di default (effort predefinito "medium"), e i
//   blocchi thinking contano in max_tokens: 2048 era troppo stretto.
// - i blocchi `thinking` della risposta vanno ripassati invariati insieme ai
//   tool_result: il loop in routes/assistenteHr.js rimanda response.content intero.
// - `cache_control` top-level mette in cache il prefisso (tool + system + storia)
//   e lo fa avanzare a ogni passaggio del loop: i passaggi successivi al primo
//   rileggono dalla cache a 0,1× del prezzo di input.
async function createMessage({ system, messages, tools, maxTokens = 8000 }) {
  try {
    return await client.messages.create({
      model,
      max_tokens: maxTokens,
      cache_control: { type: 'ephemeral' },
      system,
      messages,
      tools,
    });
  } catch (err) {
    console.error('[Anthropic] Error', err?.status, err?.message || err);
    throw err;
  }
}

// Traduce un errore dell'SDK in una risposta HTTP per il client, oppure null se
// non è un errore riconosciuto (→ 500 generico). Usa le classi tipizzate
// dell'SDK; il saldo esaurito non ha una classe propria (è un 400), quindi lì
// resta il controllo sul messaggio.
function classificaErrore(err) {
  if (err instanceof Anthropic.BadRequestError) {
    const msg = err?.error?.error?.message || err?.message || '';
    if (/credit balance/i.test(msg)) {
      return {
        status: 402,
        error: 'saldo_esaurito',
        message: "Il saldo dell'assistente HR è esaurito. Contatta l'assistenza per ricaricarlo.",
      };
    }
    return null;
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      error: 'troppe_richieste',
      message: 'ClockAI sta ricevendo troppe richieste in questo momento. Riprova tra qualche secondo.',
    };
  }
  // 5xx, incluso 529 "overloaded", ed errori di rete: l'SDK ha già riprovato 2 volte.
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
    return {
      status: 503,
      error: 'servizio_non_disponibile',
      message: 'Il servizio AI è momentaneamente non disponibile. Riprova tra poco.',
    };
  }
  return null;
}

module.exports = { createMessage, model, classificaErrore };
