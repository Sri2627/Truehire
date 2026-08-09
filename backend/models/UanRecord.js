const mongoose = require('mongoose');

const uanRecordSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    employer: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date }, // null/undefined = current employer
    source: { type: String, enum: ['manual', 'bgv_vendor_api'], default: 'manual' },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  // Explicit collection name - Mongoose's auto-pluralized default for
  // "UanRecord" is "uanrecords" (no underscore), not the "uan_records"
  // collection scripts/initDb.js creates. See models/FraudCompany.js for
  // the full explanation of why this matters.
  { collection: 'uan_records' }
);

module.exports = mongoose.model('UanRecord', uanRecordSchema);
