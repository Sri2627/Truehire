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
  { timestamps: { createdAt: 'addedAt', updatedAt: false } }
);

module.exports = mongoose.model('FraudCompany', fraudCompanySchema);
