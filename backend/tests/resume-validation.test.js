const test = require('node:test');
const assert = require('node:assert/strict');
const { extractResumeText } = require('../utils/extractResumeText');

test('rejects a renamed non-PDF file before parsing', async () => {
  await assert.rejects(
    extractResumeText(Buffer.from('not a PDF'), 'resume.pdf'),
    /not a valid PDF/
  );
});

test('rejects a renamed non-DOCX file before parsing', async () => {
  await assert.rejects(
    extractResumeText(Buffer.from('not a DOCX'), 'resume.docx'),
    /not a valid DOCX/
  );
});

test('rejects unsupported file extensions', async () => {
  await assert.rejects(
    extractResumeText(Buffer.from('content'), 'resume.txt'),
    /Unsupported file type/
  );
});
