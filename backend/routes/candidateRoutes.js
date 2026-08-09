const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const FraudCompany = require('../models/FraudCompany');
const Screening = require('../models/Screening');
const UanRecord = require('../models/UanRecord');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const { extractResumeText } = require('../utils/extractResumeText');
const { screenResumeText } = require('../utils/screenText');

const router = express.Router();

// All candidate routes require a valid JWT.
router.use(requireAuth);

// Shared by POST /candidates and POST /candidates/:id/screen: extracts the
// uploaded resume's text, matches it against the caller's tenant fraud
// list, and records a Screening. Returns the populated screening doc.
async function runScreening({ candidate, file, userId }) {
  const buffer = fs.readFileSync(file.path);
  const extractedText = await extractResumeText(buffer, file.originalname);

  const fraudCompanies = await FraudCompany.find({ companyId: candidate.companyId });
  const { verdict, fraudMatches } = screenResumeText(extractedText, fraudCompanies);

  candidate.extractedText = extractedText;
  candidate.resumeFileKey = file.filename;
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
    metadata: { verdict, matchCount: fraudMatches.length, fraudListSize: fraudCompanies.length, fileName: file.originalname },
  });

  return screening.populate('fraudMatches.fraudCompanyId', 'name');
}

// GET /candidates - list/search candidates for the caller's company,
// each with its most recent screening verdict (if any) for the list badge.
// admin, recruiter, and viewer can all read.
router.get('/', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  const candidates = await Candidate.aggregate([
    { $match: { companyId } },
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
  ]);

  res.json(candidates);
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

  let candidate;
  try {
    const { name, email, phone } = req.body;

    candidate = await Candidate.create({
      name,
      email,
      phone,
      companyId: req.user.companyId,
      createdBy: req.user.id,
    });

    const screening = await runScreening({ candidate, file: req.file, userId: req.user.id });
    res.status(201).json({ candidate, screening });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (candidate) await Candidate.deleteOne({ _id: candidate._id });
    res.status(400).json({ error: err.message || 'Could not register candidate' });
  }
});

// GET /candidates/:id - full candidate detail.
router.get('/:id', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  res.json(candidate);
});

// POST /candidates/:id/screen - upload/re-upload a resume (PDF/DOCX) for an
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
router.get('/:id/screenings', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const screenings = await Screening.find({ candidateId: candidate._id })
    .populate('fraudMatches.fraudCompanyId', 'name')
    .sort({ screenedAt: -1 });

  res.json(screenings);
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
router.get('/:id/uan-records', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
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
