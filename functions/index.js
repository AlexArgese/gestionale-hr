const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

exports.sendVerificationEmail = functions.auth.user().onCreate(async (user) => {
  const email = user.email;
  if (!email) return null;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  let link;
  try {
    link = await admin.auth().generateEmailVerificationLink(email);
  } catch (err) {
    console.error("Errore generazione link verifica:", err);
    return null;
  }

  const html = `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header viola -->
          <tr>
            <td style="background:#6A57D3;padding:32px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">ClockEasy</p>
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a1a2e;">Conferma la tua email</p>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                Grazie per esserti registrato su <strong>ClockEasy</strong>.<br/>
                Clicca il pulsante qui sotto per verificare la tua email e attivare l'account.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${link}"
                       style="display:inline-block;background:#6A57D3;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;">
                      Verifica email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.5;">
                Se il pulsante non funziona, copia e incolla questo link nel browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;word-break:break-all;">
                <a href="${link}" style="color:#6A57D3;text-decoration:none;">${link}</a>
              </p>

              <p style="margin:0;font-size:13px;color:#aaa;">
                Il link scade dopo 24 ore. Se non hai creato un account su ClockEasy, ignora questa email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F5F5F7;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                © ${new Date().getFullYear()} ClockEasy — questa è un'email automatica, non rispondere.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `ClockEasy <${process.env.SMTP_FROM || "clockeasyapp@gmail.com"}>`,
      to: email,
      subject: "Conferma la tua email – ClockEasy",
      html,
    });
    console.log("Email verifica inviata via Brevo a:", email);
  } catch (err) {
    console.error("Errore invio email verifica:", err);
  }

  return null;
});
