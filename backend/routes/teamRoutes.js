const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /team - list team members and roles (admin only, per spec Screen 14).
// Optional ?search=... matches name/email (case-insensitive substring).
router.get('/', requireRole('admin'), async (req, res) => {
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

// POST /team - admin adds a new teammate directly to their own company.
// Unlike POST /auth/register (self-serve, open), this always pins
// companyId to the calling admin's own company - an admin can only add
// users into their own tenant, never someone else's.
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;
    const { ROLES } = require('../models/User');

    if (!name || !password || (!email && !mobile)) {
      return res.status(400).json({ error: 'name, password, and email or mobile are required' });
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
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

// PATCH /team/:userId/role - change a team member's role (admin only).
router.patch('/:userId/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  const { ROLES } = require('../models/User');

  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
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
