// One-off fix for the E11000 duplicate key error on the `mobile` unique
// sparse index: finds every user document that has mobile explicitly set
// to null (rather than the field being fully absent, which a sparse
// index would correctly ignore) and unsets the field entirely. Safe to
// run more than once - it's a no-op once there's nothing left to fix.
//
// Usage: node scripts/fixMobileNullIndex.js
require('dotenv').config();
const { connectDB } = require('../config/db');

async function run() {
  const connection = await connectDB();
  const db = connection.db;

  const result = await db.collection('users').updateMany({ mobile: null }, { $unset: { mobile: '' } });

  console.log(`Fixed ${result.modifiedCount} user(s) with an explicit mobile: null value.`);
  if (result.modifiedCount > 0) {
    console.log('You can now re-run "npm run create-superadmin" without hitting the duplicate-key error.');
  } else {
    console.log('Nothing to fix - no user had an explicit null mobile value.');
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to fix mobile:null values:', err.message);
  process.exit(1);
});
