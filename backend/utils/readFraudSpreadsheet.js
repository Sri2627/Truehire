const { readSheet } = require('read-excel-file/node');
const path = require('path');

async function readFraudSpreadsheet(filePath) {
  const sheet = await readSheet(filePath);
  if (!sheet.length) return { sheetName: path.basename(filePath), rows: [] };
  const headers = sheet[0].map((value) => String(value ?? '').trim());
  const rows = [];
  for (const row of sheet.slice(1)) {
    const values = headers.map((header, index) => [header, String(row[index] ?? '')]);
    if (values.some(([, value]) => value.trim())) rows.push(Object.fromEntries(values));
  }

  return { sheetName: path.basename(filePath), rows };
}

module.exports = { readFraudSpreadsheet };
