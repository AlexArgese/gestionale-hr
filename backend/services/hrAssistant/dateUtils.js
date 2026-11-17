// backend/services/hrAssistant/dateUtils.js
//
// "Oggi" per l'assistente HR va sempre calcolato nel fuso di Europe/Rome:
// toISOString() restituisce la data UTC, che tra mezzanotte e l'1/le 2 di notte
// italiane è ancora "ieri".
const FORMATO_DATA_ROMA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Data odierna a Roma in formato YYYY-MM-DD.
function oggiRoma() {
  return FORMATO_DATA_ROMA.format(new Date());
}

module.exports = { oggiRoma };
