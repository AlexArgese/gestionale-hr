// backend/services/hrAssistant/pseudonimi.js
//
// Pseudonimizzazione e minimizzazione dei dati che escono verso il modello.
//
// I tool restituiscono i dati completi (servono per le tabelle mostrate
// all'admin), ma al modello va solo una "vista" ridotta: niente nomi, cognomi,
// email o nomi di file (che a volte contengono il codice fiscale). Ogni
// dipendente è indicato dal suo id interno; per citarlo nella risposta il
// modello scrive {{D:id}} e il server sostituisce il segnaposto con nome e
// cognome prima di mostrare la risposta (GDPR artt. 5 e 25: minimizzazione e
// privacy fin dalla progettazione).
//
// Ogni nuovo tool DEVE avere qui la sua vista: senza, il risultato non viene
// mandato al modello (vedi vistaPerModello).

const SEGNAPOSTO_RE = /\{\{D:(\d+)\}\}/g;

function nomeCompleto(p) {
  return [p.nome, p.cognome].filter(Boolean).join(' ').trim();
}

function documentoPerModello(d) {
  return {
    id: d.id,
    tipo_documento: d.tipo_documento,
    ...(d.data_upload !== undefined ? { data_upload: d.data_upload } : {}),
    data_scadenza: d.data_scadenza,
    ...(d.yousign_status !== undefined ? { stato_firma: d.yousign_status } : {}),
    dipendente: `D:${d.utente_id}`,
    societa: d.societa,
  };
}

// Vista per il modello di ogni tool: solo i campi che servono a rispondere.
const VISTE = {
  cerca_dipendente: (r) => ({
    totale_trovati: r.totale_trovati,
    candidati: r.candidati.map((c) => ({
      dipendente: `D:${c.id}`,
      corrispondenza_esatta: c.corrispondenza_esatta,
      sede: c.sede,
      societa: c.societa,
      attivo: c.stato_attivo,
    })),
  }),
  conta_dipendenti: (r) => ({ totale: r.totale }),
  dettaglio_dipendente: (r) =>
    r.trovato
      ? {
          trovato: true,
          dipendente: {
            dipendente: `D:${r.dipendente.id}`,
            ruolo: r.dipendente.ruolo,
            sede: r.dipendente.sede,
            tipo_contratto: r.dipendente.tipo_contratto,
            attivo: r.dipendente.stato_attivo,
            societa: r.dipendente.societa,
          },
        }
      : { trovato: false },
  documenti_da_firmare: (r) => ({ totale: r.totale, documenti: r.documenti.map(documentoPerModello) }),
  documenti_scaduti: (r) => ({ totale: r.totale, documenti: r.documenti.map(documentoPerModello) }),
  chi_ha_timbrato: (r) => ({
    data: r.data,
    totale: r.totale,
    dipendenti: r.dipendenti.map((d) => ({ dipendente: `D:${d.id}`, societa: d.societa })),
  }),
  chi_non_ha_timbrato: (r) => ({
    data: r.data,
    totale: r.totale,
    dipendenti: r.dipendenti.map((d) => ({ dipendente: `D:${d.id}`, societa: d.societa })),
  }),
  // Già senza nomi: solo id, date e orari.
  ore_lavorate: (r) => ({ ...r, dipendente: `D:${r.utente_id}` }),
};

function vistaPerModello(tool, risultato) {
  const vista = VISTE[tool];
  if (!vista) {
    // Meglio un errore visibile che mandare fuori dati non filtrati.
    throw new Error(`Nessuna vista privacy definita per il tool ${tool}`);
  }
  return vista(risultato);
}

// Id → "Nome Cognome" dei dipendenti presenti nel risultato di un tool:
// servono per sostituire i segnaposto nella risposta.
function personeDa(risultato) {
  const persone = {};
  const aggiungi = (id, p) => {
    const nome = nomeCompleto(p);
    if (id != null && nome) persone[id] = nome;
  };
  for (const c of risultato?.candidati || []) aggiungi(c.id, c);
  if (risultato?.dipendente) aggiungi(risultato.dipendente.id, risultato.dipendente);
  for (const d of risultato?.dipendenti || []) aggiungi(d.id, d);
  for (const d of risultato?.documenti || []) aggiungi(d.utente_id, d);
  return persone;
}

// Sostituisce {{D:id}} con il nome. Si risolvono solo gli id comparsi nei
// risultati dei tool di questa conversazione: un id inventato dal modello non
// deve diventare il nome di un dipendente qualsiasi.
function risolviSegnaposto(testo, persone) {
  const sconosciuti = [];
  const risolto = testo.replace(SEGNAPOSTO_RE, (_, id) => {
    if (persone[id]) return persone[id];
    sconosciuti.push(id);
    return '[dipendente non identificato]';
  });
  return { testo: risolto, sconosciuti };
}

module.exports = { vistaPerModello, personeDa, risolviSegnaposto };
