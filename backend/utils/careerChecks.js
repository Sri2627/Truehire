const { extractRoleSegments } = require('./timelineExtraction');

// Both checks below are pure date/keyword arithmetic - no AI, no judgment
// call. That's a deliberate choice consistent with the rest of this app
// (see utils/jobMatching.js, utils/trustScore.js): a recruiter can always
// point at exactly why something got flagged, and a flag never depends on
// a model's mood. The tradeoff is the same one timeline extraction and
// skill extraction already make - a resume with an unusual layout may not
// parse cleanly, in which case this fails safe (no flag) rather than
// guessing.

// Seniority keywords, ordered low to high. A title's level is the HIGHEST
// level any of its keywords matches (so "Senior Engineering Manager"
// reads as Manager, not Engineer) - deliberately generous toward the
// candidate, since the growth check only cares about big upward jumps.
const SENIORITY_LEVELS = [
  { level: 0, words: ['intern', 'trainee', 'apprentice', 'fresher'] },
  { level: 1, words: ['associate', 'junior', 'jr.', 'engineer', 'developer', 'programmer', 'analyst', 'designer'] },
  { level: 2, words: ['senior', 'sr.', 'sr ', 'staff'] },
  { level: 3, words: ['lead', 'principal'] },
  { level: 4, words: ['architect', 'manager'] },
  { level: 5, words: ['director', 'head of', 'avp'] },
  { level: 6, words: ['vp', 'vice president', 'chief', 'cto', 'ceo', 'coo', 'cfo'] },
];

// A title needs to contain one of these words to be recognized as a title
// line at all (vs. a company name or location line sitting in the same
// segment) - see guessTitle() below.
const TITLE_HINT_RE =
  /(engineer|developer|programmer|architect|manager|lead|director|head|consultant|analyst|designer|specialist|intern|trainee|founder|officer|president|administrator|scientist)/i;

function guessSeniorityLevel(title) {
  const t = String(title || '').toLowerCase();
  let best = null;
  for (const { level, words } of SENIORITY_LEVELS) {
    if (words.some((w) => t.includes(w))) best = level;
  }
  return best;
}

// Best-effort: the title is usually one of the first few non-empty lines
// of a role segment (company/location lines are typically right next to
// it with no other structural marker), so this scans a handful of lines
// and picks the first one that reads like a job title. Returns null if
// nothing in the segment looks like a title - callers should treat that
// role as "unknown level" and skip it, not assume junior/senior.
function guessTitle(segmentText) {
  const lines = String(segmentText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5);

  for (const line of lines) {
    if (line.length <= 70 && TITLE_HINT_RE.test(line)) return line;
  }
  return null;
}

// Flags pairs of roles whose date ranges overlap - the resume-derived
// equivalent of the manual UAN-overlap check already in candidateRoutes.js
// (POST /:id/uan-check), but automatic: no manual employment-record entry
// required, since the dates are already sitting in the resume text.
function detectEmploymentOverlaps(segments) {
  const flags = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      const overlapping = a.startDate < b.endDate && b.startDate < a.endDate;
      if (overlapping) {
        flags.push({
          type: 'employment_overlap',
          a: { range: a.rangeText, title: guessTitle(a.text) },
          b: { range: b.rangeText, title: guessTitle(b.text) },
        });
      }
    }
  }
  return flags;
}

// Flags a jump of 2+ seniority levels between consecutive roles (sorted
// by start date) inside less than 18 months - e.g. Fresher -> Senior
// Architect in under a year. A single-level jump (Engineer -> Senior) or
// a slower climb is normal career progression and never flagged. Roles
// where a title couldn't be confidently guessed are skipped rather than
// assumed - this only flags what it can actually name.
const FAST_JUMP_MONTHS = 18;
const MIN_LEVEL_JUMP = 2;

function detectUnrealisticGrowth(segments) {
  const withLevels = segments
    .map((seg) => {
      const title = guessTitle(seg.text);
      return title ? { ...seg, title, level: guessSeniorityLevel(title) } : null;
    })
    .filter((r) => r && r.level != null)
    .sort((a, b) => a.startDate - b.startDate);

  const flags = [];
  for (let i = 1; i < withLevels.length; i++) {
    const prev = withLevels[i - 1];
    const cur = withLevels[i];
    const monthsBetween = (cur.startDate - prev.startDate) / (30.44 * 24 * 3600 * 1000);
    const levelJump = cur.level - prev.level;

    if (levelJump >= MIN_LEVEL_JUMP && monthsBetween < FAST_JUMP_MONTHS) {
      flags.push({
        type: 'unrealistic_growth',
        from: { title: prev.title, level: prev.level },
        to: { title: cur.title, level: cur.level },
        monthsBetween: Math.round(monthsBetween),
      });
    }
  }
  return flags;
}

// Runs both checks off one shared segment extraction.
function runCareerChecks(text) {
  const segments = extractRoleSegments(text);
  return {
    overlaps: detectEmploymentOverlaps(segments),
    growthFlags: detectUnrealisticGrowth(segments),
  };
}

module.exports = { runCareerChecks, detectEmploymentOverlaps, detectUnrealisticGrowth, guessTitle, guessSeniorityLevel };
