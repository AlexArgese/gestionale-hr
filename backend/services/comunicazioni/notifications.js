/**
 * backend/services/comunicazioni/notifications.js
 * Notifiche push ed email per le comunicazioni (nuova/aggiornata).
 */
const pool = require('../../db');
const { sendExpoPush } = require('../expoPush');
const { safeSendMail } = require('../../lib/notifier');

async function getPushTokensForUserIds(utenteIds) {
  const ids = [...new Set(
    (Array.isArray(utenteIds) ? utenteIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) return [];

  const q = await pool.query(
    `SELECT expo_push_token
       FROM push_tokens
      WHERE utente_id = ANY($1::int[])
        AND attivo = TRUE`,
    [ids]
  );

  return [...new Set(q.rows.map((r) => r.expo_push_token).filter(Boolean))];
}

async function notifyNewCommunicationRecipients({ utenteIds, comunicazioneId, titolo, updated = false }) {
  const tokens = await getPushTokensForUserIds(utenteIds);
  if (!tokens.length) return;

  await sendExpoPush(tokens, {
    title: updated ? 'Comunicazione aggiornata' : 'Nuova comunicazione',
    body: (titolo || (updated ? 'Una comunicazione è stata aggiornata' : 'Hai ricevuto una nuova comunicazione')).trim(),
    data: {
      type: updated ? 'UPDATED_COMMUNICATION' : 'NEW_COMMUNICATION',
      comunicazioneId,
    },
  });
}

function fireAndForgetCommunicationNotifications({ utenteIds, comunicazioneId, titolo, updated = false }) {
  notifyNewCommunicationRecipients({ utenteIds, comunicazioneId, titolo, updated }).catch((err) => {
    console.error('fireAndForgetCommunicationNotifications error:', err);
  });
}

async function sendCommunicationEmail({ emails, titolo, contenuto, updated = false }) {
  if (!emails.length) return;

  const subject = `[ClockEasy] ${updated ? 'Aggiornamento: ' : ''}${titolo || 'Nuova comunicazione'}`;
  const introLine = updated ? 'Questa comunicazione è stata aggiornata:\n\n' : '';
  const text = `${introLine}${titolo || 'Nuova comunicazione'}\n\n${contenuto || ''}\n\n— ClockEasy`;

  for (const email of emails) {
    const result = await safeSendMail({ to: email, subject, text });
    if (!result.ok) console.error('Email comunicazione fallita per %s: %s', email, result.reason);
  }
}

module.exports = {
  getPushTokensForUserIds,
  notifyNewCommunicationRecipients,
  fireAndForgetCommunicationNotifications,
  sendCommunicationEmail,
};
