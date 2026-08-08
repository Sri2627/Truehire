/**
 * scripts/initDb.js
 *
 * Run this once (npm run init-db) to set up the database:
 *   1. Creates every collection with JSON-schema validation, matching the
 *      spec's tables (users, companies, fraud_companies, candidates,
 *      screenings, uan_records, interview_invites, audit_log).
 *   2. Builds the indexes each collection needs (unique email/mobile, TTL
 *      on OTP-style expiry fields if you add OTP later, text search, etc).
 *   3. Seeds a default company and a default admin user with a bcrypt
 *      password hash, so you can log in and start issuing JWTs immediately.
 *
 * Safe to re-run: it skips any collection/user that already exists.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB } = require('../config/db');

// Collections + a JSON-schema validator for each, so MongoDB itself
// rejects malformed documents even if application code has a bug.
const COLLECTIONS = [
  {
    name: 'companies',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['name'],
        properties: {
          name: { bsonType: 'string' },
          plan: { enum: ['free', 'pro', 'enterprise'] },
        },
      },
    },
    indexes: [],
  },
  {
    name: 'users',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'passwordHash', 'role'],
        properties: {
          name: { bsonType: 'string' },
          email: { bsonType: ['string', 'null'] },
          mobile: { bsonType: ['string', 'null'] },
          passwordHash: { bsonType: 'string' },
          role: { enum: ['admin', 'recruiter', 'viewer'] },
          mobileVerified: { bsonType: 'bool' },
          emailVerified: { bsonType: 'bool' },
        },
      },
    },
    indexes: [
      { key: { email: 1 }, options: { unique: true, sparse: true } },
      { key: { mobile: 1 }, options: { unique: true, sparse: true } },
    ],
  },
  {
    name: 'fraud_companies',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'normalizedName', 'companyId'],
      },
    },
    indexes: [{ key: { companyId: 1, normalizedName: 1 }, options: { unique: true } }],
  },
  {
    name: 'candidates',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['companyId', 'createdBy'],
      },
    },
    indexes: [{ key: { companyId: 1, createdAt: -1 } }, { key: { email: 1 } }],
  },
  {
    name: 'screenings',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['candidateId', 'verdict', 'screenedBy'],
        properties: {
          verdict: { enum: ['clear', 'flagged'] },
        },
      },
    },
    indexes: [{ key: { candidateId: 1 } }],
  },
  {
    name: 'uan_records',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['candidateId', 'employer', 'startDate', 'enteredBy'],
      },
    },
    indexes: [{ key: { candidateId: 1 } }],
  },
  {
    name: 'interview_invites',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['candidateId', 'subject', 'body', 'draftedBy'],
        properties: {
          status: { enum: ['drafted', 'opened_in_mail', 'marked_sent'] },
        },
      },
    },
    indexes: [{ key: { candidateId: 1 } }],
  },
  {
    name: 'audit_log',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['userId', 'action', 'entityType'],
      },
    },
    indexes: [{ key: { entityType: 1, entityId: 1 } }, { key: { timestamp: -1 } }],
  },
];

async function ensureCollection(db, { name, validator, indexes }) {
  const existing = await db.listCollections({ name }).toArray();

  if (existing.length === 0) {
    await db.createCollection(name, { validator });
    console.log(`  + created collection "${name}"`);
  } else {
    // Collection exists already (e.g. re-running the script) - update the
    // validator in place so schema changes still take effect.
    await db.command({ collMod: name, validator });
    console.log(`  = collection "${name}" already exists, validator refreshed`);
  }

  for (const idx of indexes) {
    await db.collection(name).createIndex(idx.key, idx.options || {});
  }
  if (indexes.length) {
    console.log(`    indexes ensured on "${name}": ${indexes.map((i) => JSON.stringify(i.key)).join(', ')}`);
  }
}

async function seedAdmin(db) {
  const companiesCol = db.collection('companies');
  const usersCol = db.collection('users');

  let company = await companiesCol.findOne({ name: 'Default Company' });
  if (!company) {
    const result = await companiesCol.insertOne({
      name: 'Default Company',
      plan: 'free',
      createdAt: new Date(),
    });
    company = { _id: result.insertedId };
    console.log('  + created "Default Company" tenant');
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@truehire.local').toLowerCase();
  const existingAdmin = await usersCol.findOne({ email: adminEmail });

  if (existingAdmin) {
    console.log(`  = admin user "${adminEmail}" already exists, skipping seed`);
    return;
  }

  const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!', 12);

  await usersCol.insertOne({
    name: process.env.SEED_ADMIN_NAME || 'Super Admin',
    email: adminEmail,
    mobile: null,
    passwordHash,
    role: 'admin',
    mobileVerified: false,
    emailVerified: true,
    companyId: company._id,
    createdAt: new Date(),
  });

  console.log(`  + seeded admin user: ${adminEmail} / ${process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'}`);
  console.log('    (change this password after first login)');
}

async function run() {
  console.log('True Hire — database init');
  console.log('==========================');

  const connection = await connectDB();
  const db = connection.db;

  console.log('\nEnsuring collections + validators + indexes:');
  for (const collection of COLLECTIONS) {
    await ensureCollection(db, collection);
  }

  console.log('\nSeeding default tenant + admin user:');
  await seedAdmin(db);

  console.log('\nDone. You can now run "npm start" and log in with the admin account above.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('init-db failed:', err);
  process.exit(1);
});
