// backend/scripts/evalAssistenteHr.js
//
// Test di regressione di ClockAI: un insieme di domande con il tool e i
// parametri che il modello dovrebbe scegliere. Va lanciato a mano dopo ogni
// modifica a prompt, tool o modello:
//
//   cd backend && node scripts/evalAssistenteHr.js            (tutte)
//   cd backend && node scripts/evalAssistenteHr.js ore        (solo quelle che contengono "ore")
//
// Fa chiamate reali a Claude (circa 2–4 centesimi di dollaro a giro, non
// conteggiati nel budget dell'assistente) e solo SELECT sul database, quindi
// può usare un utente Postgres in sola lettura. Non sta in backend/test perché
// `node --test backend/test` lo eseguirebbe a ogni test. In GitHub parte da
// solo quando cambiano i file di ClockAI (.github/workflows/clockai.yml).
//
// Non controlla il testo della risposta, solo la scelta dei tool: è la parte
// in cui il modello può sbagliare, mentre i numeri arrivano dalle query.
require('dotenv').config({ quiet: true });
process.env.TZ = process.env.TZ || 'Europe/Rome';

const pool = require('../db');
const { model } = require('../services/anthropicClient');
const { buildSystemPrompt } = require('../services/hrAssistant/systemPrompt');
const { eseguiTurno, costruisciStorico, personeDaStorico } = require('../services/hrAssistant/agente');
const { handlers } = require('../services/hrAssistant/tools');
const { calcolaCostoUsd } = require('../services/hrAssistant/pricing');
const { oggiRoma } = require('../services/hrAssistant/dateUtils');

const PARALLELISMO = 4;

function spostaGiorni(data, giorni) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

function ultimoDelMese(data) {
  const d = new Date(`${data.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// Un dipendente reale con nome univoco, scelto a runtime: così nel repository
// non finiscono nomi di persone.
async function scegliDipendente() {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.cognome
       FROM utenti u
      WHERE COALESCE(u.archiviato, false) = false AND u.stato_attivo
        AND u.cognome IS NOT NULL AND u.societa_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM presenze p WHERE p.utente_id = u.id AND p.data >= $1::date - 7)
      ORDER BY u.id
      LIMIT 20`,
    [oggiRoma()]
  );
  for (const u of rows) {
    const r = await handlers.cerca_dipendente({ nome_query: `${u.nome} ${u.cognome}` });
    if (r.totale_trovati === 1) return u;
  }
  throw new Error('Nessun dipendente con nome univoco e presenze recenti per i casi di test');
}

function casi({ dip, oggi, ieri }) {
  const DIP = `${dip.nome} ${dip.cognome}`;
  const DIP_INVERTITO = `${dip.cognome} ${dip.nome}`;
  const ID = dip.id;
  const inizioMese = `${oggi.slice(0, 7)}-01`;
  const PARK_HOTEL = ['MANUTENZIONE PARK HOTEL', 'PARK HOTEL HOUSE KEEP', 'RICEVIMENTO PARK HOTEL', 'RISTORAZIONE PARK HOTEL'];

  // atteso: { tool, args, extraOk } → almeno una chiamata riuscita a `tool`
  //   con esattamente quei parametri (un array = uno qualsiasi dei valori,
  //   undefined = parametro assente); con extraOk sono ammessi altri parametri.
  // atteso: { nessunDato: true } → nessun tool di dati riuscito (il modello
  //   deve chiedere chiarimenti o dire che non può rispondere).
  // atteso: { oppure: [...] } → basta uno dei casi.
  // turni: domande precedenti nella stessa conversazione.
  // senzaRicerca: nell'ultimo turno non deve rifare cerca_dipendente.
  // citaDipendenti: la risposta deve contenere almeno un nome (segnaposto
  //   {{D:id}} risolto dal server).
  // Ogni caso fallisce anche se nei dati inviati al modello compaiono nomi,
  // email o codici fiscali, o se nella risposta restano segnaposto.
  return [
    // Conteggi
    { domanda: 'Quanti dipendenti attivi abbiamo?', atteso: { tool: 'conta_dipendenti', args: {} } },
    { domanda: 'Quanti dipendenti ha Leo 3000?', atteso: { tool: 'conta_dipendenti', args: { societa_id: 1 } } },
    { domanda: 'Quanti dipendenti ci sono in Fastasy?', atteso: { tool: 'conta_dipendenti', args: { societa_id: 2 } } },
    { domanda: "Quante persone lavorano all'Aquapark Egnazia?", atteso: { tool: 'conta_dipendenti', args: { sede: 'AQUAPARK EGNAZIA' }, extraOk: true } },
    { domanda: 'Quanti dipendenti ha la sede di Fasanolandia?', atteso: { tool: 'conta_dipendenti', args: { sede: 'FASANOLANDIA' }, extraOk: true } },
    { domanda: 'Quanti full time abbiamo?', atteso: { tool: 'conta_dipendenti', args: { tipo_contratto: 'full_time' } } },
    { domanda: 'Quanti contratti a chiamata ci sono in Leo 3000?', atteso: { tool: 'conta_dipendenti', args: { tipo_contratto: 'chiamata_6', societa_id: 1 } } },
    { domanda: 'Quanti part time da 4 ore ci sono?', atteso: { tool: 'conta_dipendenti', args: { tipo_contratto: 'part_time_4' } } },

    // Presenze
    { domanda: 'Chi non ha timbrato oggi?', atteso: { tool: 'chi_non_ha_timbrato', args: { data: [undefined, oggi] } } },
    { domanda: 'Chi ha timbrato ieri?', atteso: { tool: 'chi_ha_timbrato', args: { data: ieri } } },
    { domanda: 'Chi non ha timbrato ieri alla Masseria Pedali?', atteso: { tool: 'chi_non_ha_timbrato', args: { data: ieri, sede: 'MASSERIA PEDALI' }, extraOk: true } },
    { domanda: 'Quanti hanno timbrato oggi allo Zoosafari Parco?', atteso: { tool: 'chi_ha_timbrato', args: { data: [undefined, oggi], sede: 'ZOOSAFARI PARCO' }, extraOk: true } },
    { domanda: 'Chi è presente oggi in Fastasy?', atteso: { tool: 'chi_ha_timbrato', args: { data: [undefined, oggi], societa_id: 2 } } },

    // Documenti
    { domanda: 'Quanti documenti devono ancora essere firmati?', atteso: { tool: 'documenti_da_firmare', args: {} } },
    { domanda: 'Quanti dipendenti di Leo 3000 non hanno firmato il modulo privacy?', atteso: { tool: 'documenti_da_firmare', args: { societa_id: 1, tipo_documento_contains: 'privacy' } } },
    { domanda: 'Ci sono contratti da firmare al Teatro Fantasy?', atteso: { tool: 'documenti_da_firmare', args: { sede: 'TEATRO FANTASY', tipo_documento_contains: 'contratto' }, extraOk: true } },
    { domanda: 'Quali documenti sono scaduti?', atteso: { tool: 'documenti_scaduti', args: { entro_giorni: [undefined, 0] } } },
    { domanda: 'Quali documenti scadono nei prossimi 30 giorni?', atteso: { tool: 'documenti_scaduti', args: { entro_giorni: 30 } } },
    { domanda: 'Documenti in scadenza entro una settimana a Fasanolandia', atteso: { tool: 'documenti_scaduti', args: { entro_giorni: 7, sede: 'FASANOLANDIA' }, extraOk: true } },

    // Singolo dipendente
    { domanda: `Quante ore ha lavorato ${DIP} ieri?`, atteso: { tool: 'ore_lavorate', args: { utente_id: ID, data_inizio: ieri, data_fine: ieri } } },
    { domanda: `A che ora è entrato ${DIP} oggi?`, atteso: { tool: 'ore_lavorate', args: { utente_id: ID, data_inizio: oggi, data_fine: oggi } } },
    { domanda: `Che contratto ha ${DIP}?`, atteso: { tool: 'dettaglio_dipendente', args: { utente_id: ID } } },
    { domanda: `${DIP} ha documenti da firmare?`, atteso: { tool: 'documenti_da_firmare', args: { utente_id: ID } } },
    { domanda: `Quante ore ha fatto ${DIP_INVERTITO.toLowerCase()} questo mese?`, atteso: { tool: 'ore_lavorate', args: { utente_id: ID, data_inizio: inizioMese, data_fine: [oggi, ultimoDelMese(oggi)] } } },

    // Elenchi con nomi: i nomi arrivano dal server, non dal modello
    {
      domanda: 'Chi ha timbrato ieri alla Masseria Pedali? Dimmi i nomi.',
      atteso: { tool: 'chi_ha_timbrato', args: { data: ieri, sede: 'MASSERIA PEDALI' }, extraOk: true },
      citaDipendenti: true,
    },
    {
      domanda: 'Elencami i dipendenti di Fastasy che hanno documenti da firmare',
      atteso: { tool: 'documenti_da_firmare', args: { societa_id: 2 }, extraOk: true },
      citaDipendenti: true,
    },

    // Chiarimenti e domande fuori ambito
    {
      domanda: 'Quanti dipendenti ci sono al Park Hotel?',
      atteso: { oppure: [{ nessunDato: true }, { tool: 'conta_dipendenti', args: { sede: PARK_HOTEL }, extraOk: true }] },
    },
    { domanda: 'Quanti dipendenti ci sono a Milano?', atteso: { nessunDato: true } },
    { domanda: "Qual è lo stipendio medio dell'azienda?", atteso: { nessunDato: true } },
    { domanda: `Quanti giorni di ferie restano a ${DIP}?`, atteso: { nessunDato: true } },
    { domanda: 'Quante ore ha lavorato ieri Zebedeo Inesistentissimo?', atteso: { nessunDato: true } },

    // Domande di seguito (usano lo storico)
    {
      turni: [`Quante ore ha lavorato ${DIP} ieri?`],
      domanda: 'E oggi?',
      atteso: { tool: 'ore_lavorate', args: { utente_id: ID, data_inizio: oggi, data_fine: oggi } },
      senzaRicerca: true,
    },
    { turni: ['Quanti dipendenti ha Leo 3000?'], domanda: 'E Fastasy?', atteso: { tool: 'conta_dipendenti', args: { societa_id: 2 } } },
    {
      turni: ["Chi non ha timbrato oggi all'Aquapark Egnazia?"],
      domanda: 'E ieri?',
      atteso: { tool: 'chi_non_ha_timbrato', args: { sede: 'AQUAPARK EGNAZIA', data: ieri }, extraOk: true },
    },
  ];
}

function valoreUguale(atteso, reale) {
  if (atteso === undefined) return reale === undefined;
  if (typeof atteso === 'string' && typeof reale === 'string') {
    return atteso.trim().toLowerCase() === reale.trim().toLowerCase();
  }
  return Number.isFinite(Number(atteso)) && Number(atteso) === Number(reale);
}

function chiamataCorrisponde(atteso, chiamata) {
  if (!chiamata.ok || chiamata.tool !== atteso.tool) return false;
  const input = chiamata.input || {};
  for (const [k, v] of Object.entries(atteso.args)) {
    const ammessi = Array.isArray(v) ? v : [v];
    if (!ammessi.some((a) => valoreUguale(a, input[k]))) return false;
  }
  if (!atteso.extraOk) {
    const extra = Object.keys(input).filter((k) => !(k in atteso.args) && input[k] != null);
    if (extra.length) return false;
  }
  return true;
}

function valuta(atteso, toolLog) {
  if (atteso.oppure) return atteso.oppure.some((a) => valuta(a, toolLog));
  if (atteso.nessunDato) return !toolLog.some((c) => c.ok && c.tool !== 'cerca_dipendente');
  return toolLog.some((c) => chiamataCorrisponde(atteso, c));
}

const CF_RE = /[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]/i;
const EMAIL_RE = /[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i;

// Privacy: nei tool_result mandati al modello non devono comparire nomi,
// email o codici fiscali; nella risposta non devono restare segnaposto.
function problemiPrivacy(turno, personeConversazione) {
  const problemi = [];
  const risultatiAlModello = turno.scambio
    .filter((m) => m.role === 'user' && Array.isArray(m.content))
    .flatMap((m) => m.content.filter((b) => b.type === 'tool_result').map((b) => String(b.content)))
    .join('\n');
  for (const nome of Object.values(personeConversazione)) {
    if (nome.length > 3 && risultatiAlModello.toLowerCase().includes(nome.toLowerCase())) {
      problemi.push('nome di un dipendente nei risultati inviati al modello');
      break;
    }
  }
  if (EMAIL_RE.test(risultatiAlModello)) problemi.push('email nei risultati inviati al modello');
  if (CF_RE.test(risultatiAlModello)) problemi.push('codice fiscale nei risultati inviati al modello');
  if (/\{\{D:\d+\}\}/.test(turno.risposta)) problemi.push('segnaposto non risolto nella risposta');
  if (turno.sconosciuti.length) problemi.push(`id inventati nella risposta: ${turno.sconosciuti.join(', ')}`);
  return problemi;
}

async function eseguiCaso(caso, system) {
  const usage = {};
  const somma = (u) => {
    for (const [k, v] of Object.entries(u)) usage[k] = (usage[k] || 0) + v;
  };

  // I turni precedenti passano dallo stesso salvataggio/ricostruzione della
  // route, così si verificano anche costruisciStorico e personeDaStorico.
  const salvati = [];
  const privacy = [];
  for (const domanda of caso.turni || []) {
    const t = await eseguiTurno({ system, storico: costruisciStorico(salvati), domanda, personeNote: personeDaStorico(salvati) });
    somma(t.usage);
    privacy.push(...problemiPrivacy(t, { ...personeDaStorico(salvati), ...t.persone }));
    salvati.push(
      { ruolo: 'user', testo: domanda },
      { ruolo: 'assistant', testo: t.risposta, testo_modello: t.testoModello, persone: t.persone, scambio: t.scambio }
    );
  }
  const t = await eseguiTurno({
    system,
    storico: costruisciStorico(salvati),
    domanda: caso.domanda,
    personeNote: personeDaStorico(salvati),
  });
  somma(t.usage);
  privacy.push(...problemiPrivacy(t, { ...personeDaStorico(salvati), ...t.persone }));

  let ok = valuta(caso.atteso, t.toolLog) && !privacy.length;
  if (ok && caso.senzaRicerca && t.toolLog.some((c) => c.tool === 'cerca_dipendente')) ok = false;
  if (ok && caso.citaDipendenti && !Object.values({ ...t.persone }).some((n) => t.risposta.includes(n))) ok = false;
  return { ok, privacy, toolLog: t.toolLog, risposta: t.risposta, esito: t.esito, costo: calcolaCostoUsd(model, usage) };
}

(async () => {
  const filtro = (process.argv[2] || '').toLowerCase();
  const oggi = oggiRoma();
  const dip = await scegliDipendente();
  const system = await buildSystemPrompt();
  const elenco = casi({ dip, oggi, ieri: spostaGiorni(oggi, -1) }).filter(
    (c) => !filtro || [...(c.turni || []), c.domanda].join(' ').toLowerCase().includes(filtro)
  );

  console.log(`Modello ${model} — ${elenco.length} casi (dipendente di prova: id ${dip.id})\n`);

  async function esegui(indici) {
    const coda = [...indici];
    await Promise.all(
      Array.from({ length: PARALLELISMO }, async () => {
        while (coda.length) {
          const i = coda.shift();
          const costoPrima = risultati[i]?.costo || 0;
          try {
            risultati[i] = await eseguiCaso(elenco[i], system);
          } catch (e) {
            risultati[i] = { ok: false, errore: e.message, toolLog: [], costo: 0 };
          }
          risultati[i].costo += costoPrima;
        }
      })
    );
  }

  const risultati = new Array(elenco.length);
  await esegui(elenco.map((_, i) => i));

  // Le risposte del modello non sono del tutto deterministiche: un caso fallito
  // si riprova una volta. Se passa al secondo tentativo conta come passato ma
  // viene segnalato come instabile (da guardare se ricapita).
  const falliti = elenco.map((_, i) => i).filter((i) => !risultati[i].ok);
  if (falliti.length) {
    await esegui(falliti);
    for (const i of falliti) if (risultati[i].ok) risultati[i].instabile = true;
  }

  // Nell'output il nome del dipendente di prova è sostituito da un segnaposto.
  const nomi = [`${dip.nome} ${dip.cognome}`, `${dip.cognome} ${dip.nome}`];
  const anonimo = (s) =>
    nomi.reduce((t, n) => t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[dipendente]'), s);

  let passati = 0;
  let costo = 0;
  elenco.forEach((caso, i) => {
    const r = risultati[i];
    costo += r.costo;
    if (r.ok) passati++;
    const chiamate = r.toolLog.map((c) => `${c.tool}(${JSON.stringify(c.input)})${c.ok ? '' : ' ✗'}`).join(' → ') || 'nessun tool';
    const domanda = [...(caso.turni || []), caso.domanda].join(' ⟶ ');
    console.log(`${r.ok ? (r.instabile ? 'PASS*' : 'PASS ') : 'FAIL '} ${anonimo(domanda)}`);
    if (!r.ok) {
      console.log(`      chiamate: ${anonimo(chiamate)}`);
      console.log(`      atteso:   ${JSON.stringify(caso.atteso)}`);
      if (r.privacy?.length) console.log(`      privacy:  ${r.privacy.join('; ')}`);
      if (r.errore) console.log(`      errore:   ${r.errore}`);
      else console.log(`      risposta: ${anonimo(String(r.risposta).replace(/\s+/g, ' ').slice(0, 200))}`);
    }
  });

  const instabili = risultati.filter((r) => r.instabile).length;
  console.log(
    `\n${passati}/${elenco.length} passati${instabili ? ` (${instabili} solo al secondo tentativo, segnati con *)` : ''} — costo ${costo.toFixed(4)} USD`
  );
  await pool.end();
  process.exit(passati === elenco.length ? 0 : 1);
})().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
