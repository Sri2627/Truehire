const express = require('express');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /team - list team members and roles (admin only, per spec Screen 14).
router.get('/', requireRole('admin'), async (req, res) => {
  const team = await User.find({ companyId: req.user.companyId }).select('-passwordHash');
  res.json(team);
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
