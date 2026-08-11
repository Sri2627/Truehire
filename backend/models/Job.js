const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true }, // the JD text
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    // Used by utils/jobMatching.js to rank registered candidates. Optional -
    // a job with no requiredSkills set just can't be ranked yet (the
    // matches endpoint says so explicitly rather than returning a
    // meaningless score).
    requiredSkills: [
      {
        name: { type: String, trim: true, required: true },
        weight: { type: Number, min: 0, default: 10 }, // relative importance, not required to sum to 100
        minYears: { type: Number, min: 0, default: 0 },
      },
    ],
    minExperienceYears: { type: Number, min: 0 },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    // Explicit collection name for consistency with the rest of the app -
    // see models/FraudCompany.js for why this matters (Mongoose's default
    // pluralization can silently diverge from what initDb.js creates).
    collection: 'jobs',
  }
);

module.exports = mongoose.model('Job', jobSchema);
