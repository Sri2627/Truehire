const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /team - list team members and roles (admin only, per spec Screen 14).
router.get('/', requireRole('admin'), async (req, res) => {
  const team = await User.find({ companyId: req.user.companyId }).select('-passwordHash');
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
