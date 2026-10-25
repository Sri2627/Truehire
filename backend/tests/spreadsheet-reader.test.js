const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFraudSpreadsheet } = require('../utils/readFraudSpreadsheet');

test('reads the shipped fraud watch-list workbook without losing its header or rows', async () => {
  const filePath = path.join(__dirname, '..', 'data', 'fake_institutions.xlsx');
  const { sheetName, rows } = await readFraudSpreadsheet(filePath);
  assert.ok(sheetName);
  assert.ok(rows.length > 0);
  assert.ok(Object.keys(rows[0]).some((key) => key.trim().toLowerCase() === 'fake institutions'));
});
