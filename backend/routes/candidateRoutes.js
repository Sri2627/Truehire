const express = require('express');
const Candidate = require('../models/Candidate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All candidate routes require a valid JWT.
router.use(requireAuth);

// GET /candidates - list/search candidates for the caller's company.
// admin, recruiter, and viewer can all read.
router.get('/', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const candidates = await Candidate.find({ companyId: req.user.companyId }).sort({ createdAt: -1 });
  res.json(candidates);
});

// POST /candidates - create a candidate record.
// viewers are read-only, so this is admin/recruiter only.
router.post('/', requireRole('admin', 'recruiter'), async (req, res) => {
  const { name, email, phone, resumeFileKey, extractedText } = req.body;

  const candidate = await Candidate.create({
    name,
    email,
    phone,
    resumeFileKey,
    extractedText,
    companyId: req.user.companyId,
    createdBy: req.user.id,
  });

  res.status(201).json(candidate);
});

// GET /candidates/:id - full candidate detail.
router.get('/:id', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  res.json(candidate);
});

module.exports = router;
