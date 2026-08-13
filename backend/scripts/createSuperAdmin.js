// Creates (or promotes an existing user to) a platform-level "superadmin"
// account - the one that can see every institution on the platform via
// /institutions, and drill into any of their jobs/candidates/fraud lists.
// A superadmin has no companyId of its own, unlike a regular tenant
// "admin" - see models/User.js and middleware/auth.js resolveCompanyScope.
//
// Usage:
//   node scripts/createSuperAdmin.js you@platform.local YourPassword123
//   (or just: node scripts/createSuperAdmin.js
//    -> uses SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD env vars,
//    falling back to superadmin@truehire.local / ChangeMe123!)
//
// Doesn't need any special Atlas privileges (no dbAdmin, no
// bypassDocumentValidation) - see the isSuperAdmin note on the write
// below for why.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB } = require('../config/db');
const User = require('../models/User');

// Nice-to-have only, not load-bearing: if this Atlas connection user does
// have dbAdmin, patch the users validator so 'superadmin' is a formally
// allowed role value too, for anyone who inspects the schema later.
// Actual superadmin creation below never depends on this succeeding.
async function patchUsersValidator(db) {
  try {
    await db.command({
      collMod: 'users',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['name', 'passwordHash', 'role'],
          properties: {
            name:         { bsonType: 'string' },
            email:        { bsonType: ['string', 'null'] },
            mobile:       { bsonType: ['string', 'null'] },
            passwordHash: { bsonType: 'string' },
            role:         { enum: ['superadmin', 'admin', 'recruiter', 'viewer'] },
            mobileVerified: { bsonType: 'bool' },
            emailVerified:  { bsonType: 'bool' },
            isSuperAdmin:   { bsonType: 'bool' },
          },
        },
      },
      validationLevel: 'moderate',   // only validate new inserts & updates, not existing docs
      validationAction: 'error',
    });
    console.log('  ✓ users collection validator updated to include superadmin role');
  } catch (err) {
    // Expected on most Atlas connections (free tier included) - the DB
    // user usually only has readWrite, not dbAdmin. That's fine: the
    // actual write below (isSuperAdmin: true, role stays 'admin') never
    // needs this to have worked.
    console.warn(
      `  ⚠ Could not update users collection validator (${err.codeName || err.code}: ${err.message})\n` +
      `    This usually means the DB user lacks the dbAdmin role on Atlas.\n` +
      `    Continuing anyway - it's a cosmetic patch only, not required.`
    );
  }
}

async function run() {
  const email    = (process.argv[2] || process.env.SEED_SUPERADMIN_EMAIL    || 'superadmin@truehire.local').toLowerCase();
  const password =  process.argv[3] || process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMe123!';

  const connection = await connectDB();
  const db = connection.db;

  // Best-effort only - see patchUsersValidator.
  await patchUsersValidator(db);

  let user = await User.findOne({ email });

  if (user) {
    if (user.isSuperAdmin) {
      console.log(`"${email}" is already a superadmin — nothing to change.`);
    } else if (user.role === 'superadmin') {
      // Leftover from an older version of this script that wrote role:
      // 'superadmin' literally. On a connection whose Atlas users
      // validator was never patched (needs dbAdmin - see
      // patchUsersValidator), that value doesn't satisfy the enum, and
      // under the default 'strict' validation level MongoDB re-checks
      // the *whole* document on every write - so this account has likely
      // been failing on login's lastLoginAt update, password reset, etc.
      // ever since. Fix it the same way as the promotion path below:
      // move it onto role: 'admin' + isSuperAdmin: true, which is
      // schema-valid, so it stops tripping the validator on every future
      // write to this document.
      await db.collection('users').updateOne(
        { email },
        { $set: { role: 'admin', isSuperAdmin: true }, $unset: { companyId: '' } }
      );
      console.log(
        `  ✓ Migrated "${email}" off a stored role of "superadmin" (which this Atlas\n` +
        `    connection's users validator doesn't allow, and was likely breaking writes\n` +
        `    to this account) onto role: "admin" + isSuperAdmin: true instead.`
      );
    } else {
      const previousRole = user.role;
      // Set isSuperAdmin: true and leave `role` at whatever schema-valid
      // value it already had (or force 'admin' if it somehow wasn't one
      // of the known roles) - never write role: 'superadmin' directly.
      // The users collection's server-side JSON schema validator on most
      // Atlas connections still only allows role to be one of
      // ['admin','recruiter','viewer'] (patchUsersValidator above needs
      // dbAdmin to fix that, which most Atlas DB users don't have) - and
      // under the default 'strict' validation level, MongoDB re-checks
      // the *whole* document on every update, so setting role:
      // 'superadmin' directly would reject not just this write but every
      // future write to this document (including something as small as
      // updating lastLoginAt on login). isSuperAdmin is a field the
      // validator doesn't know about at all, so it's simply ignored, not
      // rejected - see authController.js's effectiveRole() for how the
      // rest of the app treats this identically to role: 'superadmin'.
      const nextRole = ['admin', 'recruiter', 'viewer'].includes(user.role) ? user.role : 'admin';
      await db.collection('users').updateOne(
        { email },
        { $set: { role: nextRole, isSuperAdmin: true }, $unset: { companyId: '' } }
      );
      console.log(`  ✓ Updated "${email}": role "${previousRole}" kept as "${nextRole}", isSuperAdmin: true, companyId cleared`);
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    // Same reasoning as the promotion path above: role stays 'admin'
    // (schema-valid everywhere), isSuperAdmin: true is what actually
    // grants platform-superadmin treatment.
    await db.collection('users').insertOne({
      name:           'Platform Super Admin',
      email,
      mobile:         null,
      passwordHash,
      role:           'admin',
      isSuperAdmin:   true,
      mobileVerified: false,
      emailVerified:  true,
      companyId:      null,
      createdAt:      new Date(),
    });
    console.log(`  ✓ Created superadmin user: ${email} / ${password}`);
    console.log('    (change this password after first login)');
  }

  console.log('\nDone. Log in with the superadmin account — you will land on the Institutions screen.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to create/promote superadmin:', err.message);
  console.error(
    '\nThis script no longer needs any special Atlas privileges (no dbAdmin,\n' +
    'no bypassDocumentValidation) - if it still failed, it\'s likely an\n' +
    'unrelated connection or credentials problem. Double-check MONGO_URI in\n' +
    '.env and that this Atlas user has ordinary read/write access to this\n' +
    'database.'
  );
  process.exit(1);
});
