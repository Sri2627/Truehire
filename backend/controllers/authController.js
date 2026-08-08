const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

function signTokens(user) {
  const payload = { id: user._id.toString(), role: user.role, companyId: user.companyId };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '30m',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  });

  return { accessToken, refreshToken };
}

// POST /auth/register - creates a new HR user. In production, restrict this
// to admins inviting teammates (see routes/teamRoutes.js pattern); left open
// here so you can create the first account without the seed script if needed.
async function register(req, res) {
  try {
    const { name, email, mobile, password, role, companyId } = req.body;

    if (!name || !password || (!email && !mobile)) {
      return res.status(400).json({ error: 'name, password, and email or mobile are required' });
    }

    const existing = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existing) {
      return res.status(409).json({ error: 'A user with that email or mobile already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      mobile,
      passwordHash,
      role: role || 'recruiter',
      companyId,
    });

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
}

// POST /auth/login - email/mobile + password -> access + refresh JWTs.
async function login(req, res) {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier and password are required' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { mobile: identifier }],
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    await AuditLog.create({
      userId: user._id,
      action: 'login',
      entityType: 'user',
      entityId: user._id,
      metadata: { ip: req.ip },
    });

    const tokens = signTokens(user);

    res.json({
      ...tokens,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
}

// POST /auth/refresh - exchange a refresh token for a new access token.
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const accessToken = jwt.sign(
      { id: payload.id, role: payload.role, companyId: payload.companyId },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '30m' }
    );

    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
}

// GET /auth/me - current user profile (requireAuth already ran).
async function me(req, res) {
  const user = await User.findById(req.user.id).select('-passwordHash');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}

module.exports = { register, login, refresh, me };
