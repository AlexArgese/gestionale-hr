// backend/services/hrAssistant/agente.js
//
// Il ciclo domanda → tool → risposta di ClockAI, separato dalla route HTTP così
// lo usa anche lo script di regressione (scripts/evalAssistenteHr.js).
const { createMessage } = require('../anthropicClient');
const { definitions, handlers } = require('./tools');
const { vistaPerModello, personeDa, risolviSegnaposto } = require('./pseudonimi');

const MAX_ITERAZIONI = 6;
const MAX_TURNI_STORICO = 10;

const RISPOSTA_TROPPI_PASSAGGI =
  'La domanda richiede troppi passaggi per essere gestita automaticamente: prova a riformularla in modo più specifico.';
const RISPOSTA_RIFIUTO = 'Non posso rispondere a questa richiesta. Prova a riformularla.';
const RISPOSTA_VUOTA = 'Non sono riuscito a formulare una risposta.';

// Toglie i blocchi thinking dai turni passati. Haiku 5.5 rifiuta (400) un
// blocco thinking rimandato dopo una modifica a system, tool o messaggi
// precedenti, e il nostro system prompt cambia ogni giorno (contiene la data)
// e quando cambiano sedi o società; anche il taglio dello storico ai turni più
// recenti conta come modifica. Senza thinking dei turni passati il controllo
// non ha niente da verificare; i thinking del turno in corso restano intatti.
function senzaThinking(messaggio) {
  if (!Array.isArray(messaggio.content)) return messaggio;
  const content = messaggio.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
  return content.length ? { role: messaggio.role, content } : null;
}

// Ricostruisce i messaggi per il modello dai messaggi salvati: per ogni turno
// la domanda, lo scambio con i tool (se salvato) e la risposta finale. Così una
// domanda di seguito ("e ieri quante ore ha fatto?") ritrova l'utente_id già
// risolto invece di ripetere la ricerca. Della risposta si usa la versione con
// i segnaposto {{D:id}} (testo_modello), non quella con i nomi mostrata
// all'admin: i nomi non devono tornare al modello attraverso lo storico.
function costruisciStorico(messaggiSalvati) {
  const turni = [];
  for (const m of messaggiSalvati) {
    if (m.ruolo === 'user') {
      turni.push([{ role: 'user', content: m.testo }]);
    } else if (turni.length) {
      const turno = turni[turni.length - 1];
      for (const s of m.scambio || []) {
        const pulito = senzaThinking(s);
        if (pulito) turno.push(pulito);
      }
      turno.push({ role: 'assistant', content: m.testo_modello ?? m.testo });
    }
  }
  return turni.slice(-MAX_TURNI_STORICO).flat();
}

// Id → nome dei dipendenti già comparsi nella conversazione, per risolvere i
// segnaposto che il modello usa nelle domande di seguito.
function personeDaStorico(messaggiSalvati) {
  return Object.assign({}, ...messaggiSalvati.map((m) => m.persone || {}));
}

function riassuntoRisultato(result) {
  if (!result || typeof result !== 'object') return {};
  const righe = Object.values(result).find(Array.isArray);
  return {
    ...(typeof result.totale === 'number' ? { totale: result.totale } : {}),
    ...(righe ? { righe: righe.length } : {}),
  };
}

async function eseguiTool(block) {
  const inizio = Date.now();
  const handler = handlers[block.name];
  if (!handler) {
    const errore = `Tool sconosciuto: ${block.name}`;
    return { content: JSON.stringify({ error: errore }), isError: true, log: { ok: false, errore } };
  }
  try {
    const result = await handler(block.input || {});
    return {
      result,
      // Al modello va solo la vista pseudonimizzata, mai il risultato completo.
      content: JSON.stringify(vistaPerModello(block.name, result)),
      isError: false,
      log: { ok: true, ...riassuntoRisultato(result), durata_ms: Date.now() - inizio },
    };
  } catch (e) {
    const errore = e.message || 'Errore esecuzione tool';
    return {
      content: JSON.stringify({ error: errore }),
      isError: true,
      log: { ok: false, errore, durata_ms: Date.now() - inizio },
    };
  }
}

// Esegue un turno di conversazione. `personeNote` sono i dipendenti già
// comparsi nei turni precedenti (id → nome). Ritorna la risposta con i nomi
// (per l'admin) e con i segnaposto (per lo storico del modello), i risultati
// dei tool da mostrare, lo scambio da salvare, i dipendenti comparsi in questo
// turno, il log dei tool e i token usati.
async function eseguiTurno({ system, storico, domanda, personeNote = {} }) {
  const messages = [...storico, { role: 'user', content: domanda }];
  const inizioTurno = messages.length;

  const risultatiTool = [];
  const persone = {};
  const toolLog = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let response;
  let esito = 'ok';

  for (let iterazione = 1; iterazione <= MAX_ITERAZIONI; iterazione++) {
    response = await createMessage({ system, messages, tools: definitions });
    for (const k of Object.keys(usage)) usage[k] += response.usage?.[k] || 0;

    if (response.stop_reason !== 'tool_use') break;

    // I tool di uno stesso passaggio sono indipendenti: si eseguono in
    // parallelo e i risultati tornano tutti in un unico messaggio.
    const blocchi = response.content.filter((b) => b.type === 'tool_use');
    const esiti = await Promise.all(blocchi.map(eseguiTool));
    blocchi.forEach((block, i) => {
      const e = esiti[i];
      toolLog.push({ tool: block.name, input: block.input || {}, ...e.log });
      if (e.result) {
        risultatiTool.push({ tool: block.name, ...e.result });
        Object.assign(persone, personeDa(e.result));
      }
    });

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: blocchi.map((block, i) => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content: esiti[i].content,
        is_error: esiti[i].isError,
      })),
    });

    if (iterazione === MAX_ITERAZIONI) esito = 'troppi_passaggi';
  }

  // Scambio intermedio (tool_use + tool_result), senza la risposta finale:
  // quella viene salvata come testo.
  const scambio = messages.slice(inizioTurno);

  let testoModello;
  if (esito === 'troppi_passaggi') {
    testoModello = RISPOSTA_TROPPI_PASSAGGI;
  } else if (response.stop_reason === 'refusal') {
    esito = 'rifiuto';
    testoModello = RISPOSTA_RIFIUTO;
  } else {
    // Solo i blocchi `text`: la risposta può contenere anche blocchi `thinking`.
    testoModello =
      (response.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim() || RISPOSTA_VUOTA;
  }

  const { testo: risposta, sconosciuti } = risolviSegnaposto(testoModello, { ...personeNote, ...persone });
  if (sconosciuti.length) {
    console.warn(`[assistenteHr] Segnaposto con id non comparsi nei risultati: ${sconosciuti.join(', ')}`);
  }

  // La ricerca del dipendente serve solo a risolvere un nome in un id: se poi
  // è stato chiamato un altro tool, mostrare anche i candidati è rumore.
  const altriTool = risultatiTool.filter((r) => r.tool !== 'cerca_dipendente');
  const datiDaMostrare = esito === 'ok' ? (altriTool.length ? altriTool : risultatiTool) : [];

  return { esito, risposta, testoModello, dati: datiDaMostrare, scambio, persone, toolLog, usage, sconosciuti };
}

module.exports = { eseguiTurno, costruisciStorico, personeDaStorico };
