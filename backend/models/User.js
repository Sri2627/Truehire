const mongoose = require('mongoose');

// Roles the app enforces on the backend, not just hidden in the UI.
// superadmin - platform-level, not tied to any single companyId. Can list
//              and create institutions (companies) and read (but not
//              modify) any institution's jobs/candidates/fraud list once
//              it selects one to view (see middleware/auth.js
//              resolveCompanyScope).
// admin      - manage team, fraud watch-list, overrides (within own company)
// recruiter  - screen candidates, draft invites
// viewer     - read-only access
const ROLES = ['superadmin', 'admin', 'recruiter', 'viewer'];

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
    // Belt-and-braces alternative to role: 'superadmin'. Some Atlas
    // connections can't have the users collection's server-side JSON
    // schema validator patched to allow that role value (needs dbAdmin,
    // which plenty of Atlas database users don't have - see
    // scripts/createSuperAdmin.js) - and on a strict/error validator,
    // *every* write to that document, not just the one setting role,
    // gets rejected once role holds a value the validator doesn't know
    // about. Setting this flag instead, with role left at the
    // schema-valid 'admin', gets the same platform-superadmin treatment
    // (see authController.js's effectiveRole()) without ever writing a
    // disallowed role value - the validator here has no
    // `additionalProperties: false`, so an extra boolean field is simply
    // ignored by it, not rejected.
    isSuperAdmin: { type: Boolean, default: false },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    lastLoginAt: { type: Date },
    // Forgot-password flow: a short-lived 6-digit code, stored hashed
    // (never in plaintext) alongside its expiry. Both are cleared once
    // the code is used or replaced by a fresh request.
    resetCodeHash: { type: String, select: false },
    resetCodeExpires: { type: Date, select: false },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
