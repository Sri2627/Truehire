const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    resumeFileKey: { type: String }, // object storage reference, not the file itself
    extractedText: { type: String },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = mongoose.model('Candidate', candidateSchema);
