const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Verifies the Bearer access token and attaches { id, role, companyId } to req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = payload; // { id, role, companyId }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Usage: requireRole('admin') or requireRole('admin', 'recruiter')
// Enforced server-side on every protected route, not just hidden in the UI.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role for this action' });
    }
    next();
  };
}

// superadmin users have no companyId of their own — they're platform-level
// and pick which institution to look at from the frontend's Institutions
// screen. That choice travels as an `x-company-id` header (or ?companyId=
// query param as a fallback) on every scoped request. This middleware
// resolves it into req.user.companyId so every existing
// `{ companyId: req.user.companyId }` query in jobRoutes/candidateRoutes/
// fraudRoutes keeps working unchanged for a superadmin too, scoped to
// whichever institution they've selected. Non-superadmin users are left
// untouched — their companyId already came from their own JWT.
// Must run after requireAuth (needs req.user) and before any route handler
// that reads req.user.companyId.
function resolveCompanyScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.user.role !== 'superadmin') {
    return next();
  }

  const companyId = req.headers['x-company-id'] || req.query.companyId;
  if (!companyId) {
    return res.status(400).json({ error: 'Select an institution first' });
  }
  if (!mongoose.isValidObjectId(companyId)) {
    return res.status(400).json({ error: 'Invalid institution id' });
  }

  req.user.companyId = companyId;
  next();
}

module.exports = { requireAuth, requireRole, resolveCompanyScope };
