const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');
const FraudCompany = require('../models/FraudCompany');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
// Platform-level screen — only the superadmin can see the list of
// institutions (tenants) at all, let alone add a new one.
router.use(requireRole('superadmin'));

// GET /institutions?search=&page=&limit= - every institution on the
// platform, newest first, each annotated with how many users/jobs/
// candidates/fraud-watch-list entries it has, so the superadmin can see
// at a glance which tenants are actually active. Optional ?search=
// matches the institution name (case-insensitive substring).
router.get('/', async (req, res) => {
  const match = {};
  const { search } = req.query;
  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.name = { $regex: escaped, $options: 'i' };
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const [result] = await Company.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'users',
        let: { cid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$companyId', '$$cid'] } } }, { $count: 'count' }],
        as: 'userCount',
      },
    },
    {
      $lookup: {
        from: 'jobs',
        let: { cid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$companyId', '$$cid'] } } }, { $count: 'count' }],
        as: 'jobCount',
      },
    },
    {
      $lookup: {
        from: 'candidates',
        let: { cid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$companyId', '$$cid'] } } }, { $count: 'count' }],
        as: 'candidateCount',
      },
    },
    {
      $lookup: {
        from: 'fraud_companies',
        let: { cid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$companyId', '$$cid'] } } }, { $count: 'count' }],
        as: 'fraudCount',
      },
    },
    {
      $addFields: {
        userCount: { $ifNull: [{ $arrayElemAt: ['$userCount.count', 0] }, 0] },
        jobCount: { $ifNull: [{ $arrayElemAt: ['$jobCount.count', 0] }, 0] },
        candidateCount: { $ifNull: [{ $arrayElemAt: ['$candidateCount.count', 0] }, 0] },
        fraudCount: { $ifNull: [{ $arrayElemAt: ['$fraudCount.count', 0] }, 0] },
      },
    },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const total = result.totalCount[0]?.count || 0;
  res.json({ items: result.items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
});

// GET /institutions/:id - single institution's detail + stats, plus its
// team list (name/email/role only — no password hashes).
router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid institution id' });
  }

  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ error: 'Institution not found' });

  const [userCount, jobCount, candidateCount, fraudCount, team] = await Promise.all([
    User.countDocuments({ companyId: company._id }),
    Job.countDocuments({ companyId: company._id }),
    Candidate.countDocuments({ companyId: company._id }),
    FraudCompany.countDocuments({ companyId: company._id }),
    User.find({ companyId: company._id }).select('-passwordHash').sort({ name: 1 }),
  ]);

  res.json({ ...company.toObject(), userCount, jobCount, candidateCount, fraudCount, team });
});

// POST /institutions - create a brand new institution (tenant). Optionally
// creates its first admin user in the same request (name + password +
// email/mobile) — same shape as POST /auth/signup, just superadmin-
// initiated instead of self-serve. The admin fields are optional: a
// superadmin can create a bare institution now and invite an admin later.
router.post('/', async (req, res) => {
  try {
    const { name, plan, admin } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'An institution name is required' });
    }

    const existing = await Company.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ error: 'An institution with that name already exists' });
    }

    const company = await Company.create({
      name: name.trim(),
      plan: ['free', 'pro', 'enterprise'].includes(plan) ? plan : undefined,
    });

    let createdAdmin = null;
    if (admin && (admin.name || admin.email || admin.mobile)) {
      const { name: adminName, email, mobile, password } = admin;
      if (!adminName || !password || (!email && !mobile)) {
        // Roll back the bare company too — a half-filled "add admin" form
        // shouldn't leave an orphan tenant behind.
        await Company.deleteOne({ _id: company._id });
        return res.status(400).json({ error: 'Admin name, password, and email or mobile are required to add an admin' });
      }

      const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
      if (existingUser) {
        await Company.deleteOne({ _id: company._id });
        return res.status(409).json({ error: 'A user with that email or mobile already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        name: adminName,
        email,
        mobile,
        passwordHash,
        role: 'admin',
        companyId: company._id,
      });
      const { passwordHash: _omit, ...safeUser } = user.toObject();
      createdAdmin = safeUser;
    }

    await AuditLog.create({
      userId: req.user.id,
      action: 'create_institution',
      entityType: 'company',
      entityId: company._id,
      metadata: { name: company.name, adminCreated: !!createdAdmin },
    });

    res.status(201).json({ ...company.toObject(), admin: createdAdmin });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create institution' });
  }
});

module.exports = router;
