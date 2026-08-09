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
    // How many fraud_companies entries this scan actually ran against.
    // Persisted (not just returned once) so a "clear" verdict from a scan
    // that ran against an empty/unseeded list still reads as such after
    // a page refresh, instead of looking identical to a real clear.
    fraudListSize: { type: Number, default: 0 },
    screenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    overrideBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    overrideReason: { type: String },
  },
  { timestamps: { createdAt: 'screenedAt', updatedAt: false } }
);

module.exports = mongoose.model('Screening', screeningSchema);
