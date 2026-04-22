const { safeSendMail } = require('./notifier');
const { getWbManagerEmails } = require('./wbManager');
const pool = require('../db');

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

async function sendReporterNotificationEmail({ reportId, protocol, title, type }) {
  try {
    const { rows } = await pool.query(
      `SELECT u.email FROM wb_reports r
         JOIN utenti u ON u.id = r.reporter_user_id
        WHERE r.id = $1 AND r.is_anonymous = false
          AND u.email IS NOT NULL AND trim(u.email) <> ''`,
      [reportId]
    );
    if (!rows.length) return { ok: false, reason: 'no_reporter_email' };
    const to = rows[0].email.trim();

    const subjects = {
      risposta: `[WB] Nuova risposta sulla tua segnalazione ${protocol}`,
      stato:    `[WB] Aggiornamento stato segnalazione ${protocol}`,
    };
    const bodies = {
      risposta: `Il Responsabile ha inviato una risposta sulla tua segnalazione.\n\nProtocollo: ${protocol}\nTitolo: ${title}\n\nAccedi all'app ClockEasy → Profilo → Azioni → Whistleblowing → Le mie segnalazioni per leggere il messaggio.`,
      stato:    `Lo stato della tua segnalazione è stato aggiornato.\n\nProtocollo: ${protocol}\nTitolo: ${title}\n\nAccedi all'app ClockEasy → Profilo → Azioni → Whistleblowing → Le mie segnalazioni per verificare lo stato attuale.`,
    };

    const subject = subjects[type] ?? subjects.risposta;
    const text    = bodies[type]   ?? bodies.risposta;

    return safeSendMail({ to, subject, text, replyTo: process.env.WB_MAIL_REPLY_TO });
  } catch (e) {
    console.warn('sendReporterNotificationEmail error:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function sendManagerDeadlineEmail({ type, protocols }) {
  const to = await resolveWbNotificationRecipients();
  if (!to.length) return { ok: false, reason: 'no_wb_manager_email' };

  const subjects = {
    ack:      '[WB] ⚠️ Segnalazioni senza presa in carico entro 7 giorni',
    riscontro:'[WB] 🔴 Segnalazioni senza riscontro entro 3 mesi',
  };
  const intros = {
    ack:      'Le seguenti segnalazioni non hanno ancora ricevuto presa in carico (scadenza 7 gg):',
    riscontro:'Le seguenti segnalazioni non hanno ancora ricevuto riscontro (scadenza 3 mesi):',
  };

  const list = protocols.map(p => `  • ${p}`).join('\n');
  const subject = subjects[type];
  const text = `${intros[type]}\n\n${list}\n\nAccedi al pannello WB di ClockEasy per gestirle.\n\nMessaggio automatico, non rispondere.`;

  return safeSendMail({ to, subject, text, replyTo: process.env.WB_MAIL_REPLY_TO });
}

module.exports = {
  resolveWbNotificationRecipients,
  sendNewReportEmail,
  sendReporterNotificationEmail,
  sendManagerDeadlineEmail,
};
