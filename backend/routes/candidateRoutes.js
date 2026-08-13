const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const mammoth = require('mammoth');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const FraudCompany = require('../models/FraudCompany');
const Screening = require('../models/Screening');
const UanRecord = require('../models/UanRecord');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole, resolveCompanyScope } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const { extractResumeText } = require('../utils/extractResumeText');
const { screenResumeText } = require('../utils/screenText');
const { extractSkillsFromText, MASTER_SKILLS } = require('../utils/skillExtraction');
const { guessEmailFromText, guessPhoneFromText } = require('../utils/contactExtraction');
const { deriveSkillYearsFromTimeline, deriveTotalExperience } = require('../utils/timelineExtraction');
const { runCareerChecks } = require('../utils/careerChecks');

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

// Shared by POST /candidates and POST /candidates/:id/screen: extracts the
// uploaded resume's text, matches it against the caller's tenant fraud
// list, records a Screening, and derives skills/experience/career-flags
// for job matching (utils/skillExtraction.js, utils/timelineExtraction.js,
// utils/careerChecks.js). Returns the populated screening doc.
async function runScreening({ candidate, file, userId, extractedText: preExtracted }) {
  const extractedText =
    preExtracted !== undefined ? preExtracted : await extractResumeText(fs.readFileSync(file.path), file.originalname);

  // Checks the tenant's own manually-added entries PLUS the global,
  // platform-wide fake-institutions list (companyId: null) - see
  // models/FraudCompany.js. Without the $or here, a brand new tenant with
  // no manual entries of its own would screen against nothing at all and
  // every resume would come back "clear" for the wrong reason: not
  // because it's clean, but because there was nothing to check it against.
  const fraudCompanies = await FraudCompany.find({
    $or: [{ companyId: candidate.companyId }, { companyId: null }],
  });
  const { verdict, fraudMatches } = screenResumeText(extractedText, fraudCompanies);

  // Skills: dictionary presence + any explicitly stated years, merged with
  // timeline-derived years for everything the resume didn't state a
  // number for. Stated years (if the resume actually says "5 years of
  // React") win over derived ones - that's the more direct claim.
  const stated = extractSkillsFromText(extractedText);
  const derivedByName = new Map(deriveSkillYearsFromTimeline(extractedText, MASTER_SKILLS).map((s) => [s.name, s]));

  const skills = stated.map((s) => {
    if (s.years != null) return { name: s.name, years: s.years, source: 'stated' };
    const derived = derivedByName.get(s.name);
    if (derived) return { name: s.name, years: derived.years, source: 'timeline_derived' };
    return { name: s.name, years: null, source: null };
  });

  const totalYearsExperience = deriveTotalExperience(extractedText);
  const { overlaps, growthFlags } = runCareerChecks(extractedText);
  const careerFlags = [
    ...overlaps.map((detail) => ({ type: 'employment_overlap', detail })),
    ...growthFlags.map((detail) => ({ type: 'unrealistic_growth', detail })),
  ];

  candidate.extractedText = extractedText;
  candidate.resumeFileKey = file.filename;
  candidate.skills = skills;
  if (totalYearsExperience != null) {
    candidate.totalYearsExperience = totalYearsExperience;
    candidate.totalYearsExperienceSource = 'timeline_derived';
  }
  candidate.careerFlags = careerFlags;
  await candidate.save();

  const screening = await Screening.create({
    candidateId: candidate._id,
    verdict,
    fraudMatches,
    fraudListSize: fraudCompanies.length,
    screenedBy: userId,
  });

  await AuditLog.create({
    userId,
    action: 'upload_resume',
    entityType: 'candidate',
    entityId: candidate._id,
    metadata: {
      verdict,
      matchCount: fraudMatches.length,
      fraudListSize: fraudCompanies.length,
      fileName: file.originalname,
      skillCount: skills.length,
      careerFlagCount: careerFlags.length,
    },
  });

  return screening.populate('fraudMatches.fraudCompanyId', 'name');
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
router.post('/', requireRole('admin', 'recruiter'), upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A resume file (PDF or DOCX) is required to register a candidate' });
  }

  const { name, email, phone, jobId } = req.body;

  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'A jobId is required — register the candidate against a job posting' });
  }

  const job = await Job.findOne({ _id: jobId, companyId: req.user.companyId });
  if (!job) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Job not found' });
  }

  let candidate;
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

    const screening = await runScreening({ candidate, file: req.file, userId: req.user.id, extractedText });
    res.status(201).json({ candidate, screening });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (candidate) await Candidate.deleteOne({ _id: candidate._id });
    res.status(400).json({ error: err.message || 'Could not register candidate' });
  }
});

// POST /candidates/bulk - register + screen many resumes at once against a
// single job posting. Field name "resumes" (multipart, up to 50 files per
// request), plus a jobId. Each file becomes its own candidate: name is
// guessed from the file name, email from the resume text if present, and
// each one is screened against the fraud watch-list exactly like a single
// upload. One bad file (unreadable, wrong type) does not fail the whole
// batch — it's reported per-file in the response so the rest still land.
// admin/recruiter only, same as single-candidate registration.
router.post('/bulk', requireRole('admin', 'recruiter'), upload.array('resumes', 50), async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: 'At least one resume file (PDF or DOCX) is required' });
  }

  const { jobId } = req.body;
  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(400).json({ error: 'A jobId is required — bulk-upload resumes against a job posting' });
  }

  const job = await Job.findOne({ _id: jobId, companyId: req.user.companyId });
  if (!job) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(404).json({ error: 'Job not found' });
  }

  // Processed sequentially rather than in parallel: each file already does
  // a decent amount of work (text extraction + fraud-list matching + a few
  // writes), and keeping it sequential avoids hammering the DB/CPU with 50
  // concurrent PDF parses from one request.
  const results = [];
  for (const file of files) {
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
      fs.unlink(file.path, () => {});
      if (candidate) await Candidate.deleteOne({ _id: candidate._id });
      results.push({
        fileName: file.originalname,
        success: false,
        error: err.message || 'Could not process this resume',
      });
    }
  }

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
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Candidate not found' });
      }

      const screening = await runScreening({ candidate, file: req.file, userId: req.user.id });
      res.status(201).json({ candidate, screening });
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
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

  if (candidate.resumeFileKey) {
    const filePath = path.join(UPLOAD_DIR, candidate.resumeFileKey);
    fs.unlink(filePath, () => {}); // best-effort; ignore if already gone
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

module.exports = router;
