const express = require('express');
const Job = require('../models/Job');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /jobs - list job postings for the caller's company.
router.get('/', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const jobs = await Job.find({ companyId: req.user.companyId }).sort({ createdAt: -1 });
  res.json(jobs);
});

// GET /jobs/:id
router.get('/:id', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// POST /jobs - create a job posting (title + JD text). Candidates are
// registered against one of these, so this has to exist first.
router.post('/', requireRole('admin', 'recruiter'), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A job title is required' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'A job description is required' });

  const job = await Job.create({
    title: title.trim(),
    description: description.trim(),
    companyId: req.user.companyId,
    createdBy: req.user.id,
  });

  await AuditLog.create({
    userId: req.user.id,
    action: 'create_job',
    entityType: 'job',
    entityId: job._id,
    metadata: { title: job.title },
  });

  res.status(201).json(job);
});

// PATCH /jobs/:id/status - open/close a posting.
router.patch('/:id/status', requireRole('admin', 'recruiter'), async (req, res) => {
  const { status } = req.body;
  if (!['open', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status must be "open" or "closed"' });
  }

  const job = await Job.findOneAndUpdate(
    { _id: req.params.id, companyId: req.user.companyId },
    { status },
    { new: true }
  );
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

module.exports = router;
