const { safeSendMail } = require('./notifier');
const { getWbManagerEmails } = require('./wbManager');

function parseEmailList(value) {
  return String(value || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

function uniqueEmails(emails) {
  const seen = new Set();
  const result = [];

  for (const email of emails) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }

  return result;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolveWbNotificationRecipients() {
  const managerEmails = await getWbManagerEmails();
  const overrideEmails = parseEmailList(process.env.WB_NOTIFY_TO);
  return uniqueEmails([...managerEmails, ...overrideEmails]);
}

async function sendNewReportEmail({ protocol, title, isAnonymous, categoryId }) {
  const to = await resolveWbNotificationRecipients();
  if (!to.length) return { ok: false, reason: 'no_wb_manager_email' };

  const reportType = isAnonymous ? 'anonima' : 'nominativa';
  const sentAt = new Date().toISOString();
  const subject = `[WB] Nuova segnalazione ${protocol}`;
  const text =
`È stata inviata una nuova segnalazione WB ${reportType}.

Protocollo: ${protocol}
Titolo: ${title}
Categoria: ${categoryId ?? '(nessuna)'}
Data: ${sentAt}

Accedi al pannello WB di ClockEasy per visualizzarla.

Messaggio automatico, non rispondere a questa email.`;

  const html = `
    <p>È stata inviata una nuova segnalazione WB <strong>${reportType}</strong>.</p>
    <p>
      <strong>Protocollo:</strong> ${escapeHtml(protocol)}<br />
      <strong>Titolo:</strong> ${escapeHtml(title)}<br />
      <strong>Categoria:</strong> ${escapeHtml(categoryId ?? '(nessuna)')}<br />
      <strong>Data:</strong> ${escapeHtml(sentAt)}
    </p>
    <p>Accedi al pannello WB di <strong>ClockEasy</strong> per visualizzarla.</p>
    <p style="color:#666;font-size:12px;">Messaggio automatico, non rispondere a questa email.</p>
  `;

  return safeSendMail({
    to,
    subject,
    text,
    html,
    replyTo: process.env.WB_MAIL_REPLY_TO,
  });
}

module.exports = { resolveWbNotificationRecipients, sendNewReportEmail };
