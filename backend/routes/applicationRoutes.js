const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const Company = require('../models/Company');
const JobApplication = require('../models/JobApplication');
const Screening = require('../models/Screening');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const { extractResumeText } = require('../utils/extractResumeText');
const { guessEmailFromText, guessPhoneFromText } = require('../utils/contactExtraction');
const { runScreening } = require('../utils/runScreening');
const { removeUploadedFile } = require('../utils/removeUploadedFile');
const { PLAN_LIMITS, PLAN_LABELS } = require('../config/plans');

const router = express.Router();

router.use(requireAuth, requireRole('jobseeker'));

router.get('/', async (req, res) => {
  const applications = await JobApplication.find({ applicantId: req.user.id })
    .populate({
      path: 'jobId',
      select: 'title status description companyId',
      populate: { path: 'companyId', select: 'name' },
    })
    .sort({ appliedAt: -1 })
    .select('jobId status appliedAt updatedAt');
  res.json(applications);
});

router.post('/', upload.single('resume'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'A resume file (PDF or DOCX) is required' });

  const { jobId, phone } = req.body;
  if (!mongoose.isValidObjectId(jobId)) {
    removeUploadedFile(file.path);
    return res.status(400).json({ error: 'A valid jobId is required' });
  }

  let job;
  let existing;
  let company;
  let candidateLimit;
  try {
    job = await Job.findOne({ _id: jobId, status: 'open' });
    if (job) {
      existing = await JobApplication.findOne({ jobId: job._id, applicantId: req.user.id });
      company = await Company.findById(job.companyId);
      candidateLimit = PLAN_LIMITS[company?.plan]?.candidates ?? PLAN_LIMITS.free.candidates;
    }
  } catch (err) {
    removeUploadedFile(file.path);
    throw err;
  }
  if (!job) {
    removeUploadedFile(file.path);
    return res.status(404).json({ error: 'This job is not available for applications' });
  }

  if (existing) {
    removeUploadedFile(file.path);
    return res.status(409).json({ error: 'You have already applied to this job' });
  }
  if (Number.isFinite(candidateLimit)) {
    let candidateCount;
    try {
      candidateCount = await Candidate.countDocuments({ companyId: job.companyId });
    } catch (err) {
      removeUploadedFile(file.path);
      throw err;
    }
    if (candidateCount >= candidateLimit) {
      removeUploadedFile(file.path);
      return res.status(403).json({
        error: `This employer's ${PLAN_LABELS[company?.plan] || 'Free'} plan has reached its candidate limit.`,
      });
    }
  }

  let candidate;
  let screening;
  let application;
  try {
    const extractedText = await extractResumeText(fs.readFileSync(file.path), file.originalname);
    candidate = await Candidate.create({
      name: req.user.name,
      email: req.user.email || guessEmailFromText(extractedText),
      phone: phone?.trim() || guessPhoneFromText(extractedText),
      jobId: job._id,
      companyId: job.companyId,
      createdBy: req.user.id,
    });
    screening = await runScreening({ candidate, file, userId: req.user.id, extractedText });

    application = await JobApplication.create({
      jobId: job._id,
      companyId: job.companyId,
      applicantId: req.user.id,
      candidateId: candidate._id,
    });
    await AuditLog.create({
      userId: req.user.id,
      action: 'apply_for_job',
      entityType: 'job_application',
      entityId: application._id,
      metadata: { jobId: job._id, candidateId: candidate._id },
    });

    return res.status(201).json({
      id: application._id,
      jobId: job._id,
      jobTitle: job.title,
      status: application.status,
      appliedAt: application.appliedAt,
      screeningVerdict: screening.verdict,
    });
  } catch (err) {
    if (application) await JobApplication.deleteOne({ _id: application._id });
    if (candidate) {
      await Screening.deleteMany({ candidateId: candidate._id });
      await Candidate.deleteOne({ _id: candidate._id });
    }
    removeUploadedFile(file.path);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You have already applied to this job' });
    }
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    throw err;
  }
});

module.exports = router;
