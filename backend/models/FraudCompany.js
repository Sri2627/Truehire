const mongoose = require('mongoose');

const fraudCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased, punctuation-stripped copy used for matching.
    normalizedName: { type: String, required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    source: { type: String, enum: ['excel_upload', 'manual_entry'], default: 'manual_entry' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: { createdAt: 'addedAt', updatedAt: false },
    // Explicit collection name - Mongoose's auto-pluralized default for
    // "FraudCompany" is "fraudcompanies" (no underscore), which does NOT
    // match the "fraud_companies" collection scripts/initDb.js creates and
    // scripts/seedFraudList.js writes to via the raw driver. Without this,
    // every FraudCompany.find() in the app silently reads from a different,
    // always-empty collection than the one the seed script populates.
    collection: 'fraud_companies',
  }
);

module.exports = mongoose.model('FraudCompany', fraudCompanySchema);
