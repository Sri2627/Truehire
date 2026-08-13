const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, requireRole, resolveCompanyScope } = require('../middleware/auth');

// The roles a team member can actually be assigned here. Deliberately
// excludes 'superadmin' - that's a platform-level role granted only via
// scripts/createSuperAdmin.js, never through a per-institution screen
// (otherwise any tenant admin - or a superadmin acting on a tenant's
// behalf here - could hand out platform-wide access to themselves or a
// teammate).
const TEAM_ROLES = ['admin', 'recruiter', 'viewer'];

const router = express.Router();

router.use(requireAuth);
// A superadmin has no companyId of its own - resolveCompanyScope reads
// the x-company-id header (set by the frontend once an institution is
// selected on the Institutions screen) and fills req.user.companyId with
// it, so every `{ companyId: req.user.companyId }` query below works
// unchanged for a superadmin too, scoped to whichever institution they're
// currently viewing. Regular tenant users are left untouched (see
// middleware/auth.js).
router.use(resolveCompanyScope);

// GET /team - list team members and roles. A tenant's own admin sees
// their own team; a superadmin sees whichever institution's team they've
// selected. Optional ?search=... matches name/email (case-insensitive
// substring).
router.get('/', requireRole('admin', 'superadmin'), async (req, res) => {
  const match = { companyId: req.user.companyId };

  const { search } = req.query;
  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = { $regex: escaped, $options: 'i' };
    match.$or = [{ name: re }, { email: re }];
  }

  const team = await User.find(match).select('-passwordHash').sort({ name: 1 });
  res.json(team);
});

// POST /team - add a new teammate to the current institution (the caller's
// own company for a tenant admin, or whichever institution a superadmin
// has selected). Unlike POST /auth/register (self-serve, open), this
// always pins companyId to req.user.companyId - never something the
// request body can override.
router.post('/', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;

    if (!name || !password || (!email && !mobile)) {
      return res.status(400).json({ error: 'name, password, and email or mobile are required' });
    }
    if (role && !TEAM_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${TEAM_ROLES.join(', ')}` });
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
      companyId: req.user.companyId,
    });

    const { passwordHash: _omit, ...safeUser } = user.toObject();
    res.status(201).json(safeUser);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not add user' });
  }
});

// PATCH /team/:userId/role - change a team member's role, scoped to the
// current institution the same way as above.
router.patch('/:userId/role', requireRole('admin', 'superadmin'), async (req, res) => {
  const { role } = req.body;

  if (!TEAM_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${TEAM_ROLES.join(', ')}` });
  }

  const user = await User.findOneAndUpdate(
    { _id: req.params.userId, companyId: req.user.companyId },
    { role },
    { new: true }
  ).select('-passwordHash');

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
