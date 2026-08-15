const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const AuditLog = require('../models/AuditLog');
const FraudCompany = require('../models/FraudCompany');
const { PLAN_PRICING } = require('../config/plans');
const { sendPasswordResetEmail } = require('../utils/mailer');

const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Generic response for forgot-password so the API never reveals whether a
// given email/mobile actually has an account (avoids user enumeration).
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'If an account exists for that email or mobile, a reset code has been sent.';

// A user's *effective* role, for JWTs/authorization purposes. Normally
// this is just user.role - but see models/User.js `isSuperAdmin`: some
// Atlas connections can't have the users validator patched to allow
// role: 'superadmin', so scripts/createSuperAdmin.js instead sets
// isSuperAdmin: true and leaves role at the schema-valid 'admin'. This is
// the one place that reconciles the two, so every consumer downstream
// (requireRole, JWT payload, /auth/me, frontend routing) can keep
// checking a plain 'superadmin' string without knowing about the flag.
function effectiveRole(user) {
  return user.isSuperAdmin ? 'superadmin' : user.role;
}

function signTokens(user) {
  const role = effectiveRole(user);
  const payload = {
    id: user._id.toString(),
    role,
    // A superadmin is platform-level - force companyId to null in the
    // token even if the stored document still has a stale one (e.g. an
    // account promoted on a connection where $unset also couldn't run).
    companyId: role === 'superadmin' ? null : user.companyId,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '30m',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  });

  return { accessToken, refreshToken };
}

// POST /auth/signup - the actual "new institution" entry point: creates a
// brand new Company (tenant) plus its first user as that company's admin,
// in one step, and logs them straight in. This is the piece that was
// missing - POST /auth/register below can create a user, but only against
// a companyId you already have, which no one signing up for the first
// time has. Every Job/Candidate/FraudCompany/team query elsewhere in the
// app is already scoped by companyId, so once this account exists it's
// fully isolated from every other institution automatically - this is
// what actually turns that isolation into "create your own institution"
// self-serve.
async function signupCompany(req, res) {
  try {
    const { companyName, name, email, mobile, password, plan } = req.body;

    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ error: 'An institution/company name is required' });
    }
    if (!name || !password || (!email && !mobile)) {
      return res.status(400).json({ error: 'name, password, and email or mobile are required' });
    }
    // Chosen on the pricing step before this form is submitted (see
    // frontend/src/pages/Signup.jsx) - falls back to 'free' if omitted
    // rather than rejecting the signup, since a missing plan shouldn't
    // block account creation.
    if (plan !== undefined && !Object.prototype.hasOwnProperty.call(PLAN_PRICING, plan)) {
      return res.status(400).json({ error: `plan must be one of: ${Object.keys(PLAN_PRICING).join(', ')}` });
    }

    const existing = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existing) {
      return res.status(409).json({ error: 'A user with that email or mobile already exists' });
    }

    const company = await Company.create({ name: companyName.trim(), plan: plan || 'free' });

    let user;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      user = await User.create({
        name,
        email,
        mobile,
        passwordHash,
        role: 'admin', // first user of a new institution is always its admin
        companyId: company._id,
      });
    } catch (userErr) {
      // Don't leave an orphan tenant with no users behind if account
      // creation fails partway through (e.g. a race on the uniqueness
      // check above).
      await Company.deleteOne({ _id: company._id });
      throw userErr;
    }

    user.lastLoginAt = new Date();
    try {
      await user.save({ bypassDocumentValidation: true });
    } catch (saveErr) {
      console.warn('[signupCompany] could not update lastLoginAt (non-fatal):', saveErr.message);
    }

    await AuditLog.create({
      userId: user._id,
      action: 'signup_company',
      entityType: 'company',
      entityId: company._id,
      metadata: { companyName: company.name },
    });

    const tokens = signTokens(user);

    res.status(201).json({
      ...tokens,
      user: { id: user._id, name: user.name, email: user.email, role: effectiveRole(user) },
      company: { id: company._id, name: company.name, plan: company.plan },
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not create institution', detail: err.message });
  }
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
    try {
      // bypassDocumentValidation so this still works even when the Atlas
      // users validator hasn't been patched to include 'superadmin' (see
      // scripts/createSuperAdmin.js's patchUsersValidator). Without this,
      // a superadmin's very first login fails right here: the account
      // creation itself already bypasses the stale validator, but this
      // plain save() didn't, and MongoDB's default validationLevel is
      // 'strict' - it revalidates the whole document on every update,
      // even ones that don't touch the offending field.
      await user.save({ bypassDocumentValidation: true });
    } catch (saveErr) {
      // Tracking lastLoginAt is a nice-to-have, not a reason to block
      // someone from signing in - log it and let login continue.
      console.warn('[login] could not update lastLoginAt (non-fatal):', saveErr.message);
    }

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
      user: { id: user._id, name: user.name, email: user.email, role: effectiveRole(user) },
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

// GET /auth/me - current user profile (requireAuth already ran). Includes
// the company name and a live fraud_companies count for that tenant, so
// the frontend can show exactly which company/tenant this session belongs
// to and whether its fraud list is actually populated - the two things
// that are otherwise invisible when a scan mysteriously comes back with
// 0 matches.
//
// A superadmin has no companyId of its own (it's platform-level, not
// tied to a single tenant), so company/fraudListSize come back null/0 for
// that role instead - the frontend shows the institution picker there
// rather than a single tenant's fraud-list status.
async function me(req, res) {
  const user = await User.findById(req.user.id).select('-passwordHash').populate('companyId', 'name');
  if (!user) return res.status(404).json({ error: 'User not found' });

  const role = effectiveRole(user);
  // A superadmin is platform-level even if the stored document still has
  // a leftover companyId (e.g. promoted on a connection where $unset also
  // couldn't run) - don't let a stale field leak a tenant scope into the
  // response.
  const company = role === 'superadmin' ? null : user.companyId; // populated { _id, name } or null if unset
  const fraudListSize = company ? await FraudCompany.countDocuments({ companyId: company._id }) : 0;
  const institutionsCount = role === 'superadmin' ? await Company.countDocuments({}) : undefined;

  const { isSuperAdmin, ...rest } = user.toObject();

  res.json({
    ...rest,
    role,
    company: company ? { id: company._id, name: company.name } : null,
    fraudListSize,
    ...(institutionsCount !== undefined ? { institutionsCount } : {}),
  });
}

// POST /auth/forgot-password - identifier (email or mobile) -> emails a
// 6-digit code if an account exists. Always responds with the same generic
// message either way, so the endpoint can't be used to probe which emails
// are registered.
async function forgotPassword(req, res) {
  try {
    const { identifier } = req.body;
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'identifier (email or mobile) is required' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { mobile: identifier }],
    });

    // Codes only go out by email today (no SMS provider wired up), so a
    // mobile-only account still gets the generic response but no email.
    if (user && user.email) {
      const code = crypto.randomInt(100000, 1000000).toString(); // 6 digits
      user.resetCodeHash = await bcrypt.hash(code, 10);
      user.resetCodeExpires = new Date(Date.now() + RESET_CODE_TTL_MS);
      await user.save({ bypassDocumentValidation: true });

      try {
        await sendPasswordResetEmail({ to: user.email, code });
      } catch (mailErr) {
        // Don't leak mail-delivery failures to the client - same generic
        // response either way - but do log it server-side so it's not
        // silently swallowed.
        console.error('[forgotPassword] failed to send reset email:', mailErr.message);
      }

      await AuditLog.create({
        userId: user._id,
        action: 'forgot_password_requested',
        entityType: 'user',
        entityId: user._id,
      });
    }

    res.json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
  } catch (err) {
    res.status(500).json({ error: 'Could not process request', detail: err.message });
  }
}

// POST /auth/reset-password - identifier + code + newPassword -> verifies
// the code (hashed, time-limited) and sets a new password.
async function resetPassword(req, res) {
  try {
    const { identifier, code, newPassword } = req.body;

    if (!identifier || !code || !newPassword) {
      return res.status(400).json({ error: 'identifier, code, and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { mobile: identifier }],
    }).select('+resetCodeHash +resetCodeExpires');

    if (!user || !user.resetCodeHash || !user.resetCodeExpires) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    if (user.resetCodeExpires.getTime() < Date.now()) {
      user.resetCodeHash = undefined;
      user.resetCodeExpires = undefined;
      await user.save({ bypassDocumentValidation: true });
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const ok = await bcrypt.compare(code, user.resetCodeHash);
    if (!ok) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetCodeHash = undefined;
    user.resetCodeExpires = undefined;
    await user.save({ bypassDocumentValidation: true });

    await AuditLog.create({
      userId: user._id,
      action: 'password_reset',
      entityType: 'user',
      entityId: user._id,
    });

    res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not reset password', detail: err.message });
  }
}

module.exports = { signupCompany, register, login, refresh, me, forgotPassword, resetPassword };
