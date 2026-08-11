const { RELEASE_YEARS } = require('./techReleaseYears');

// A couple of entries in the release-year table are common English words
// on their own ("go", "swift") and would produce a lot of false positives
// if we auto-scanned resume text for them ("go above and beyond..."). They
// still get a real consistency check when typed in manually (job
// requirements, candidate skill edits) - they're just excluded from
// automatic extraction, where the ambiguity actually bites.
const EXCLUDED_FROM_AUTO_EXTRACT = new Set(['go', 'swift']);

const MASTER_SKILLS = Object.keys(RELEASE_YEARS)
  .filter((s) => !EXCLUDED_FROM_AUTO_EXTRACT.has(s))
  .sort((a, b) => b.length - a.length); // longest first, so "spring boot" beats "spring"

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skillPresenceRegex(skill) {
  const escaped = escapeRegex(skill);
  // Skill names with symbols (".net", "c#") don't play nicely with \b,
  // so match on non-alphanumeric boundaries instead.
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
}

// Best-effort, no-LLM extraction of {name, years} pairs from raw resume
// text: dictionary lookup for skill presence, plus a couple of regex
// shapes for "N years of X" / "X - N years" to pick up a claimed duration
// when it's stated in a common way. Most real resumes (see: a flat
// "Skills" list with no years attached) won't match the years patterns -
// that's expected, and is exactly the gap utils/timelineExtraction.js
// exists to fill by deriving years from the dated employment history
// instead. This function is a starting point, reviewable/editable by a
// recruiter afterwards, not a trusted-blind parser.
function extractSkillsFromText(text) {
  const body = String(text || '');
  const found = [];

  for (const skill of MASTER_SKILLS) {
    const escaped = escapeRegex(skill);
    if (!skillPresenceRegex(skill).test(body)) continue;

    const yearsBeforeRe = new RegExp(
      `(\\d{1,2})\\+?\\s*(?:years?|yrs?)\\s*(?:of\\s*)?(?:experience\\s*)?(?:in\\s*|with\\s*)?${escaped}`,
      'i'
    );
    const yearsAfterRe = new RegExp(`${escaped}\\s*[-:(]?\\s*(\\d{1,2})\\+?\\s*(?:years?|yrs?)`, 'i');

    const beforeMatch = body.match(yearsBeforeRe);
    const afterMatch = body.match(yearsAfterRe);
    const years = beforeMatch ? parseInt(beforeMatch[1], 10) : afterMatch ? parseInt(afterMatch[1], 10) : null;

    found.push({ name: skill, years });
  }

  return found;
}

module.exports = { extractSkillsFromText, skillPresenceRegex, MASTER_SKILLS };
