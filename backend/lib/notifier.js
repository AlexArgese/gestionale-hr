// backend/lib/notifier.js
const nodemailer = require('nodemailer');

const enabled = !!process.env.SMTP_HOST;
const DEFAULT_FROM = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'ClockEasy <no-reply@localhost>';

let transporter = null;
if (enabled) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function safeSendMail({ to, subject, html, text, bcc, replyTo }) {
  if (!enabled) return { ok: false, reason: 'smtp_disabled' };
  try {
    const info = await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject,
      ...(html    ? { html }    : {}),
      ...(text    ? { text }    : {}),
      ...(bcc     ? { bcc }     : {}),
      ...(replyTo ? { replyTo } : {}),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error('Mail error:', e.message);
    return { ok: false, reason: e.message };
  }
}

module.exports = { safeSendMail };
