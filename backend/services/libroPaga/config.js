/**
 * backend/services/libroPaga/config.js
 * Regole e importi del libro paga, presi dal modello Excel
 * «TEMPLATE LIBRO PAGA CON OPZIONI». Tutto ciò che la consulente può voler
 * cambiare (importi, coefficienti, maggiorazioni, festività locali) sta qui.
 */

// Blocchi del libro paga. `match` riconosce il blocco dal nome della sede in
// anagrafica (utenti.sede). L'ordine conta solo per l'ordine dei fogli.
const AREE = [
  {
    id: 'acquapark',
    nome: 'ACQUAPARK',
    match: /a[c]?qua\s*park/i,
    // Fissi: stipendio mensile; 13ª e 14ª pagate come rateo ogni mese.
    fisso: { mensile: 1378.55, rateoMensile1314: true },
    intermittente: { oraria: 8.01483 },
  },
  {
    id: 'zoo_hotel',
    nome: 'ZOOSAFARI & HOTEL',
    match: /zoo|hotel/i,
    // Fissi: 13ª a dicembre e 14ª a luglio, inserite a mano (nessun rateo).
    fisso: { mensile: 2231.84, rateoMensile1314: false },
    intermittente: { oraria: 8.01483 },
  },
  {
    // PROVVISORIO: in attesa della risposta della consulente (domanda 1).
    // Per ora un blocco a parte con le formule dell'Acquapark e paghe vuote.
    id: 'fasanolandia',
    nome: 'FASANOLANDIA',
    match: /fasanolandia/i,
    fisso: { mensile: null, rateoMensile1314: true },
    intermittente: { oraria: null },
  },
];

// Dipendenti la cui sede non corrisponde a nessun blocco.
const AREA_DA_ASSEGNARE = {
  id: 'da_assegnare',
  nome: 'SEDE DA ASSEGNARE',
  match: null,
  fisso: { mensile: null, rateoMensile1314: true },
  intermittente: { oraria: null },
};

const COEFF = {
  divisoreGiornaliero: 26, // paga giornaliera = mensile / 26
  divisoreOrario: 172, // paga oraria = mensile / 172
  rol: 0.05041, // ore di ROL maturate per ora lavorata (intermittenti)
  ferie: 0.10093, // ore di ferie maturate per ora lavorata (intermittenti)
  festivoFissi: 1.2, // festività dei fissi: giorni × paga giornaliera × 120%
  festivoIntermittenti: 0.2, // festivi lavorati: ore × paga oraria × 20%
  domenica: 0.1, // ore domenicali × paga oraria × 10%
};

// Festività non nazionali (es. il patrono), in attesa della domanda 8:
// [{ mese: 6, giorno: 24, nome: 'Patrono' }]
const FESTIVITA_LOCALI = [];

// Una giornata è segnalata come "corta" se le ore timbrate sono inferiori al
// turno di oltre questa tolleranza (le uscite vengono già limitate alle ore di
// contratto con uno scarto di ±10 minuti).
const TOLLERANZA_GIORNATA_CORTA_MIN = 15;

// Turno usato quando il tipo di contratto non è riconosciuto.
const MINUTI_TURNO_DEFAULT = { fisso: 400, intermittente: 360 };

module.exports = {
  AREE,
  AREA_DA_ASSEGNARE,
  COEFF,
  FESTIVITA_LOCALI,
  TOLLERANZA_GIORNATA_CORTA_MIN,
  MINUTI_TURNO_DEFAULT,
};
