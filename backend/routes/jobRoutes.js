const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /jobs - list job postings for the caller's company, each annotated
// with how many candidates have been registered against it (so the list
// doubles as a quick pipeline overview, and so the UI can warn before
// letting someone upload resumes against a job with 0 candidates so far).
// Optional ?search=... matches the job title (case-insensitive substring).
// Optional ?page=&limit= paginate the result (default 10/page, max 100) -
// response is { items, total, page, limit, totalPages }.
router.get('/', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const match = { companyId };
  const { search } = req.query;
  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.title = { $regex: escaped, $options: 'i' };
  }

  const [result] = await Job.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'candidates',
        let: { jid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$jobId', '$$jid'] } } }, { $count: 'count' }],
        as: 'candidateCount',
      },
    },
    {
      $addFields: {
        candidateCount: { $ifNull: [{ $arrayElemAt: ['$candidateCount.count', 0] }, 0] },
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

// GET /jobs/:id
router.get('/:id', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const candidateCount = await Candidate.countDocuments({ jobId: job._id, companyId: req.user.companyId });
  res.json({ ...job.toObject(), candidateCount });
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

// DELETE /jobs/:id - only allowed when the job has no candidates
// registered against it. Once a candidate is attached to a job, deleting
// the job would orphan that candidate's jobId reference, so this is
// blocked server-side (not just hidden in the UI) rather than allowed.
router.delete('/:id', requireRole('admin', 'recruiter'), async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const candidateCount = await Candidate.countDocuments({ jobId: job._id, companyId: req.user.companyId });
  if (candidateCount > 0) {
    return res.status(400).json({ error: 'Cannot delete a job with candidates registered against it' });
  }

  await Job.deleteOne({ _id: job._id });

  await AuditLog.create({
    userId: req.user.id,
    action: 'delete_job',
    entityType: 'job',
    entityId: job._id,
    metadata: { title: job.title },
  });

  res.status(204).end();
});

module.exports = router;
