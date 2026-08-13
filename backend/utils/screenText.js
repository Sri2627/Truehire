const { normalizeCompanyName } = require('./normalizeCompanyName');

// Same matching rule the original ProfileXRay script used: a resume is
// flagged only when one of its LINES is an exact match (case-insensitive,
// whitespace-trimmed, punctuation-normalized) to a full fraud-register
// entry — not a "contains" / substring check. fraudCompanies is the list
// of FraudCompany docs (the caller's own tenant entries plus the global
// platform-wide list — see routes/candidateRoutes.js) to check
// against.
function screenResumeText(text, fraudCompanies) {
  const registry = new Map(); // normalizedName -> fraud company doc
  for (const fc of fraudCompanies) {
    registry.set(fc.normalizedName, fc);
  }

  const lines = String(text || '').split(/\r?\n/);
  const matches = [];
  const seenFraudIds = new Set();

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const normalized = normalizeCompanyName(trimmed);
    if (!normalized) continue;

    const hit = registry.get(normalized);
    if (hit && !seenFraudIds.has(String(hit._id))) {
      seenFraudIds.add(String(hit._id));
      matches.push({ fraudCompanyId: hit._id, matchedText: trimmed });
    }
  }

  return {
    verdict: matches.length > 0 ? 'flagged' : 'clear',
    fraudMatches: matches,
  };
}

module.exports = { screenResumeText };
