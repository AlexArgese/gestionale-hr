// backend/lib/notifier.js
const nodemailer = require('nodemailer');

const enabled = !!process.env.SMTP_HOST;
let transporter = null;

if (enabled) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined,
  });
}

async function safeSendMail(opts) {
  if (!enabled) return { ok: false, reason: 'smtp_disabled' };
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'ClockEasy WB <no-reply@localhost>',
      ...opts
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error('WB mail error:', e.message);
    return { ok: false, reason: e.message };
  }
}

module.exports = { safeSendMail };
