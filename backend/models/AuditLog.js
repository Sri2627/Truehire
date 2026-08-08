const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true }, // e.g. login, upload_resume, override_flag
  entityType: { type: String, required: true }, // candidate / fraud_companies / screening / user
  entityId: { type: mongoose.Schema.Types.ObjectId },
  metadata: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
