const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const mammoth = require('mammoth');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const Company = require('../models/Company');
const Screening = require('../models/Screening');
const UanRecord = require('../models/UanRecord');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole, resolveCompanyScope } = require('../middleware/auth');
const { upload, UPLOAD_DIR, MAX_BULK_FILES, MAX_BULK_SIZE } = require('../middleware/upload');
const { extractResumeText } = require('../utils/extractResumeText');
const { guessEmailFromText, guessPhoneFromText } = require('../utils/contactExtraction');
const { computeMatchScore } = require('../utils/jobMatching');
const { computePanelOutcome } = require('../utils/panelOutcome');
const { computeHiringRecommendation } = require('../utils/hiringRecommendation');
const { PLAN_LIMITS, PLAN_LABELS } = require('../config/plans');
const InterviewInvite = require('../models/InterviewInvite');
const JobApplication = require('../models/JobApplication');
const { runScreening } = require('../utils/runScreening');
const { removeUploadedFile } = require('../utils/removeUploadedFile');

const router = express.Router();

// All candidate routes require a valid JWT.
router.use(requireAuth);
// Resolves a superadmin's selected institution (x-company-id header) into
// req.user.companyId so every `{ companyId: req.user.companyId }` query
// below keeps working unchanged. No-op for normal tenant users.
router.use(resolveCompanyScope);

// Bulk upload has no per-file name/email/phone form fields (it's just a
// pile of resumes), so best-effort-guess all three: the email/phone from
// the extracted resume text, and the name from the file name (recruiters
// near-universally name resume files after the candidate, e.g.
// "Jane_Doe_Resume.pdf").
function guessNameFromFilename(originalName) {
  const base = path.basename(originalName, path.extname(originalName));
  const cleaned = base
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b(resume|cv|final|updated|copy|new)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Unnamed candidate';
  return cleaned
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// GET /candidates - list/search candidates for the caller's company,
// each with its most recent screening verdict (if any) for the list badge
// and its job's title (candidates are always registered against a job).
// Optional ?jobId=... narrows the list to a single job posting's pipeline.
// Optional ?search=... matches name/email/phone (case-insensitive
// substring). Optional ?page=&limit= paginate the result (default 10/page,
// max 100) - response is { items, total, page, limit, totalPages }.
// admin, recruiter, and viewer can all read.
router.get('/', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const match = { companyId };
  if (req.query.jobId) {
    if (!mongoose.isValidObjectId(req.query.jobId)) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }
    match.jobId = new mongoose.Types.ObjectId(req.query.jobId);
  }

  const { search } = req.query;
  if (search && search.trim()) {
    // Escape regex special characters so a search like "a+b" or "(pvt)"
    // doesn't blow up as an invalid pattern.
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = { $regex: escaped, $options: 'i' };
    match.$or = [{ name: re }, { email: re }, { phone: re }];
  }

  const [result] = await Candidate.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'screenings',
        let: { cid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$candidateId', '$$cid'] } } },
          { $sort: { screenedAt: -1 } },
          { $limit: 1 },
          { $project: { verdict: 1, screenedAt: 1, fraudMatches: 1, fraudListSize: 1 } },
        ],
        as: 'latestScreening',
      },
    },
    { $addFields: { latestScreening: { $arrayElemAt: ['$latestScreening', 0] } } },
    {
      $lookup: {
        from: 'jobs',
        localField: 'jobId',
        foreignField: '_id',
        as: 'job',
      },
    },
    { $addFields: { job: { $arrayElemAt: ['$job', 0] } } },
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

// GET /candidates/stats - lightweight counts for the dashboard (total,
// verified, flagged, in-progress) - computed server-side via aggregation
// so the dashboard doesn't have to pull every candidate record just to
// count them, now that the list itself is paginated.
router.get('/stats', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  const [result] = await Candidate.aggregate([
    { $match: { companyId } },
    {
      $lookup: {
        from: 'screenings',
        let: { cid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$candidateId', '$$cid'] } } },
          { $sort: { screenedAt: -1 } },
          { $limit: 1 },
          { $project: { verdict: 1 } },
        ],
        as: 'latestScreening',
      },
    },
    { $addFields: { verdict: { $arrayElemAt: ['$latestScreening.verdict', 0] } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        verified: { $sum: { $cond: [{ $eq: ['$verdict', 'clear'] }, 1, 0] } },
        flagged: { $sum: { $cond: [{ $eq: ['$verdict', 'flagged'] }, 1, 0] } },
      },
    },
  ]);

  const total = result?.total || 0;
  const verified = result?.verified || 0;
  const flagged = result?.flagged || 0;
  res.json({ total, verified, flagged, inProgress: total - verified - flagged });
});

// POST /candidates - create a candidate record AND screen their resume in
// the same request, mirroring ProfileXRay: pick a file, get a verdict.
// Requires a resume (multipart, field name "resume", PDF or DOCX) - a
// candidate cannot be registered without one. If extraction/screening
// fails after the candidate record is created, the candidate is rolled
// back so there's never an orphan "registered but never screened" record.
// viewers are read-only, so this is admin/recruiter only.
// Shared by POST / and POST /bulk - how many more candidates this tenant
// can register before hitting its plan's cap. `limit: Infinity` (from an
// enterprise/unrecognized plan) means unlimited.
async function getCandidateQuota(companyId) {
  const company = await Company.findById(companyId);
  const limit = PLAN_LIMITS[company?.plan]?.candidates ?? PLAN_LIMITS.free.candidates;
  const planLabel = PLAN_LABELS[company?.plan] || 'Free';
  if (!Number.isFinite(limit)) return { limit: Infinity, remaining: Infinity, planLabel };
  const current = await Candidate.countDocuments({ companyId });
  return { limit, remaining: Math.max(limit - current, 0), planLabel };
}

router.post('/', requireRole('admin', 'recruiter'), upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A resume file (PDF or DOCX) is required to register a candidate' });
  }

  const { name, email, phone, jobId } = req.body;

  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    removeUploadedFile(req.file.path);
    return res.status(400).json({ error: 'A jobId is required — register the candidate against a job posting' });
  }

  let job;
  let quota;
  try {
    job = await Job.findOne({ _id: jobId, companyId: req.user.companyId });
    if (job) quota = await getCandidateQuota(req.user.companyId);
  } catch (err) {
    removeUploadedFile(req.file.path);
    throw err;
  }
  if (!job) {
    removeUploadedFile(req.file.path);
    return res.status(404).json({ error: 'Job not found' });
  }

  // Plan enforcement - a company on the free plan (100 candidates) cannot
  // register a 101st until they upgrade.
  if (quota.remaining <= 0) {
    removeUploadedFile(req.file.path);
    return res.status(403).json({
      error: `Your ${quota.planLabel} plan allows up to ${quota.limit} candidate${quota.limit === 1 ? '' : 's'}. Upgrade your plan to register more.`,
    });
  }

  let candidate;
  let screening;
  try {
    // Extracted once up front (rather than letting runScreening extract it
    // again below) so a name/email/phone left blank on the form can fall
    // back to whatever's actually on the resume, the same way bulk upload
    // already does. A value the recruiter did type always wins.
    const extractedText = await extractResumeText(fs.readFileSync(req.file.path), req.file.originalname);

    candidate = await Candidate.create({
      name: name || guessNameFromFilename(req.file.originalname),
      email: email || guessEmailFromText(extractedText),
      phone: phone || guessPhoneFromText(extractedText),
      jobId: job._id,
      companyId: req.user.companyId,
      createdBy: req.user.id,
    });

    screening = await runScreening({ candidate, file: req.file, userId: req.user.id, extractedText });
    res.status(201).json({ candidate, screening });
  } catch (err) {
    if (req.file) removeUploadedFile(req.file.path);
    if (candidate) {
      await Screening.deleteMany({ candidateId: candidate._id });
      await Candidate.deleteOne({ _id: candidate._id });
    }
    if (err.code === 11000) return res.status(409).json({ error: 'A candidate with that identifier already exists' });
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('[candidate upload] failed:', err.message);
    res.status(500).json({ error: 'Could not register candidate' });
  }
});

// POST /candidates/bulk - register + screen many resumes at once against a
// single job posting. Field name "resumes" (multipart, up to 20 files per
// request), plus a jobId. Each file becomes its own candidate: name is
// guessed from the file name, email from the resume text if present, and
// each one is screened against the fraud watch-list exactly like a single
// upload. One bad file (unreadable, wrong type) does not fail the whole
// batch — it's reported per-file in the response so the rest still land.
// admin/recruiter only, same as single-candidate registration.
router.post('/bulk', requireRole('admin', 'recruiter'), upload.array('resumes', MAX_BULK_FILES), async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: 'At least one resume file (PDF or DOCX) is required' });
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BULK_SIZE) {
    files.forEach((file) => removeUploadedFile(file.path));
    return res.status(413).json({ error: 'A bulk upload may not exceed 50MB total' });
  }

  const { jobId } = req.body;
  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    files.forEach((f) => removeUploadedFile(f.path));
    return res.status(400).json({ error: 'A jobId is required — bulk-upload resumes against a job posting' });
  }

  let job;
  let quota;
  try {
    job = await Job.findOne({ _id: jobId, companyId: req.user.companyId });
    if (job) quota = await getCandidateQuota(req.user.companyId);
  } catch (err) {
    files.forEach((file) => removeUploadedFile(file.path));
    throw err;
  }
  if (!job) {
    files.forEach((f) => removeUploadedFile(f.path));
    return res.status(404).json({ error: 'Job not found' });
  }

  // Plan enforcement - only process as many files as the remaining quota
  // allows; the rest are reported per-file as skipped (same partial-
  // success shape as an unreadable file below), not a hard all-or-nothing
  // failure of the whole batch.
  const filesToProcess = Number.isFinite(quota.remaining) ? files.slice(0, quota.remaining) : files;
  const filesOverQuota = Number.isFinite(quota.remaining) ? files.slice(quota.remaining) : [];
  filesOverQuota.forEach((f) => removeUploadedFile(f.path));

  // Processed sequentially rather than in parallel: each file already does
  // a decent amount of work (text extraction + fraud-list matching + a few
  // writes), and keeping it sequential avoids hammering the DB/CPU with 20
  // concurrent PDF parses from one request.
  const results = [];
  for (const file of filesToProcess) {
    let candidate;
    try {
      const extractedText = await extractResumeText(fs.readFileSync(file.path), file.originalname);

      candidate = await Candidate.create({
        name: guessNameFromFilename(file.originalname),
        email: guessEmailFromText(extractedText),
        phone: guessPhoneFromText(extractedText),
        jobId: job._id,
        companyId: req.user.companyId,
        createdBy: req.user.id,
      });

      const screening = await runScreening({ candidate, file, userId: req.user.id, extractedText });
      results.push({
        fileName: file.originalname,
        success: true,
        candidate,
        screening,
      });
    } catch (err) {
      removeUploadedFile(file.path);
      if (candidate) {
        await Screening.deleteMany({ candidateId: candidate._id });
        await Candidate.deleteOne({ _id: candidate._id });
      }
      results.push({
        fileName: file.originalname,
        success: false,
        error: err.message || 'Could not process this resume',
      });
    }
  }

  filesOverQuota.forEach((f) => {
    results.push({
      fileName: f.originalname,
      success: false,
      error: `Skipped — your ${quota.planLabel} plan allows up to ${quota.limit} candidate${quota.limit === 1 ? '' : 's'} and that limit was reached partway through this batch. Upgrade your plan to register the rest.`,
    });
  });

  const succeeded = results.filter((r) => r.success).length;

  await AuditLog.create({
    userId: req.user.id,
    action: 'bulk_upload_resumes',
    entityType: 'job',
    entityId: job._id,
    metadata: { jobTitle: job.title, fileCount: files.length, succeeded, failed: files.length - succeeded },
  });

  res.status(201).json({ jobId: job._id, total: files.length, succeeded, failed: files.length - succeeded, results });
});

// GET /candidates/:id - full candidate detail.
router.get('/:id', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  res.json(candidate);
});

// GET /candidates/:id/resume - streams the candidate's stored resume file
// (PDF or DOCX, whatever was last uploaded/screened) back to the caller.
// Same read roles as the rest of this file, including superadmin viewing
// whichever institution it currently has selected. "inline" so a browser
// tab renders a PDF directly instead of forcing a download, while DOCX
// (which browsers can't render inline) still comes through with its real
// file name for the OS to open.
router.get('/:id/resume', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (!candidate.resumeFileKey) {
    return res.status(404).json({ error: 'No resume has been uploaded for this candidate' });
  }

  const filePath = path.join(UPLOAD_DIR, candidate.resumeFileKey);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Resume file is missing from storage' });
  }

  const ext = path.extname(candidate.resumeFileKey).toLowerCase();
  const downloadName = `${(candidate.name || 'resume').replace(/[^\w\- ]+/g, '').trim() || 'resume'}${ext}`;
  const contentType = ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Very small allowlist-style sanitizer for mammoth's docx->HTML output,
// used only by GET /:id/resume-preview below. mammoth doesn't carry over
// <script>/<style> tags or event-handler attributes from a docx in the
// first place, but resume files are user-uploaded, and this HTML gets
// rendered with dangerouslySetInnerHTML on the frontend - so strip
// anything script-capable defensively rather than trust that.
function sanitizeResumeHtml(html) {
  return html
    .replace(/<\/?(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '');
}

// GET /candidates/:id/resume-preview - for a DOCX resume, converts it to
// HTML (via mammoth, already used for text extraction elsewhere in this
// file) so the frontend can render an inline preview instead of forcing a
// download. Not needed for PDFs - the browser can render those directly
// from the /resume route's bytes in an <iframe>.
router.get('/:id/resume-preview', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (!candidate.resumeFileKey) {
    return res.status(404).json({ error: 'No resume has been uploaded for this candidate' });
  }

  const ext = path.extname(candidate.resumeFileKey).toLowerCase();
  if (ext !== '.docx') {
    return res.status(400).json({ error: 'HTML preview is only available for .docx resumes — PDFs render directly' });
  }

  const filePath = path.join(UPLOAD_DIR, candidate.resumeFileKey);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Resume file is missing from storage' });
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.convertToHtml({ buffer });
    res.json({ html: sanitizeResumeHtml(result.value) });
  } catch (err) {
    res.status(500).json({ error: 'Could not render a preview for this resume', detail: err.message });
  }
});


// existing candidate, extract its text, and check it line-by-line against
// the fraud watch-list (same exact-line-match rule as the original
// ProfileXRay tool).
router.post(
  '/:id/screen',
  requireRole('admin', 'recruiter'),
  upload.single('resume'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'A resume file (PDF or DOCX) is required' });
    }

    try {
      const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!candidate) {
        removeUploadedFile(req.file.path);
        return res.status(404).json({ error: 'Candidate not found' });
      }

      const screening = await runScreening({ candidate, file: req.file, userId: req.user.id });
      res.status(201).json({ candidate, screening });
    } catch (err) {
      if (req.file) removeUploadedFile(req.file.path);
      res.status(400).json({ error: err.message || 'Screening failed' });
    }
  }
);

// GET /candidates/:id/screenings - screening history for a candidate,
// most recent first.
router.get('/:id/screenings', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const screenings = await Screening.find({ candidateId: candidate._id })
    .populate('fraudMatches.fraudCompanyId', 'name')
    .sort({ screenedAt: -1 });

  res.json(screenings);
});

// PATCH /candidates/:id - edit name/email/phone, or correct the
// auto-extracted skills/totalYearsExperience (recruiter override - marks
// edited entries source: 'manual' so it's clear they're no longer the
// machine's guess). Resume, job, and screening history go through their
// own dedicated routes.
router.patch('/:id', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const { name, email, phone, skills, totalYearsExperience } = req.body;
  if (name !== undefined) candidate.name = name;
  if (email !== undefined) candidate.email = email;
  if (phone !== undefined) candidate.phone = phone;

  if (skills !== undefined) {
    if (!Array.isArray(skills)) return res.status(400).json({ error: 'skills must be an array of { name, years }' });
    for (const s of skills) {
      if (!s.name || !s.name.trim()) return res.status(400).json({ error: 'Every skill needs a name' });
    }
    candidate.skills = skills.map((s) => ({
      name: s.name.trim(),
      years: s.years == null || s.years === '' ? undefined : Number(s.years),
      source: 'manual',
    }));
  }

  if (totalYearsExperience !== undefined) {
    candidate.totalYearsExperience = totalYearsExperience === '' || totalYearsExperience == null ? undefined : Number(totalYearsExperience);
    candidate.totalYearsExperienceSource = candidate.totalYearsExperience == null ? undefined : 'manual';
  }

  try {
    await candidate.save();
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not update candidate' });
  }

  await AuditLog.create({
    userId: req.user.id,
    action: 'edit_candidate',
    entityType: 'candidate',
    entityId: candidate._id,
    metadata: { name: candidate.name, email: candidate.email, phone: candidate.phone },
  });

  res.json(candidate);
});

// DELETE /candidates/:id - removes the candidate record, all of its
// screening history, and its stored resume file from disk. Irreversible,
// so the frontend confirms before calling this. Admin/recruiter only,
// same as create/screen.
router.delete('/:id', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  await Screening.deleteMany({ candidateId: candidate._id });
  await JobApplication.updateMany({ candidateId: candidate._id }, { $unset: { candidateId: 1 } });

  if (candidate.resumeFileKey) {
    const filePath = path.join(UPLOAD_DIR, candidate.resumeFileKey);
    removeUploadedFile(filePath);
  }

  await Candidate.deleteOne({ _id: candidate._id });

  await AuditLog.create({
    userId: req.user.id,
    action: 'delete_candidate',
    entityType: 'candidate',
    entityId: candidate._id,
    metadata: { name: candidate.name, email: candidate.email },
  });

  res.status(204).end();
});

// GET /candidates/:id/uan-records - employment history entered for a
// candidate (manual for now - source: 'manual'), oldest first, used to
// spot overlapping employers ahead of running a UAN check.
router.get('/:id/uan-records', requireRole('admin', 'recruiter', 'viewer', 'superadmin'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const records = await UanRecord.find({ candidateId: candidate._id }).sort({ startDate: 1 });
  res.json(records);
});

// POST /candidates/:id/uan-records - add one employment period for a
// candidate (employer + start date, optional end date - blank end date
// means "current employer").
router.post('/:id/uan-records', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  try {
    const { employer, startDate, endDate } = req.body;
    if (!employer || !startDate) {
      return res.status(400).json({ error: 'employer and startDate are required' });
    }

    const record = await UanRecord.create({
      candidateId: candidate._id,
      employer,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      source: 'manual',
      enteredBy: req.user.id,
    });

    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not add employment record' });
  }
});

// POST /candidates/:id/uan-check - compares this candidate's employment
// records for overlapping date ranges (a classic sign of moonlighting /
// misreported employment on a UAN/PF record) and stamps the result onto
// the candidate's most recent Screening. Requires the candidate to have
// been screened at least once already, since there's nowhere else to
// persist the result.
router.post('/:id/uan-check', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const latestScreening = await Screening.findOne({ candidateId: candidate._id }).sort({ screenedAt: -1 });
  if (!latestScreening) {
    return res.status(400).json({ error: 'Screen this candidate\'s resume before running a UAN check' });
  }

  const records = await UanRecord.find({ candidateId: candidate._id }).sort({ startDate: 1 });

  const overlaps = [];
  const seen = new Set();
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];
      const aEnd = a.endDate || new Date();
      const bEnd = b.endDate || new Date();
      const overlapping = a.startDate < bEnd && b.startDate < aEnd;
      if (overlapping) {
        [a, b].forEach((rec) => {
          const key = `${rec.employer}-${rec.startDate.toISOString()}`;
          if (!seen.has(key)) {
            seen.add(key);
            overlaps.push({ employer: rec.employer, startDate: rec.startDate, endDate: rec.endDate });
          }
        });
      }
    }
  }

  latestScreening.uanChecked = true;
  latestScreening.uanOverlaps = overlaps;
  await latestScreening.save();

  await AuditLog.create({
    userId: req.user.id,
    action: 'uan_check',
    entityType: 'candidate',
    entityId: candidate._id,
    metadata: { recordCount: records.length, overlapCount: overlaps.length },
  });

  res.json(await latestScreening.populate('fraudMatches.fraudCompanyId', 'name'));
});

// GET /candidates/:id/hiring-recommendation - the deterministic (no LLM)
// "Strong Hire / Hire / Borderline / Reject" combiner: fraud + resume
// career-consistency, job match score, and aggregated panel interview
// feedback - see utils/hiringRecommendation.js for the actual formula
// and why each weight re-normalizes over whichever signals exist yet.
// Computed fresh on every call, not persisted - nothing to go stale
// since it's just arithmetic over records that already exist.
router.get('/:id/hiring-recommendation', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const [job, screening, invites] = await Promise.all([
    Job.findOne({ _id: candidate.jobId, companyId: req.user.companyId }),
    Screening.findOne({ candidateId: candidate._id }).sort({ screenedAt: -1 }),
    InterviewInvite.find({ candidateId: candidate._id }),
  ]);

  const matchScore =
    job && job.requiredSkills && job.requiredSkills.length ? computeMatchScore(job, candidate).score : null;

  const invitesWithOutcome = invites.map((inv) => ({ panelOutcome: computePanelOutcome(inv.panelFeedback) }));

  const recommendation = computeHiringRecommendation({
    screening,
    careerFlags: candidate.careerFlags,
    matchScore,
    invites: invitesWithOutcome,
  });

  res.json(recommendation);
});

module.exports = router;
