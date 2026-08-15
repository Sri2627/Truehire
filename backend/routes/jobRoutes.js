const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');
const Screening = require('../models/Screening');
const Company = require('../models/Company');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole, resolveCompanyScope } = require('../middleware/auth');
const { computeMatchScore } = require('../utils/jobMatching');
const { PLAN_LIMITS, PLAN_LABELS } = require('../config/plans');

const router = express.Router();

router.use(requireAuth);
// Resolves a superadmin's selected institution (x-company-id header) into
// req.user.companyId so every query below keeps working unchanged. No-op
// for normal tenant users (their companyId already came from their JWT).
router.use(resolveCompanyScope);

// Shared by POST / and PATCH /:id - trims/lowercases/dedupes a raw
// interviewPanel array from the request body and rejects anything that
// isn't a plausible email address, or throws a string error message.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanInterviewPanel(interviewPanel) {
  if (!Array.isArray(interviewPanel)) {
    throw 'interviewPanel must be an array of email addresses';
  }
  const cleaned = [];
  const seen = new Set();
  for (const raw of interviewPanel) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) throw `"${email}" is not a valid email address`;
    if (!seen.has(email)) {
      seen.add(email);
      cleaned.push(email);
    }
  }
  return cleaned;
}

// Shared by POST / and PATCH /:id - turns a raw requiredSkills array from
// the request body into the { name, weight, minYears } shape the schema
// expects, or throws a string error message if it's malformed.
function cleanRequiredSkills(requiredSkills) {
  if (!Array.isArray(requiredSkills)) {
    throw 'requiredSkills must be an array of { name, weight, minYears }';
  }
  for (const s of requiredSkills) {
    if (!s.name || !s.name.trim()) throw 'Every required skill needs a name';
  }
  return requiredSkills.map((s) => ({
    name: s.name.trim(),
    weight: s.weight == null || s.weight === '' ? 10 : Number(s.weight),
    minYears: s.minYears == null || s.minYears === '' ? 0 : Number(s.minYears),
  }));
}

// GET /jobs - list job postings for the caller's company, each annotated
// with how many candidates have been registered against it (so the list
// doubles as a quick pipeline overview, and so the UI can warn before
// letting someone upload resumes against a job with 0 candidates so far).
// Optional ?search=... matches the job title (case-insensitive substring).
// Optional ?page=&limit= paginate the result (default 10/page, max 100) -
// response is { items, total, page, limit, totalPages }.
router.get('/', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
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
router.get('/:id', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const candidateCount = await Candidate.countDocuments({ jobId: job._id, companyId: req.user.companyId });
  res.json({ ...job.toObject(), candidateCount });
});

// GET /jobs/:id/matches - ranks every candidate registered against this
// job by a deterministic 0-100 match score (utils/jobMatching.js): weighted
// required skills (using each candidate's stated-or-timeline-derived
// years) plus optional overall experience. No AI - every number here
// traces back to the job's stated requirements and the candidate's
// stored skills, with a per-candidate matched/missing/exceeding
// breakdown alongside the score. Requires the job to have at least one
// required skill configured.
router.get('/:id/matches', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (!job.requiredSkills || job.requiredSkills.length === 0) {
    return res.status(400).json({ error: 'Add required skills to this job before ranking candidates against it' });
  }

  const candidates = await Candidate.find({ jobId: job._id, companyId: req.user.companyId });

  // Latest screening per candidate, so a flagged (possible-fraud) resume
  // never shows up in a ranking meant to help pick who to move forward
  // with. Candidates who haven't been screened yet still show (there's
  // nothing to hide there) - only a confirmed "flagged" verdict excludes.
  const screenings = await Screening.find({ candidateId: { $in: candidates.map((c) => c._id) } }).sort({ screenedAt: -1 });
  const latestScreeningByCandidate = new Map();
  for (const s of screenings) {
    const key = String(s.candidateId);
    if (!latestScreeningByCandidate.has(key)) latestScreeningByCandidate.set(key, s);
  }

  const ranked = candidates
    .filter((c) => latestScreeningByCandidate.get(String(c._id))?.verdict !== 'flagged')
    .map((c) => {
      const latestScreening = latestScreeningByCandidate.get(String(c._id));
      return {
        candidate: {
          _id: c._id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          skills: c.skills,
          totalYearsExperience: c.totalYearsExperience,
          careerFlags: c.careerFlags,
          screeningVerdict: latestScreening?.verdict || null,
          // So the Matches page can offer a "View resume" link per
          // candidate without a second round-trip - see
          // GET /candidates/:id/resume.
          hasResume: !!c.resumeFileKey,
        },
        ...computeMatchScore(job, c),
      };
    })
    .sort((a, b) => b.score - a.score);

  res.json({
    job: {
      _id: job._id,
      title: job.title,
      requiredSkills: job.requiredSkills,
      minExperienceYears: job.minExperienceYears,
      interviewPanel: job.interviewPanel,
    },
    ranked,
  });
});

// POST /jobs - create a job posting (title + JD text, plus optional
// requiredSkills / minExperienceYears used by the matching engine above).
// Candidates are registered against one of these, so this has to exist
// first.
router.post('/', requireRole('admin', 'recruiter'), async (req, res) => {
  const { title, description, requiredSkills, minExperienceYears, interviewPanel } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A job title is required' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'A job description is required' });

  // Plan enforcement - not just a number on the pricing page. A company
  // on the free plan (10 jobs) genuinely cannot post an 11th until they
  // close/delete one or upgrade.
  const company = await Company.findById(req.user.companyId);
  const jobLimit = PLAN_LIMITS[company?.plan]?.jobs ?? PLAN_LIMITS.free.jobs;
  if (Number.isFinite(jobLimit)) {
    const currentJobCount = await Job.countDocuments({ companyId: req.user.companyId });
    if (currentJobCount >= jobLimit) {
      return res.status(403).json({
        error: `Your ${PLAN_LABELS[company?.plan] || 'Free'} plan allows up to ${jobLimit} job posting${jobLimit === 1 ? '' : 's'}. Upgrade your plan to post more.`,
      });
    }
  }

  let cleanedSkills = [];
  if (requiredSkills !== undefined) {
    try {
      cleanedSkills = cleanRequiredSkills(requiredSkills);
    } catch (msg) {
      return res.status(400).json({ error: msg });
    }
  }

  let cleanedPanel = [];
  if (interviewPanel !== undefined) {
    try {
      cleanedPanel = cleanInterviewPanel(interviewPanel);
    } catch (msg) {
      return res.status(400).json({ error: msg });
    }
  }

  const job = await Job.create({
    title: title.trim(),
    description: description.trim(),
    requiredSkills: cleanedSkills,
    minExperienceYears: minExperienceYears === '' || minExperienceYears == null ? undefined : Number(minExperienceYears),
    interviewPanel: cleanedPanel,
    companyId: req.user.companyId,
    createdBy: req.user.id,
  });

  await AuditLog.create({
    userId: req.user.id,
    action: 'create_job',
    entityType: 'job',
    entityId: job._id,
    metadata: { title: job.title, requiredSkillCount: cleanedSkills.length },
  });

  res.status(201).json(job);
});

// PATCH /jobs/:id - edit a job posting's title, description, required
// skills, and/or minimum experience. Only fields present in the body are
// touched, so this doubles as both "edit everything" and "just tweak the
// required skills" without a separate endpoint for each. Status has its
// own dedicated route below since it's a one-click toggle, not a form.
router.patch('/:id', requireRole('admin', 'recruiter'), async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { title, description, requiredSkills, minExperienceYears, interviewPanel } = req.body;
  const update = {};

  if (title !== undefined) {
    if (!title.trim()) return res.status(400).json({ error: 'A job title is required' });
    update.title = title.trim();
  }

  if (description !== undefined) {
    if (!description.trim()) return res.status(400).json({ error: 'A job description is required' });
    update.description = description.trim();
  }

  if (requiredSkills !== undefined) {
    try {
      update.requiredSkills = cleanRequiredSkills(requiredSkills);
    } catch (msg) {
      return res.status(400).json({ error: msg });
    }
  }

  if (interviewPanel !== undefined) {
    try {
      update.interviewPanel = cleanInterviewPanel(interviewPanel);
    } catch (msg) {
      return res.status(400).json({ error: msg });
    }
  }

  if (minExperienceYears !== undefined) {
    update.minExperienceYears = minExperienceYears === '' || minExperienceYears == null ? undefined : Number(minExperienceYears);
  }

  Object.assign(job, update);
  // minExperienceYears needs an explicit unset when cleared to '' - a
  // plain assign leaves the old value in place under Mongoose because
  // `undefined` is treated as "don't touch this key", not "clear it".
  if (minExperienceYears === '' || minExperienceYears === null) {
    job.minExperienceYears = undefined;
  }
  await job.save();

  await AuditLog.create({
    userId: req.user.id,
    action: 'edit_job',
    entityType: 'job',
    entityId: job._id,
    metadata: { fields: Object.keys(update) },
  });

  res.json(job);
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
