// Lowercases and strips punctuation so "ABC Pvt. Ltd." and "abc pvt ltd"
// match. Used when seeding fraud_companies and, later, when matching a
// resume's extracted text against the watch-list.
function normalizeCompanyName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeCompanyName };
