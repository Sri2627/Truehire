const { skillPresenceRegex } = require('./skillExtraction');
const { maxPossibleYears } = require('./techReleaseYears');

// Most real resumes list skills as a flat block ("React, TypeScript, AWS,
// Node.js") with no years attached anywhere - the skill-years fallback in
// jobMatching.js exists exactly because of that gap. This module closes
// the gap a different way: instead of asking the resume to state "X years
// of Y", it derives that number from the dated Experience section every
// real resume already has - if a skill is mentioned inside a role that
// ran from 2022 to now, that's ~(now - 2022) years of exposure to it.
//
// This is a best-effort heuristic over free text, not a real parser - see
// each function's notes for exactly what it can and can't handle. It's
// meant to fill in a number a recruiter can see and override, not to be
// trusted blindly (same posture as utils/skillExtraction.js).

const MONTH_NAMES = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const MONTH_TOKEN = '[A-Za-z]{3,9}\\.?';
const START_TOKEN = `(?:${MONTH_TOKEN}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const END_TOKEN = `(?:${MONTH_TOKEN}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}|Present|Current|Ongoing|Till\\s*Date|To\\s*Date|Now)`;
const SEP = '\\s*(?:-|–|—|to)\\s*';
// A "range" is two date-like tokens joined by a dash/en-dash/em-dash/"to" -
// this is deliberately narrow (requires BOTH sides to look like dates) so
// it doesn't fire on unrelated text containing a hyphen.
const RANGE_RE = new RegExp(`(${START_TOKEN})${SEP}(${END_TOKEN})`, 'gi');

const PRESENT_RE = /present|current|ongoing|till\s*date|to\s*date|^now$/i;

// Returns a Date for a single date-like token, or:
//   null      -> it's a "present/current" style word (means "now")
//   undefined -> couldn't parse it at all (caller should skip this match)
function parseDateToken(raw) {
  const s = String(raw || '').trim();
  if (PRESENT_RE.test(s)) return null;

  let m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m) {
    const key = m[1].toLowerCase();
    const mon = MONTH_NAMES[key] ?? MONTH_NAMES[key.slice(0, 3)];
    if (mon != null) return new Date(Number(m[2]), mon, 1);
  }

  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mon = Math.min(Math.max(Number(m[1]) - 1, 0), 11);
    return new Date(Number(m[2]), mon, 1);
  }

  m = s.match(/^(\d{4})$/);
  if (m) return new Date(Number(m[1]), 0, 1);

  return undefined;
}

// Splits resume text into "role segments": one per detected date range,
// each holding the text between that range and the next one (i.e. the
// company/title/bullets that normally follow a role's dates on a resume,
// table-laid-out or not). A stray single date (e.g. an education year
// with no range) never becomes a segment, since RANGE_RE requires two
// date-like tokens either side of a dash - that's deliberate, it's what
// keeps this from treating an "Education" section as employment history.
function extractRoleSegments(text) {
  const body = String(text || '');
  const now = new Date();
  const matches = [...body.matchAll(RANGE_RE)];
  const segments = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const startDate = parseDateToken(m[1]);
    if (startDate === undefined) continue; // unparseable start - skip, fail safe
    if (startDate > now) continue; // a "start date" in the future isn't a real role - skip

    const endToken = parseDateToken(m[2]);
    const endDate = endToken === undefined || endToken === null ? now : endToken;

    const segStart = m.index + m[0].length;
    const segEnd = i + 1 < matches.length ? matches[i + 1].index : body.length;

    segments.push({
      startDate,
      endDate,
      rangeText: m[0],
      text: body.slice(segStart, segEnd),
    });
  }

  // Oldest first - most of what consumes this wants chronological order.
  segments.sort((a, b) => a.startDate - b.startDate);
  return segments;
}

function yearsBetween(a, b) {
  return Math.max(0, (b - a) / (365.25 * 24 * 3600 * 1000));
}

// For each candidate skill name, finds the earliest role segment that
// mentions it and derives years-of-experience as (now - that segment's
// start date), capped at how long the technology itself has existed (the
// same techReleaseYears sanity rule used elsewhere) so a mis-parsed date
// can't produce an impossible number. Only returns skills actually found
// in at least one segment - silence for the rest, not a zero.
function deriveSkillYearsFromTimeline(text, skillNames) {
  const segments = extractRoleSegments(text);
  const now = new Date();
  const results = [];

  for (const skill of skillNames) {
    const re = skillPresenceRegex(skill);
    const hits = segments.filter((seg) => re.test(seg.text) || re.test(seg.rangeText));
    if (hits.length === 0) continue;

    const earliestStart = hits.reduce((min, s) => (s.startDate < min ? s.startDate : min), hits[0].startDate);
    let years = Math.round(yearsBetween(earliestStart, now) * 10) / 10;

    const cap = maxPossibleYears(skill, now);
    if (cap != null) years = Math.min(years, cap);

    results.push({ name: skill, years, source: 'timeline_derived', firstSeenFrom: earliestStart });
  }

  return results;
}

// Total experience derived the same way: from the earliest role segment's
// start date to now. null if no date ranges were found at all (rather
// than guessing 0, which would look like a real, checked answer).
function deriveTotalExperience(text) {
  const segments = extractRoleSegments(text);
  if (segments.length === 0) return null;
  const earliest = segments.reduce((min, s) => (s.startDate < min ? s.startDate : min), segments[0].startDate);
  return Math.round(yearsBetween(earliest, new Date()) * 10) / 10;
}

module.exports = { extractRoleSegments, deriveSkillYearsFromTimeline, deriveTotalExperience, parseDateToken };
