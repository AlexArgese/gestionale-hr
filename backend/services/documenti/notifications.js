/**
 * backend/services/documenti/notifications.js
 * Notifiche push + email per nuovi documenti assegnati, usate dalle rotte
 * di /backend/routes/documenti.js.
 */
const pool = require('../../db');
const { sendExpoPush } = require('../expoPush');
const { safeSendMail } = require('../../lib/notifier');
const { getUserPushTokens } = require('./db');

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** sostituisce i segnaposto {nome} {cognome} {nome_cognome} {documento} {tipo} */
function applyMailPlaceholders(tpl, vars) {
  return String(tpl || "").replace(/\{(nome_cognome|nome|cognome|documento|tipo)\}/gi, (_, k) => {
    const key = k.toLowerCase();
    const map = {
      nome: vars.nome || "",
      cognome: vars.cognome || "",
      nome_cognome: vars.displayName || "",
      documento: vars.nomeFile || "",
      tipo: vars.tipoDocumento || "-",
    };
    return map[key] ?? "";
  });
}

async function notifyNewDocumentAssigned({
  utenteId,
  documentoId,
  nomeFile,
  tipoDocumento,
  emailSubject,
  emailBody,
}) {
  try {
    const u = await pool.query(
      `SELECT nome, cognome, email
         FROM utenti
        WHERE id = $1
        LIMIT 1`,
      [utenteId]
    );

    const user = u.rows[0];
    if (!user) return;

    const displayName =
      [user.nome, user.cognome].filter(Boolean).join(" ").trim() || "dipendente";

    // PUSH
    const tokens = await getUserPushTokens(utenteId);
    if (tokens.length) {
      await sendExpoPush(tokens, {
        title: "Nuovo documento",
        body: nomeFile,
        data: {
          type: "NEW_DOCUMENT",
          documentoId,
        },
      });
    }

    // EMAIL
    if (user.email) {
      const vars = { nome: user.nome, cognome: user.cognome, displayName, nomeFile, tipoDocumento };
      const customSubject = String(emailSubject || "").trim();
      const customBody = String(emailBody || "").trim();

      let subject;
      let text;
      let html;

      if (customSubject || customBody) {
        // email personalizzata da "carica documento"
        subject = customSubject
          ? applyMailPlaceholders(customSubject, vars)
          : "ClockEasy - Nuovo documento disponibile";

        const bodyText = customBody
          ? applyMailPlaceholders(customBody, vars)
          : `Ciao ${displayName},\n\nè stato caricato un nuovo documento su ClockEasy.\nDocumento: ${nomeFile}\nTipo: ${tipoDocumento || "-"}`;

        text = `${bodyText}\n\nMessaggio automatico, non rispondere a questa email.`;
        html = `
          <div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;">${escapeHtml(
            bodyText
          )}</div>
          <p style="color:#666;font-size:12px;margin-top:16px;">Messaggio automatico, non rispondere a questa email.</p>
        `;
      } else {
        // preset
        subject = "ClockEasy - Nuovo documento disponibile";
        text = `Ciao ${displayName},

è stato caricato un nuovo documento su ClockEasy.

Documento: ${nomeFile}
Tipo: ${tipoDocumento || "-"}

Accedi all'app ClockEasy per visualizzarlo.

Messaggio automatico, non rispondere a questa email.`;
        html = `
          <p>Ciao <strong>${displayName}</strong>,</p>
          <p>è stato caricato un nuovo documento su <strong>ClockEasy</strong>.</p>
          <p>
            <strong>Documento:</strong> ${nomeFile}<br />
            <strong>Tipo:</strong> ${tipoDocumento || "-"}
          </p>
          <p>Accedi all'app ClockEasy per visualizzarlo.</p>
          <p style="color:#666;font-size:12px;">Messaggio automatico, non rispondere a questa email.</p>
        `;
      }

      await safeSendMail({ to: user.email, subject, text, html });
    }
  } catch (e) {
    console.error("notifyNewDocumentAssigned error:", e);
  }
}

function fireAndForgetDocumentNotifications(rows, tipoDocumento, opts = {}) {
  const { emailSubject, emailBody } = opts;
  Promise.allSettled(
    (rows || []).map((doc) =>
      notifyNewDocumentAssigned({
        utenteId: doc.utente_id,
        documentoId: doc.id,
        nomeFile: doc.nome_file,
        tipoDocumento,
        emailSubject,
        emailBody,
      })
    )
  ).catch((e) => {
    console.error("fireAndForgetDocumentNotifications error:", e);
  });
}

module.exports = {
  notifyNewDocumentAssigned,
  fireAndForgetDocumentNotifications,
};
