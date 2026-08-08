const mongoose = require('mongoose');

// Roles the app enforces on the backend, not just hidden in the UI.
// admin      - manage team, fraud watch-list, overrides
// recruiter  - screen candidates, draft invites
// viewer     - read-only access
const ROLES = ['admin', 'recruiter', 'viewer'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, unique: true, sparse: true, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    // Password auth for this build (JWT-based). If OTP sign-in is added
    // later, passwordHash can stay optional alongside it.
    passwordHash: { type: String, required: true },
    mobileVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    role: { type: String, enum: ROLES, default: 'recruiter' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    lastLoginAt: { type: Date },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
