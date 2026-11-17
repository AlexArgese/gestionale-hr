// backend/jobs/hr_assistant_retention.js
//
// Cancella le conversazioni di ClockAI non aggiornate da più di N giorni
// (default 90, HR_ASSISTANT_RETENTION_GIORNI): contengono risultati delle
// query su dipendenti (nomi, orari, documenti) e non servono oltre.
const cron = require('node-cron');
const { eliminaConversazioniVecchie } = require('../services/hrAssistant/conversationStore');

const GIORNI = Number.parseInt(process.env.HR_ASSISTANT_RETENTION_GIORNI || '90', 10);

function startHrAssistantRetentionJob() {
  if (!Number.isFinite(GIORNI) || GIORNI < 1) {
    console.warn('[assistenteHr] HR_ASSISTANT_RETENTION_GIORNI non valido: cancellazione automatica disattivata');
    return;
  }
  // tutti i giorni alle 03:45
  cron.schedule(
    '45 3 * * *',
    async () => {
      try {
        const n = await eliminaConversazioniVecchie(GIORNI);
        if (n) console.log(`🧹 ClockAI retention: cancellate ${n} conversazioni più vecchie di ${GIORNI} giorni`);
      } catch (e) {
        console.error('ClockAI retention job error:', e);
      }
    },
    { timezone: 'Europe/Rome' }
  );
}

module.exports = { startHrAssistantRetentionJob };
