// backend/services/hrAssistant/sqlConstants.js

// Allineato a /documenti/da-firmare (backend/routes/documenti.js) — fonte di
// verità già user-facing per "documento non ancora firmato".
const YOUSIGN_STATI_CONCLUSI = [
  'completed',
  'signed',
  'done',
  'init_error',
  'canceled',
  'expired',
  'declined',
];

// Replica di getMinutiContratto in backend/routes/presenze.js — tenere allineate.
const MINUTI_PER_TIPO_CONTRATTO = {
  full_time: 400,
  part_time_2: 120,
  part_time_3: 180,
  part_time_4: 240,
  part_time_6: 360,
  part_time_8: 480,
  chiamata_6: 360,
};

// Definizione canonica di "dipendente attivo" per le query dell'assistente.
const FILTRO_UTENTE_ATTIVO = `COALESCE(u.archiviato, false) = false AND u.stato_attivo = true`;

module.exports = {
  YOUSIGN_STATI_CONCLUSI,
  MINUTI_PER_TIPO_CONTRATTO,
  FILTRO_UTENTE_ATTIVO,
};
