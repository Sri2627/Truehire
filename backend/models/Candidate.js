const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    resumeFileKey: { type: String }, // object storage reference, not the file itself
    extractedText: { type: String },
    // Auto-extracted on upload: dictionary presence from
    // utils/skillExtraction.js, years backfilled by
    // utils/timelineExtraction.js from the resume's dated employment
    // history wherever the skill isn't itself stated with an explicit
    // "N years" - editable afterwards by a recruiter, treat as a
    // starting point to correct, not a verified fact.
    skills: [
      {
        name: { type: String, trim: true, required: true },
        years: { type: Number, min: 0, max: 80 },
        source: { type: String, enum: ['stated', 'timeline_derived', 'manual'], default: 'manual' },
      },
    ],
    totalYearsExperience: { type: Number, min: 0, max: 80 },
    totalYearsExperienceSource: { type: String, enum: ['stated', 'timeline_derived', 'manual'] },
    // Deterministic career-consistency flags from utils/careerChecks.js -
    // employment-date overlaps and unrealistic seniority jumps. Advisory,
    // not a verdict: shown to a recruiter alongside the fraud screening,
    // never auto-rejects anyone.
    careerFlags: [
      {
        type: { type: String, enum: ['employment_overlap', 'unrealistic_growth'] },
        detail: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

candidateSchema.index({ companyId: 1, jobId: 1, createdAt: -1 });

module.exports = mongoose.model('Candidate', candidateSchema);
