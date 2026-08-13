const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Loose enough to catch the common formats resumes actually use -
// "+91 98765 43210", "(987) 654-3210", "987-654-3210", "9876543210" -
// while the digit-count check below throws out short false-positives
// like a pin code or a year range that happen to match the shape.
const PHONE_RE = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3,5}\)?[-.\s]?){2,4}\d{3,4}/g;

// Best-effort guess only, same spirit as the existing filename-based name
// guess for bulk uploads: resumes have no fixed layout, so this can't be
// exact. A recruiter-supplied value (typed into the form) should always
// win over this - see how callers use `field || guessXFromText(text)`.
function guessEmailFromText(text) {
  const match = EMAIL_RE.exec(String(text || ''));
  return match ? match[0] : undefined;
}

function guessPhoneFromText(text) {
  const candidates = String(text || '').match(PHONE_RE) || [];
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, '');
    // A real phone number, digits only, is 10 (local) to 13 (with a
    // country code) digits. Anything shorter/longer here is far more
    // likely to be a pin code, a partial date, or two numbers that
    // happened to sit next to each other on the page.
    if (digits.length >= 10 && digits.length <= 13) {
      return raw.trim();
    }
  }
  return undefined;
}

module.exports = { guessEmailFromText, guessPhoneFromText };
