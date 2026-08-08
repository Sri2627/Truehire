const mongoose = require('mongoose');

const screeningSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    verdict: { type: String, enum: ['clear', 'flagged'], required: true },
    fraudMatches: [
      {
        fraudCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FraudCompany' },
        matchedText: String,
      },
    ],
    uanChecked: { type: Boolean, default: false },
    uanOverlaps: [
      {
        employer: String,
        startDate: Date,
        endDate: Date,
      },
    ],
    screenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    overrideBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    overrideReason: { type: String },
  },
  { timestamps: { createdAt: 'screenedAt', updatedAt: false } }
);

module.exports = mongoose.model('Screening', screeningSchema);
