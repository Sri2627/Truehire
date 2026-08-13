const express = require('express');
const FraudCompany = require('../models/FraudCompany');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole, resolveCompanyScope } = require('../middleware/auth');
const { normalizeCompanyName } = require('../utils/normalizeCompanyName');

const router = express.Router();

router.use(requireAuth);
// Whole fraud watch-list is admin-only, per spec - recruiters/viewers never
// see this screen or its data, only the pass/fail verdict it produces.
// superadmin can also read it (any institution's list, chosen via
// resolveCompanyScope below) so the platform team can see every tenant's
// watch-list, but write actions further down are still admin-only.
router.use(requireRole('admin', 'superadmin'));
router.use(resolveCompanyScope);

// GET /fraud?search=&page=&limit= - list the caller's tenant fraud
// watch-list, newest first, optionally filtered by a case-insensitive
// name match and paginated (default 10/page, max 100). Response is
// { items, total, page, limit, totalPages }.
//
// Only source: 'manual_entry' rows are returned - i.e. only what this
// tenant's own admin has actually added through this screen. The
// fake-institutions spreadsheet loaded once at setup time by
// scripts/seedFraudList.js writes source: 'excel_upload' rows under the
// same companyId, and a client admin has no way to tell those apart from
// their own entries unless they're filtered out here.
router.get('/', async (req, res) => {
  const { search } = req.query;
  const query = { companyId: req.user.companyId, source: 'manual_entry' };

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

// POST /fraud - add a new company to the watch-list. Write actions stay
// admin-only even though superadmin can read this list (see router.use
// above) — a superadmin is a viewer of every tenant, not an editor of one.
router.post('/', requireRole('admin'), async (req, res) => {
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

// DELETE /fraud/:id - remove an entry (e.g. added by mistake). Admin-only,
// same reasoning as POST above.
router.delete('/:id', requireRole('admin'), async (req, res) => {
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
