/**
 * scripts/seedFraudList.js
 *
 * Loads the fraud/fake-institutions watch-list spreadsheet directly into
 * the fraud_companies collection. This is the same import path Screen 10/11
 * of the spec describes (upload Excel -> preview -> commit) but run
 * straight from the command line for the initial bulk load.
 *
 * Usage:
 *   npm run seed-fraud-list
 *   npm run seed-fraud-list -- /path/to/other-file.xlsx
 *   npm run seed-fraud-list -- /path/to/file.xlsx "Some Other Company"
 *
 * - Reads the "Fake Institutions" column (case-insensitive header match).
 * - Normalizes each name (lowercase, punctuation stripped) for matching.
 * - Skips duplicate names within the file and any already in the DB for
 *   this tenant (upsert on the unique companyId+normalizedName index), so
 *   it's safe to re-run.
 * - Attaches everything to the "Default Company" tenant created by
 *   initDb.js, unless a different company name is passed as the 2nd arg.
 */
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { normalizeCompanyName } = require('../utils/normalizeCompanyName');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'fake_institutions.xlsx');
const NAME_COLUMN_CANDIDATES = ['fake institutions', 'name', 'company', 'company name'];

function findNameKey(row) {
  const keys = Object.keys(row);
  const match = keys.find((k) => NAME_COLUMN_CANDIDATES.includes(k.trim().toLowerCase()));
  return match || keys[0]; // fall back to the first column if nothing matches
}

async function run() {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
  const companyName = process.argv[3] || 'Default Company';

  console.log('True Hire — fraud watch-list seed');
  console.log('===================================');
  console.log(`File:    ${filePath}`);
  console.log(`Tenant:  ${companyName}`);

  const connection = await connectDB();
  const db = connection.db;

  const company = await db.collection('companies').findOne({ name: companyName });
  if (!company) {
    console.error(`\nNo company named "${companyName}" found. Run "npm run init-db" first`);
    console.error('(it creates the Default Company tenant), or pass an existing company name.');
    process.exit(1);
  }

  const adminUser = await db.collection('users').findOne({ companyId: company._id, role: 'admin' });

  console.log('\nReading workbook...');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (rows.length === 0) {
    console.log('No rows found in the first sheet - nothing to do.');
    process.exit(0);
  }

  const nameKey = findNameKey(rows[0]);
  console.log(`Sheet:   "${sheetName}" (${rows.length} rows), name column: "${nameKey}"`);

  // De-dupe within the file itself first (same normalized name appearing twice).
  const seen = new Map(); // normalizedName -> original name
  let blankSkipped = 0;

  for (const row of rows) {
    const rawName = String(row[nameKey] || '').trim();
    if (!rawName) {
      blankSkipped += 1;
      continue;
    }
    const normalized = normalizeCompanyName(rawName);
    if (normalized && !seen.has(normalized)) {
      seen.set(normalized, rawName);
    }
  }

  console.log(`Parsed:  ${seen.size} unique companies (${blankSkipped} blank rows skipped, ` +
    `${rows.length - seen.size - blankSkipped} in-file duplicates collapsed)`);

  console.log('\nUpserting into fraud_companies...');
  const fraudCol = db.collection('fraud_companies');
  const now = new Date();

  const entries = Array.from(seen.entries());
  const BATCH_SIZE = 1000;
  let upserted = 0;
  let matchedExisting = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    const ops = batch.map(([normalizedName, name]) => ({
      updateOne: {
        filter: { companyId: company._id, normalizedName },
        update: {
          $setOnInsert: {
            name,
            normalizedName,
            companyId: company._id,
            source: 'excel_upload',
            addedBy: adminUser ? adminUser._id : null,
            addedAt: now,
          },
        },
        upsert: true,
      },
    }));

    const result = await fraudCol.bulkWrite(ops, { ordered: false });
    upserted += result.upsertedCount;
    matchedExisting += result.matchedCount;

    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
      `${result.upsertedCount} new, ${result.matchedCount} already present`);
  }

  console.log('\nDone.');
  console.log(`  ${upserted} new fraud_companies records inserted`);
  console.log(`  ${matchedExisting} already existed and were left untouched`);

  const total = await fraudCol.countDocuments({ companyId: company._id });
  console.log(`  ${total} total fraud_companies records now on file for "${companyName}"`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('seed-fraud-list failed:', err);
  process.exit(1);
});
