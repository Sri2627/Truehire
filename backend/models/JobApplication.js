const mongoose = require('mongoose');

const jobApplicationSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    status: {
      type: String,
      enum: ['applied', 'reviewing', 'shortlisted', 'rejected', 'hired'],
      default: 'applied',
    },
  },
  { timestamps: { createdAt: 'appliedAt', updatedAt: 'updatedAt' }, collection: 'job_applications' }
);

jobApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true });
jobApplicationSchema.index({ companyId: 1, appliedAt: -1 });
jobApplicationSchema.index({ applicantId: 1, appliedAt: -1 });

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
