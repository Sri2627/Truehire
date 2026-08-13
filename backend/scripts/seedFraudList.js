/**
 * scripts/seedFraudList.js
 *
 * Loads the fraud/fake-institutions watch-list spreadsheet directly into
 * the fraud_companies collection. This is the same import path Screen 10/11
 * of the spec describes (upload Excel -> preview -> commit) but run
 * straight from the command line for the initial bulk load.
 *
 * Usage:
 *   npm run seed-fraud-list                                   (global list - every tenant)
 *   npm run seed-fraud-list -- /path/to/other-file.xlsx
 *   npm run seed-fraud-list -- /path/to/file.xlsx "" "Some Company"   (tenant-only list)
 *
 * - Reads the "Fake Institutions" column (case-insensitive header match).
 * - Normalizes each name (lowercase, punctuation stripped) for matching.
 * - Skips duplicate names within the file and any already in the DB for
 *   this scope, so it's safe to re-run.
 * - With no company name given (the normal case), entries are seeded as
 *   GLOBAL (companyId: null) - checked against every tenant's screening,
 *   since a fake university is fake for every institution using TrueHire,
 *   not just whichever one happened to be around when this was first run.
 *   Pass a company name as the 3rd arg only if you specifically want a
 *   private, tenant-only addition instead.
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
  const companyName = process.argv[3] || null; // no arg = global list

  console.log('True Hire — fraud watch-list seed');
  console.log('===================================');
  console.log(`File:    ${filePath}`);
  console.log(`Scope:   ${companyName ? `tenant-only ("${companyName}")` : 'global (every tenant)'}`);

  const connection = await connectDB();
  const db = connection.db;
  const fraudCol = db.collection('fraud_companies');

  let scopeCompanyId = null;
  let adminUser = null;

  if (companyName) {
    const company = await db.collection('companies').findOne({ name: companyName });
    if (!company) {
      console.error(`\nNo company named "${companyName}" found. Run "npm run init-db" first`);
      console.error('(it creates the Default Company tenant), or pass an existing company name.');
      process.exit(1);
    }
    scopeCompanyId = company._id;
    adminUser = await db.collection('users').findOne({ companyId: company._id, role: 'admin' });
  } else {
    // One-time self-heal: earlier versions of this script always attached
    // the seeded list to one specific tenant (originally "Default
    // Company"). Any of those rows still sitting under a real companyId
    // need to become global, or every OTHER tenant still screens against
    // nothing. Safe to run repeatedly - once migrated, this matches zero
    // rows and does nothing.
    const stray = await fraudCol.find({ source: 'excel_upload', companyId: { $ne: null } }).toArray();
    if (stray.length > 0) {
      console.log(`\nMigrating ${stray.length} previously tenant-scoped seed rows to global...`);
      let migrated = 0;
      let droppedAsDuplicate = 0;
      for (const doc of stray) {
        const alreadyGlobal = await fraudCol.findOne({ companyId: null, normalizedName: doc.normalizedName });
        if (alreadyGlobal) {
          await fraudCol.deleteOne({ _id: doc._id });
          droppedAsDuplicate += 1;
        } else {
          await fraudCol.updateOne({ _id: doc._id }, { $set: { companyId: null } });
          migrated += 1;
        }
      }
      console.log(`  ${migrated} migrated to global, ${droppedAsDuplicate} were already global and dropped as duplicates`);
    }
  }

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
  const now = new Date();

  const entries = Array.from(seen.entries());
  const BATCH_SIZE = 1000;
  let upserted = 0;
  let matchedExisting = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    const ops = batch.map(([normalizedName, name]) => ({
      updateOne: {
        filter: { companyId: scopeCompanyId, normalizedName },
        update: {
          $setOnInsert: {
            name,
            normalizedName,
            companyId: scopeCompanyId,
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

  const total = await fraudCol.countDocuments({ companyId: scopeCompanyId });
  console.log(`  ${total} total fraud_companies records now on file for this ${companyName ? 'tenant' : 'global list'}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('seed-fraud-list failed:', err);
  process.exit(1);
});
