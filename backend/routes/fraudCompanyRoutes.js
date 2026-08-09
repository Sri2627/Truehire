const express = require('express');
const FraudCompany = require('../models/FraudCompany');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { normalizeCompanyName } = require('../utils/normalizeCompanyName');

const router = express.Router();

router.use(requireAuth);
// The fraud watch-list is sensitive (it's effectively an accusation list) -
// admin only, both to view and to edit, per the spec.
router.use(requireRole('admin'));

const MAX_PAGE_SIZE = 100;

// GET /fraud-companies?search=&page=&limit= - paginated, optionally
// filtered by name substring. companyId always comes from the session,
// never the client, so one tenant can never browse another's list.
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const search = (req.query.search || '').trim();

  const filter = { companyId: req.user.companyId };
  if (search) {
    // Search against normalizedName so "pvt ltd" / punctuation differences
    // in the query don't cause misses - same normalization as matching.
    const normalizedSearch = normalizeCompanyName(search);
    filter.normalizedName = { $regex: normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const [entries, total] = await Promise.all([
    FraudCompany.find(filter)
      .sort({ addedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    FraudCompany.countDocuments(filter),
  ]);

  res.json({ entries, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// POST /fraud-companies - add a new entry manually. Rejects an exact
// duplicate (by normalized name) within the same tenant rather than
// silently creating a second row for the same company.
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'A company name is required' });
  }

  const normalizedName = normalizeCompanyName(name);
  if (!normalizedName) {
    return res.status(400).json({ error: 'That name has no usable characters after normalization' });
  }

  const existing = await FraudCompany.findOne({ companyId: req.user.companyId, normalizedName });
  if (existing) {
    return res.status(409).json({ error: `"${existing.name}" is already on the fraud watch-list`, entry: existing });
  }

  const entry = await FraudCompany.create({
    name: name.trim(),
    normalizedName,
    companyId: req.user.companyId,
    source: 'manual_entry',
    addedBy: req.user.id,
  });

  await AuditLog.create({
    userId: req.user.id,
    action: 'add_fraud_company',
    entityType: 'fraud_companies',
    entityId: entry._id,
    metadata: { name: entry.name },
  });

  res.status(201).json(entry);
});

module.exports = router;
