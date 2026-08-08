const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = mongoose.model('Company', companySchema);
