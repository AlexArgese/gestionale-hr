// backend/services/hrAssistant/tools.js
//
// Whitelist di funzioni che l'assistente HR può chiamare. Ogni handler esegue
// UNA query Postgres fissa e parametrizzata: nessuna stringa SQL viene mai
// costruita concatenando input dell'utente o del modello. I frammenti WHERE
// opzionali sono scelti da un piccolo insieme noto a priori in base a quali
// argomenti sono presenti — mai testo libero nel WHERE.
const pool = require('../../db');
const { YOUSIGN_STATI_CONCLUSI, MINUTI_PER_TIPO_CONTRATTO, FILTRO_UTENTE_ATTIVO } = require('./sqlConstants');
const { oggiRoma } = require('./dateUtils');

const TIPI_CONTRATTO_VALIDI = Object.keys(MINUTI_PER_TIPO_CONTRATTO);
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeLike(s) {
  return String(s).replace(/[%_\\]/g, (c) => `\\${c}`);
}

// Minuscolo e senza accenti, lato JS e lato SQL (senza dipendere da estensioni
// Postgres come unaccent): "Nicolò" e "nicolo" devono coincidere.
function normalizzaTesto(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function sqlNormalizza(expr) {
  return `translate(lower(${expr}), 'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;
}

// La sede va indicata con il nome esatto (case-insensitive) di una riga di
// `sedi`: un match parziale farebbe rientrare "Roma Nord" e "Roma EUR" in "Roma".
// Se il nome non è esatto, l'errore elenca le sedi simili così il modello può
// chiedere all'utente quale intende invece di indovinare.
async function risolviSede(sede) {
  const nome = String(sede).trim();
  const { rows } = await pool.query(
    `SELECT DISTINCT nome FROM sedi WHERE LOWER(TRIM(nome)) = LOWER($1)`,
    [nome]
  );
  if (rows.length) return rows[0].nome;
  const { rows: simili } = await pool.query(
    `SELECT DISTINCT nome FROM sedi WHERE nome ILIKE $1 ESCAPE '\\' ORDER BY nome LIMIT 10`,
    [`%${escapeLike(nome)}%`]
  );
  if (simili.length) {
    throw new Error(
      `Sede "${nome}" non trovata con nome esatto. Sedi simili: ${simili.map((s) => s.nome).join(', ')}. Chiedi all'utente quale intende.`
    );
  }
  throw new Error(`Sede "${nome}" non trovata.`);
}

// utenti.sede può contenere più sedi separate da virgola (es. "AQUAPARK EGNAZIA,
// ZOOSAFARI PARCO"): il dipendente rientra se una qualsiasi delle sue sedi
// coincide esattamente con quella richiesta.
async function aggiungiFiltroSede(sede, where, params) {
  if (!sede) return;
  params.push(await risolviSede(sede));
  where.push(
    `LOWER(TRIM($${params.length})) = ANY (SELECT LOWER(TRIM(x)) FROM unnest(string_to_array(u.sede, ',')) AS x)`
  );
}

function assertData(v, campo) {
  if (!DATA_RE.test(v)) throw new Error(`${campo} deve essere in formato YYYY-MM-DD`);
  return v;
}

function assertInt(v, campo) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`${campo} non valido`);
  return n;
}

/* ==================================================================== */
/*  Definizioni (schema JSON per Anthropic tool-calling)                */
/* ==================================================================== */
const definitions = [
  {
    name: 'cerca_dipendente',
    description:
      "Cerca dipendenti per nome/cognome/email (l'ordine delle parole e gli accenti non contano: 'Rossi Mario' trova 'Mario Rossi'). Usa questo tool per risolvere un nome menzionato dall'utente in un utente_id prima di chiamare altri tool. Se torna più di un risultato, elenca i candidati e chiedi conferma invece di sceglierne uno a caso. Se torna 0 risultati, dichiaralo esplicitamente.",
    input_schema: {
      type: 'object',
      properties: {
        nome_query: { type: 'string', description: 'Testo da cercare in nome, cognome o email (min 2 caratteri)' },
        societa_id: { type: 'integer', description: 'Filtra per società (opzionale)' },
      },
      required: ['nome_query'],
    },
  },
  {
    name: 'conta_dipendenti',
    description: "Conta i dipendenti attivi, con filtri opzionali per società, sede o tipo contratto.",
    input_schema: {
      type: 'object',
      properties: {
        societa_id: { type: 'integer' },
        sede: { type: 'string', description: 'Nome esatto della sede, come nell\'elenco sedi del prompt' },
        tipo_contratto: { type: 'string', enum: TIPI_CONTRATTO_VALIDI },
      },
    },
  },
  {
    name: 'dettaglio_dipendente',
    description: 'Ritorna i dati anagrafici essenziali di un dipendente dato il suo utente_id (risolvi prima il nome con cerca_dipendente).',
    input_schema: {
      type: 'object',
      properties: { utente_id: { type: 'integer' } },
      required: ['utente_id'],
    },
  },
  {
    name: 'documenti_da_firmare',
    description:
      "Conta ed elenca i documenti di dipendenti attivi che richiedono firma e non sono ancora stati firmati. Per cercare un tipo di documento specifico (es. 'privacy'), usa tipo_documento_contains: alcuni documenti hanno il termine cercato nel titolo del file più che nel campo tipo_documento, quindi la ricerca copre entrambi.",
    input_schema: {
      type: 'object',
      properties: {
        societa_id: { type: 'integer' },
        sede: { type: 'string', description: 'Nome esatto della sede, come nell\'elenco sedi del prompt' },
        utente_id: { type: 'integer' },
        tipo_documento_contains: { type: 'string', description: "Parola chiave da cercare nel tipo documento o nel titolo del file, es. 'privacy'" },
      },
    },
  },
  {
    name: 'documenti_scaduti',
    description: 'Conta ed elenca i documenti di dipendenti attivi con data di scadenza superata (o in scadenza entro N giorni).',
    input_schema: {
      type: 'object',
      properties: {
        societa_id: { type: 'integer' },
        sede: { type: 'string', description: 'Nome esatto della sede, come nell\'elenco sedi del prompt' },
        entro_giorni: { type: 'integer', description: 'Se presente, include anche i documenti che scadranno entro questi giorni da oggi (0 = solo già scaduti)' },
      },
    },
  },
  {
    name: 'chi_ha_timbrato',
    description: 'Elenca i dipendenti attivi che hanno almeno una timbratura registrata in una certa data (default oggi).',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'YYYY-MM-DD, default oggi' },
        societa_id: { type: 'integer' },
        sede: { type: 'string', description: 'Nome esatto della sede, come nell\'elenco sedi del prompt' },
      },
    },
  },
  {
    name: 'chi_non_ha_timbrato',
    description:
      "Elenca i dipendenti attivi che non hanno nessuna timbratura registrata in una certa data (default oggi). Nota: include anche eventuali assenze giustificate (ferie/malattia), perché il sistema non ha una tabella ferie/assenze separata — dillo esplicitamente nella risposta.",
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'YYYY-MM-DD, default oggi' },
        societa_id: { type: 'integer' },
        sede: { type: 'string', description: 'Nome esatto della sede, come nell\'elenco sedi del prompt' },
      },
    },
  },
  {
    name: 'ore_lavorate',
    description:
      "Calcola le ore lavorate da un dipendente in un intervallo di date, con il dettaglio di ogni turno (ora di entrata e di uscita) giorno per giorno, più il totale ore. Usa questo tool anche per rispondere a domande su 'a che ora è entrato/uscito' — per un solo giorno passa la stessa data sia in data_inizio che data_fine. I turni senza uscita registrata sono di due tipi: quelli di oggi sono 'in corso' e le loro ore sono contate fino ad ora; quelli dei giorni passati sono 'non chiusi' (uscita dimenticata), NON sono inclusi nel totale ore e vanno segnalati esplicitamente all'utente.",
    input_schema: {
      type: 'object',
      properties: {
        utente_id: { type: 'integer' },
        data_inizio: { type: 'string', description: 'YYYY-MM-DD' },
        data_fine: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['utente_id', 'data_inizio', 'data_fine'],
    },
  },
];

/* ==================================================================== */
/*  Handlers                                                             */
/* ==================================================================== */

async function cerca_dipendente({ nome_query, societa_id }) {
  if (!nome_query || nome_query.trim().length < 2) {
    throw new Error('nome_query deve avere almeno 2 caratteri');
  }
  // Ogni parola deve comparire da qualche parte in nome/cognome/email, in
  // qualsiasi ordine. concat_ws ignora i NULL (cognome è nullable: con || un
  // cognome NULL rendeva NULL l'intera stringa e il dipendente introvabile).
  const parole = normalizzaTesto(nome_query).split(/\s+/).filter(Boolean).slice(0, 5);
  const campo = sqlNormalizza(`concat_ws(' ', u.nome, u.cognome, u.email)`);
  const where = ['COALESCE(u.archiviato, false) = false'];
  const params = [];
  for (const parola of parole) {
    params.push(`%${escapeLike(parola)}%`);
    where.push(`${campo} ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (societa_id != null) {
    params.push(assertInt(societa_id, 'societa_id'));
    where.push(`u.societa_id = $${params.length}`);
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.cognome, u.email, u.sede, u.stato_attivo, s.ragione_sociale AS societa
       FROM utenti u
       LEFT JOIN societa s ON s.id = u.societa_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.cognome, u.nome
      LIMIT 15`,
    params
  );
  // Il modello non vede i nomi (vedi pseudonimi.js), quindi gli diciamo noi se
  // un candidato corrisponde esattamente al testo cercato: "Mario Rossi" trova
  // anche "Mario Rossini", ma solo il primo ha tutte le parole identiche.
  const cercate = [...new Set(parole)].sort().join(' ');
  const candidati = rows.map((r) => {
    const parolePersona = [...new Set(normalizzaTesto(`${r.nome} ${r.cognome || ''}`).split(/\s+/).filter(Boolean))]
      .sort()
      .join(' ');
    const esatta = parolePersona === cercate || normalizzaTesto(r.email || '') === parole.join(' ');
    return { ...r, corrispondenza_esatta: esatta };
  });
  return { candidati, totale_trovati: candidati.length };
}

async function conta_dipendenti({ societa_id, sede, tipo_contratto }) {
  const where = [FILTRO_UTENTE_ATTIVO];
  const params = [];
  if (societa_id != null) {
    params.push(assertInt(societa_id, 'societa_id'));
    where.push(`u.societa_id = $${params.length}`);
  }
  await aggiungiFiltroSede(sede, where, params);
  if (tipo_contratto) {
    if (!TIPI_CONTRATTO_VALIDI.includes(tipo_contratto)) throw new Error('tipo_contratto non valido');
    params.push(tipo_contratto);
    where.push(`u.tipo_contratto = $${params.length}`);
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS totale FROM utenti u WHERE ${where.join(' AND ')}`,
    params
  );
  return { totale: rows[0].totale };
}

async function dettaglio_dipendente({ utente_id }) {
  const id = assertInt(utente_id, 'utente_id');
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.cognome, u.email, u.ruolo, u.sede, u.tipo_contratto,
            u.stato_attivo, s.ragione_sociale AS societa
       FROM utenti u
       LEFT JOIN societa s ON s.id = u.societa_id
      WHERE u.id = $1`,
    [id]
  );
  if (!rows.length) return { trovato: false };
  return { trovato: true, dipendente: rows[0] };
}

async function documenti_da_firmare({ societa_id, sede, utente_id, tipo_documento_contains }) {
  const where = [
    'd.require_signature = true',
    `COALESCE(d.yousign_status, '') <> ALL($1::text[])`,
    FILTRO_UTENTE_ATTIVO,
  ];
  const params = [YOUSIGN_STATI_CONCLUSI];
  if (societa_id != null) {
    params.push(assertInt(societa_id, 'societa_id'));
    where.push(`u.societa_id = $${params.length}`);
  }
  await aggiungiFiltroSede(sede, where, params);
  if (utente_id != null) {
    params.push(assertInt(utente_id, 'utente_id'));
    where.push(`u.id = $${params.length}`);
  }
  if (tipo_documento_contains) {
    params.push(`%${escapeLike(tipo_documento_contains)}%`);
    where.push(`(d.tipo_documento || ' ' || d.nome_file || ' ' || COALESCE(d.nome_file_base,'')) ILIKE $${params.length} ESCAPE '\\'`);
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*) OVER() AS totale, d.id, d.tipo_documento, d.nome_file, d.data_upload,
            d.data_scadenza, d.yousign_status, u.id AS utente_id, u.nome, u.cognome,
            s.ragione_sociale AS societa
       FROM documenti d
       JOIN utenti u ON u.id = d.utente_id
       LEFT JOIN societa s ON s.id = u.societa_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.data_upload DESC
      LIMIT 50`,
    params
  );
  const totale = rows.length ? Number(rows[0].totale) : 0;
  return {
    totale,
    documenti: rows.map(({ totale: _t, data_upload, data_scadenza, ...r }) => ({
      ...r,
      data_upload: formatData(data_upload),
      data_scadenza: data_scadenza ? formatData(data_scadenza) : null,
    })),
  };
}

async function documenti_scaduti({ societa_id, sede, entro_giorni }) {
  // "Oggi" passato come parametro (fuso di Roma) invece di CURRENT_DATE, che
  // dipende dal fuso del server Postgres.
  const where = ['d.data_scadenza IS NOT NULL', FILTRO_UTENTE_ATTIVO];
  const params = [oggiRoma()];
  if (entro_giorni != null) {
    const giorni = assertInt(entro_giorni, 'entro_giorni');
    if (giorni < 0 || giorni > 365) throw new Error('entro_giorni deve essere tra 0 e 365');
    params.push(giorni);
    where.push(`d.data_scadenza < $1::date + make_interval(days => $${params.length}::int)`);
  } else {
    where.push('d.data_scadenza < $1::date');
  }
  if (societa_id != null) {
    params.push(assertInt(societa_id, 'societa_id'));
    where.push(`u.societa_id = $${params.length}`);
  }
  await aggiungiFiltroSede(sede, where, params);
  const { rows } = await pool.query(
    `SELECT COUNT(*) OVER() AS totale, d.id, d.tipo_documento, d.nome_file, d.data_scadenza,
            u.id AS utente_id, u.nome, u.cognome, s.ragione_sociale AS societa
       FROM documenti d
       JOIN utenti u ON u.id = d.utente_id
       LEFT JOIN societa s ON s.id = u.societa_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.data_scadenza ASC
      LIMIT 50`,
    params
  );
  const totale = rows.length ? Number(rows[0].totale) : 0;
  return {
    totale,
    documenti: rows.map(({ totale: _t, data_scadenza, ...r }) => ({ ...r, data_scadenza: formatData(data_scadenza) })),
  };
}

async function queryTimbrature(presente, { data, societa_id, sede }) {
  const dataQuery = data ? assertData(data, 'data') : oggiRoma();
  const condizione = presente
    ? 'EXISTS (SELECT 1 FROM presenze p WHERE p.utente_id = u.id AND p.data = $1)'
    : 'NOT EXISTS (SELECT 1 FROM presenze p WHERE p.utente_id = u.id AND p.data = $1)';
  const where = [FILTRO_UTENTE_ATTIVO, condizione];
  const params = [dataQuery];
  if (societa_id != null) {
    params.push(assertInt(societa_id, 'societa_id'));
    where.push(`u.societa_id = $${params.length}`);
  }
  await aggiungiFiltroSede(sede, where, params);
  const { rows } = await pool.query(
    `SELECT COUNT(*) OVER() AS totale, u.id, u.nome, u.cognome, s.ragione_sociale AS societa
       FROM utenti u
       LEFT JOIN societa s ON s.id = u.societa_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.cognome, u.nome
      LIMIT 50`,
    params
  );
  const totale = rows.length ? Number(rows[0].totale) : 0;
  return { data: dataQuery, totale, dipendenti: rows.map(({ totale: _t, ...r }) => r) };
}

async function chi_ha_timbrato(args) {
  return queryTimbrature(true, args);
}

async function chi_non_ha_timbrato(args) {
  return queryTimbrature(false, args);
}

function formatOra(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

// pg restituisce le colonne DATE come oggetti Date costruiti in timezone locale
// (process.env.TZ=Europe/Rome): leggere i componenti locali evita lo sfasamento
// di un giorno che si otterrebbe con toISOString()/serializzazione diretta.
function formatData(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function ore_lavorate({ utente_id, data_inizio, data_fine }) {
  const id = assertInt(utente_id, 'utente_id');
  const inizio = assertData(data_inizio, 'data_inizio');
  const fine = assertData(data_fine, 'data_fine');
  // Un turno senza uscita è "in corso" solo se è di oggi (ore contate fino ad
  // ora). Se è di un giorno passato l'uscita è stata dimenticata: contarlo fino
  // a NOW() gonfierebbe il totale (es. 72 ore per un turno aperto da 3 giorni),
  // quindi resta fuori dal totale ed è segnalato a parte.
  const oggi = oggiRoma();
  const { rows } = await pool.query(
    `SELECT p.data, p.ora_entrata, p.ora_uscita,
            EXTRACT(EPOCH FROM (COALESCE(p.ora_uscita, NOW()) - p.ora_entrata)) / 3600.0 AS ore
       FROM presenze p
      WHERE p.utente_id = $1 AND p.data BETWEEN $2 AND $3
      ORDER BY p.data ASC, p.ora_entrata ASC`,
    [id, inizio, fine]
  );
  const giorni = rows.map((r) => {
    const data = formatData(r.data);
    const aperto = r.ora_uscita == null;
    const stato = !aperto ? 'chiuso' : data === oggi ? 'in_corso' : 'non_chiuso';
    return {
      data,
      ora_entrata: formatOra(r.ora_entrata),
      ora_uscita: formatOra(r.ora_uscita),
      ore: stato === 'non_chiuso' ? null : Math.round(Number(r.ore) * 100) / 100,
      stato,
    };
  });
  const totaleOre = giorni.reduce((acc, g) => acc + (g.ore || 0), 0);
  return {
    utente_id: id,
    periodo: { inizio, fine },
    totale_ore: Math.round(totaleOre * 100) / 100,
    turni_in_corso: giorni.filter((g) => g.stato === 'in_corso').length,
    turni_non_chiusi_esclusi_dal_totale: giorni.filter((g) => g.stato === 'non_chiuso').length,
    giorni,
  };
}

const handlers = {
  cerca_dipendente,
  conta_dipendenti,
  dettaglio_dipendente,
  documenti_da_firmare,
  documenti_scaduti,
  chi_ha_timbrato,
  chi_non_ha_timbrato,
  ore_lavorate,
};

module.exports = { definitions, handlers };
