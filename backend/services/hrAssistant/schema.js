// backend/services/hrAssistant/schema.js
//
// Tutto lo schema dell'assistente HR in un posto solo. Viene eseguito
// all'avvio da runMigrations() in index.js; gli store lo richiamano comunque
// (una sola volta per processo) così funzionano anche negli script che non
// passano da index.js. Ogni istruzione è idempotente.
const pool = require('../../db');

const ISTRUZIONI = [
  `CREATE TABLE IF NOT EXISTS hr_assistant_usage (
     id SERIAL PRIMARY KEY,
     data DATE NOT NULL,
     creato_da INTEGER,
     costo_usd NUMERIC(10,6) NOT NULL,
     input_tokens INTEGER NOT NULL,
     output_tokens INTEGER NOT NULL,
     creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_hr_assistant_usage_data ON hr_assistant_usage (data)`,
  `CREATE INDEX IF NOT EXISTS idx_hr_assistant_usage_utente_data ON hr_assistant_usage (creato_da, data)`,

  `CREATE TABLE IF NOT EXISTS hr_assistant_conversazioni (
     id SERIAL PRIMARY KEY,
     utente_id INTEGER,
     titolo TEXT NOT NULL,
     creata_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     aggiornata_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS hr_assistant_messaggi (
     id SERIAL PRIMARY KEY,
     conversazione_id INTEGER NOT NULL REFERENCES hr_assistant_conversazioni(id) ON DELETE CASCADE,
     ruolo TEXT NOT NULL,
     testo TEXT NOT NULL,
     dati JSONB,
     creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_hr_assistant_messaggi_conv ON hr_assistant_messaggi (conversazione_id)`,

  // Scambio completo del turno (chiamate ai tool e loro risultati), per
  // ridare al modello il contesto nelle domande successive.
  `ALTER TABLE hr_assistant_messaggi ADD COLUMN IF NOT EXISTS scambio JSONB`,
  // Log per QA: tool chiamati, input, esito, durata.
  `ALTER TABLE hr_assistant_messaggi ADD COLUMN IF NOT EXISTS tool_log JSONB`,
  // Feedback dell'utente sulla risposta: 1 = utile, -1 = non utile.
  `ALTER TABLE hr_assistant_messaggi ADD COLUMN IF NOT EXISTS feedback SMALLINT`,
  `ALTER TABLE hr_assistant_messaggi ADD COLUMN IF NOT EXISTS feedback_il TIMESTAMPTZ`,
  // Risposta come l'ha scritta il modello, con i segnaposto {{D:id}} al posto
  // dei nomi: è quella che torna al modello nello storico.
  `ALTER TABLE hr_assistant_messaggi ADD COLUMN IF NOT EXISTS testo_modello TEXT`,
  // Id → nome dei dipendenti comparsi nei risultati del turno, per risolvere
  // i segnaposto nelle domande successive.
  `ALTER TABLE hr_assistant_messaggi ADD COLUMN IF NOT EXISTS persone JSONB`,
  // Revisione delle risposte con feedback: quando un admin l'ha esaminata.
  `ALTER TABLE hr_assistant_messaggi ADD COLUMN IF NOT EXISTS revisionato_il TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_hr_assistant_messaggi_feedback ON hr_assistant_messaggi (feedback) WHERE feedback IS NOT NULL`,
  // Per la cancellazione automatica delle conversazioni vecchie.
  `CREATE INDEX IF NOT EXISTS idx_hr_assistant_conversazioni_aggiornata ON hr_assistant_conversazioni (aggiornata_il)`,
];

let pronto = null;

function ensureSchema() {
  if (!pronto) {
    pronto = (async () => {
      for (const sql of ISTRUZIONI) await pool.query(sql);
    })().catch((err) => {
      pronto = null; // riprova alla prossima chiamata
      throw err;
    });
  }
  return pronto;
}

module.exports = { ensureSchema };
