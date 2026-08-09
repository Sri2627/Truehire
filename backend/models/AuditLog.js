const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. login, upload_resume, override_flag
    entityType: { type: String, required: true }, // candidate / fraud_companies / screening / user
    entityId: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  // Explicit collection name - Mongoose's auto-pluralized default for
  // "AuditLog" is "auditlogs", not the "audit_log" (singular, snake_case)
  // collection scripts/initDb.js creates. See models/FraudCompany.js for
  // the full explanation of why this matters.
  { collection: 'audit_log' }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
