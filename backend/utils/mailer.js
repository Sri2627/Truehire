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

// Sends (or, without SMTP configured, simulates) a plain-text email.
// Returns { delivered } so callers can tell the admin whether it actually
// went out or was only simulated. `cc` is optional - an array of
// addresses, filtered down to only non-empty ones before being handed to
// nodemailer (which is happy with `cc: []` too, but this keeps the sent
// message clean of an empty header either way).
async function sendMail({ to, cc, subject, text }) {
  if (!to) {
    throw new Error('No recipient email address given');
  }

  const ccList = Array.isArray(cc) ? cc.filter(Boolean) : [];

  const t = getTransporter();
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || 'True Hire <no-reply@truehire.local>',
    to,
    ...(ccList.length ? { cc: ccList } : {}),
    subject,
    text,
  });

  if (!usingRealSmtp) {
    console.log('[mailer] SMTP not configured - simulated send only:', info.message.toString());
  }

  return { delivered: usingRealSmtp };
}

// Thin, semantically-named wrapper kept for existing candidate-email call
// sites (interview invites, etc).
async function sendCandidateEmail({ to, cc, subject, text }) {
  if (!to) {
    throw new Error('This candidate has no email address on file');
  }
  return sendMail({ to, cc, subject, text });
}

// POST /auth/forgot-password - emails the 6-digit password reset code.
async function sendPasswordResetEmail({ to, code }) {
  return sendMail({
    to,
    subject: 'Your True Hire password reset code',
    text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
  });
}

module.exports = { sendMail, sendCandidateEmail, sendPasswordResetEmail };
