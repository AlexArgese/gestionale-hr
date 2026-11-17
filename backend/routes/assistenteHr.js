// backend/routes/assistenteHr.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { allowRoles } = require('../middleware/rbac');
const { classificaErrore, model } = require('../services/anthropicClient');
const { buildSystemPrompt } = require('../services/hrAssistant/systemPrompt');
const { eseguiTurno, costruisciStorico, personeDaStorico } = require('../services/hrAssistant/agente');
const { calcolaCostoUsd } = require('../services/hrAssistant/pricing');
const { registraUso, getConsumo } = require('../services/hrAssistant/usageStore');
const {
  listaConversazioni,
  getConversazione,
  salvaTurno,
  impostaFeedback,
  eliminaConversazione,
  listaFeedback,
  contaDaRivedere,
  segnaRevisionato,
} = require('../services/hrAssistant/conversationStore');

router.use(requireAuth, allowRoles('admin'));

const MAX_LUNGHEZZA_DOMANDA = 1000;

// Una sola domanda alla volta per utente: evita doppi invii e due richieste
// che superano insieme il limite di spesa (il controllo avviene prima della
// chiamata, la spesa si registra dopo). Vale per il singolo processo Node.
const richiesteInCorso = new Set();

function parseId(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

router.get('/consumo', async (req, res) => {
  try {
    res.json(await getConsumo(req.user?.id));
  } catch (err) {
    console.error('GET /assistente-hr/consumo', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/conversazioni', async (req, res) => {
  try {
    res.json(await listaConversazioni(req.user?.id));
  } catch (err) {
    console.error('GET /assistente-hr/conversazioni', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/conversazioni/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Id non valido' });
  try {
    const conversazione = await getConversazione(id, req.user?.id);
    if (!conversazione) return res.status(404).json({ error: 'Conversazione non trovata' });
    res.json(conversazione);
  } catch (err) {
    console.error('GET /assistente-hr/conversazioni/:id', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.delete('/conversazioni/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Id non valido' });
  try {
    const eliminata = await eliminaConversazione(id, req.user?.id);
    if (!eliminata) return res.status(404).json({ error: 'Conversazione non trovata' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /assistente-hr/conversazioni/:id', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.post('/messaggi/:id/feedback', async (req, res) => {
  const id = parseId(req.params.id);
  const valore = req.body?.valore;
  if (id == null) return res.status(400).json({ error: 'Id non valido' });
  if (![1, -1, 0].includes(valore)) return res.status(400).json({ error: 'valore deve essere 1, -1 o 0' });
  try {
    const ok = await impostaFeedback(id, req.user?.id, valore);
    if (!ok) return res.status(404).json({ error: 'Messaggio non trovato' });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /assistente-hr/messaggi/:id/feedback', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// Revisione delle risposte con feedback (pagina /clockai/revisione). Mostra
// domande e risposte di tutti gli admin: serve per capire dove ClockAI sbaglia.
router.get('/feedback', async (req, res) => {
  const valore = req.query.valore === '1' ? 1 : -1;
  const daRivedere = req.query.stato !== 'tutti';
  try {
    res.json(await listaFeedback({ valore, daRivedere }));
  } catch (err) {
    console.error('GET /assistente-hr/feedback', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/feedback/conteggio', async (req, res) => {
  try {
    res.json({ da_rivedere: await contaDaRivedere() });
  } catch (err) {
    console.error('GET /assistente-hr/feedback/conteggio', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.post('/messaggi/:id/revisionato', async (req, res) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Id non valido' });
  const revisionato = req.body?.revisionato !== false;
  try {
    const ok = await segnaRevisionato(id, revisionato);
    if (!ok) return res.status(404).json({ error: 'Messaggio non trovato' });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /assistente-hr/messaggi/:id/revisionato', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

function verificaBudget(consumo) {
  if (consumo.utente_oggi.speso >= consumo.utente_oggi.limite) {
    return "Hai raggiunto il tuo limite di utilizzo giornaliero di ClockAI. Riprova domani.";
  }
  if (consumo.oggi.speso >= consumo.oggi.limite) {
    return "È stato raggiunto il limite di utilizzo giornaliero dell'assistente HR. Riprova domani.";
  }
  if (consumo.mese.speso >= consumo.mese.limite) {
    return "È stato raggiunto il limite di utilizzo mensile dell'assistente HR. Contatta l'assistenza.";
  }
  return null;
}

router.post('/chat', async (req, res) => {
  const { domanda: domandaRaw, conversazione_id } = req.body || {};
  if (typeof domandaRaw !== 'string' || !domandaRaw.trim()) {
    return res.status(400).json({ error: 'Domanda mancante' });
  }
  const domanda = domandaRaw.trim();
  if (domanda.length > MAX_LUNGHEZZA_DOMANDA) {
    return res.status(400).json({ error: `Domanda troppo lunga (max ${MAX_LUNGHEZZA_DOMANDA} caratteri)` });
  }

  const utenteId = req.user?.id;
  const chiave = utenteId ?? 'anonimo';
  if (richiesteInCorso.has(chiave)) {
    return res.status(429).json({
      error: 'richiesta_in_corso',
      message: 'Attendi la risposta alla domanda precedente.',
    });
  }
  richiesteInCorso.add(chiave);

  try {
    const consumoPrima = await getConsumo(utenteId);
    const bloccoBudget = verificaBudget(consumoPrima);
    if (bloccoBudget) {
      return res.status(402).json({ error: 'budget_esaurito', message: bloccoBudget, consumo: consumoPrima });
    }

    let conversazioneId = null;
    let storico = [];
    let personeNote = {};
    if (conversazione_id != null) {
      const idRichiesto = parseId(conversazione_id);
      if (idRichiesto == null) return res.status(400).json({ error: 'conversazione_id non valido' });
      const conversazione = await getConversazione(idRichiesto, utenteId, { conScambio: true });
      if (!conversazione) return res.status(404).json({ error: 'Conversazione non trovata' });
      conversazioneId = conversazione.id;
      storico = costruisciStorico(conversazione.messaggi);
      personeNote = personeDaStorico(conversazione.messaggi);
    }

    const system = await buildSystemPrompt();
    const turno = await eseguiTurno({ system, storico, domanda, personeNote });

    // La spesa va registrata comunque: le chiamate a Claude sono avvenute
    // indipendentemente dall'esito finale.
    const u = turno.usage;
    await registraUso({
      utenteId,
      // Totale dei token di input, compresi quelli letti/scritti in cache.
      inputTokens: u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens,
      outputTokens: u.output_tokens,
      costoUsd: calcolaCostoUsd(model, u),
    });

    // Safety-net non bloccante: logga un possibile disallineamento numerico per
    // QA, senza mai alterare la risposta mostrata all'utente.
    for (const r of turno.dati) {
      if (typeof r.totale === 'number' && !turno.risposta.includes(String(r.totale))) {
        console.warn(
          `[assistenteHr] Possibile discrepanza numerica: tool=${r.tool} atteso=${r.totale} risposta="${turno.risposta}"`
        );
      }
    }

    const dati = turno.dati.length ? turno.dati : null;
    const salvato = await salvaTurno({
      conversazioneId,
      utenteId,
      domanda,
      risposta: turno.risposta,
      testoModello: turno.testoModello,
      persone: turno.persone,
      dati,
      scambio: turno.scambio,
      toolLog: turno.toolLog,
    });

    res.json({
      risposta: turno.risposta,
      dati,
      consumo: await getConsumo(utenteId),
      conversazione_id: salvato.conversazioneId,
      messaggio_id: salvato.messaggioId,
    });
  } catch (err) {
    const errore = classificaErrore(err);
    if (errore) {
      console.warn(`[assistenteHr] ${errore.error}`);
      return res.status(errore.status).json({ error: errore.error, message: errore.message });
    }
    console.error('POST /assistente-hr/chat', err);
    res.status(500).json({ error: 'Errore interno assistente HR' });
  } finally {
    richiesteInCorso.delete(chiave);
  }
});

module.exports = router;
