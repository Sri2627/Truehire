// Builds a Mongo $or condition array from whichever of email/mobile are
// actually provided. Never include a key whose value is undefined - the
// MongoDB driver serializes { email: undefined } as {}, an empty match
// condition that matches every document, so `$or: [{email}, {mobile}]`
// silently degenerates into "match anything" the moment either field is
// missing (e.g. a mobile-only signup). Returns null if neither is
// provided, since an empty $or is itself invalid.
function emailOrMobileQuery(email, mobile) {
  const conditions = [];
  if (email) conditions.push({ email: String(email).toLowerCase() });
  if (mobile) conditions.push({ mobile });
  return conditions.length ? { $or: conditions } : null;
}

module.exports = { emailOrMobileQuery };
