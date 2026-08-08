const jwt = require('jsonwebtoken');

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

module.exports = { requireAuth, requireRole };
