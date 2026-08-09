// Lowercases and strips punctuation so "ABC Pvt. Ltd." and "abc pvt ltd"
// match. Also strips a conservative list of trailing legal-entity
// designators (Pvt Ltd, Private Limited, LLP, Inc, Corp, ...) so a fraud
// watch-list entry like "3 Star Communication" still matches a resume
// line reading "3 Star Communication Pvt. Ltd." — the suffix alone
// shouldn't be enough to dodge the match. Used when seeding
// fraud_companies and when matching a resume's extracted text against
// the watch-list, so both sides go through the same normalization.
//
// Deliberately conservative: only formal legal-entity designators that
// are (virtually) never a distinguishing part of a brand name are
// stripped — generic business words like "Solutions", "Enterprises", or
// "Co" are left alone, since stripping those risks collapsing two
// genuinely different companies into a false match.
const LEGAL_SUFFIXES = [
  'private limited company',
  'public limited company',
  'private limited',
  'pvt limited',
  'private ltd',
  'pvt ltd',
  'pte ltd',
  'incorporated',
  'corporation',
  'limited',
  'ltd',
  'corp',
  'llp',
  'llc',
  'inc',
  'plc',
];

// Longest phrases first, so "private limited" strips in one pass rather
// than leaving "private" behind after "limited" matches first.
const SORTED_SUFFIXES = [...LEGAL_SUFFIXES].sort((a, b) => b.length - a.length);
const LEGAL_SUFFIX_RE = new RegExp(`\\s+(${SORTED_SUFFIXES.join('|')})\\s*$`, 'i');

function normalizeCompanyName(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();

  let stripped = base;
  let prev;
  do {
    prev = stripped;
    stripped = stripped.replace(LEGAL_SUFFIX_RE, '').trim();
  } while (stripped !== prev && stripped.length > 0);

  return stripped || base;
}

module.exports = { normalizeCompanyName };
