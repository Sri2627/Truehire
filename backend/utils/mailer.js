const nodemailer = require('nodemailer');

let transporter;
// Whether the current transporter actually delivers mail, vs. just
// simulating a send for local/dev environments with no SMTP configured.
let usingRealSmtp = false;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    usingRealSmtp = true;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    // No SMTP_HOST set - fall back to nodemailer's JSON transport so the
    // "send email" flow still works end-to-end without real credentials.
    // Nothing is actually delivered; the composed message is logged to
    // the server console instead. Set SMTP_HOST/PORT/USER/PASS/FROM in
    // .env to send real mail.
    usingRealSmtp = false;
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }

  return transporter;
}

// Sends (or, without SMTP configured, simulates) an email to a candidate.
// Returns { delivered } so callers can tell the admin whether it actually
// went out or was only simulated.
async function sendCandidateEmail({ to, subject, text }) {
  if (!to) {
    throw new Error('This candidate has no email address on file');
  }

  const t = getTransporter();
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || 'True Hire <no-reply@truehire.local>',
    to,
    subject,
    text,
  });

  if (!usingRealSmtp) {
    console.log('[mailer] SMTP not configured - simulated send only:', info.message.toString());
  }

  return { delivered: usingRealSmtp };
}

module.exports = { sendCandidateEmail };
