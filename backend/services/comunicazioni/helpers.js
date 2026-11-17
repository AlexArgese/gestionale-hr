/**
 * backend/services/comunicazioni/helpers.js
 * Funzioni di utilità pure usate dalle rotte di /backend/routes/comunicazioni.js.
 */
function parseBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
  return false;
}

module.exports = { parseBool };
