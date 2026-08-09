const express = require('express');
const FraudCompany = require('../models/FraudCompany');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { normalizeCompanyName } = require('../utils/normalizeCompanyName');

const router = express.Router();

router.use(requireAuth);
// Whole fraud watch-list is admin-only, per spec - recruiters/viewers never
// see this screen or its data, only the pass/fail verdict it produces.
router.use(requireRole('admin'));

// GET /fraud?search=&page=&limit= - list the caller's tenant fraud
// watch-list, newest first, optionally filtered by a case-insensitive
// name match and paginated (default 10/page, max 100). Response is
// { items, total, page, limit, totalPages }.
router.get('/', async (req, res) => {
  const { search } = req.query;
  const query = { companyId: req.user.companyId };

  if (search && search.trim()) {
    // Escape regex special characters so a search like "3 Star (Pvt)" or
    // "a+b" doesn't blow up as an invalid pattern.
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.name = { $regex: escaped, $options: 'i' };
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    FraudCompany.find(query)
      .populate('addedBy', 'name email')
      .sort({ addedAt: -1 })
      .skip(skip)
      .limit(limit),
    FraudCompany.countDocuments(query),
  ]);

  res.json({ items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
});

// POST /fraud - add a new company to the watch-list.
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const normalizedName = normalizeCompanyName(name);

    const existing = await FraudCompany.findOne({
      companyId: req.user.companyId,
      normalizedName,
    });
    if (existing) {
      return res.status(409).json({ error: 'That company is already on the fraud watch-list' });
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
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not add fraud watch-list entry' });
  }
});

// DELETE /fraud/:id - remove an entry (e.g. added by mistake).
router.delete('/:id', async (req, res) => {
  const entry = await FraudCompany.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!entry) return res.status(404).json({ error: 'Fraud watch-list entry not found' });

  await FraudCompany.deleteOne({ _id: entry._id });

  await AuditLog.create({
    userId: req.user.id,
    action: 'remove_fraud_company',
    entityType: 'fraud_companies',
    entityId: entry._id,
    metadata: { name: entry.name },
  });

  res.status(204).end();
});

module.exports = router;
