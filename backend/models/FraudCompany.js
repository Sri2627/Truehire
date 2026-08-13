const mongoose = require('mongoose');

const fraudCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased, punctuation-stripped copy used for matching.
    normalizedName: { type: String, required: true, index: true },
    // Null = a global entry, checked against every tenant's screening -
    // used for the platform-wide fake-institutions list, since a fake
    // university is fake for every company, not just whichever tenant
    // happened to be attached when it was seeded. Set to a real Company
    // id for a tenant's own manually-added entries, which stay private
    // to that tenant (see routes/fraudRoutes.js).
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
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
