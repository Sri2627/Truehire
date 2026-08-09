// One-off fix: promote an existing user to role "admin" by email.
// Useful when a user was created via /auth/register (which defaults to
// role "recruiter") or when scripts/initDb.js was run more than once and
// skipped re-seeding an already-existing admin@... account with the
// wrong role.
//
// Usage:
//   node scripts/fixAdminRole.js admin@truehire.local
//   (or just: node scripts/fixAdminRole.js  -> uses SEED_ADMIN_EMAIL / admin@truehire.local)
require('dotenv').config();
const { connectDB } = require('../config/db');
const User = require('../models/User');

async function run() {
  const email = (process.argv[2] || process.env.SEED_ADMIN_EMAIL || 'admin@truehire.local').toLowerCase();

  await connectDB();

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user found with email "${email}". Check the address or run npm run init-db first.`);
    process.exit(1);
  }

  if (user.role === 'admin') {
    console.log(`"${email}" is already role "admin" - nothing to change.`);
  } else {
    const previousRole = user.role;
    user.role = 'admin';
    await user.save();
    console.log(`Updated "${email}": role "${previousRole}" -> "admin"`);
  }

  console.log('Log out and log back in on the frontend for the new role to take effect (the JWT/localStorage cache the role from login time).');
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to update role:', err.message);
  process.exit(1);
});
