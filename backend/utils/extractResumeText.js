const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Extracts plain text from a resume file buffer.
// Same file-type support as the original ProfileXRay tool: PDF and DOCX
// are read; legacy .doc is explicitly rejected as unsupported.
async function extractResumeText(buffer, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();

  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext === '.doc') {
    throw new Error('Legacy .doc files are not supported — please upload PDF or DOCX');
  }

  throw new Error(`Unsupported file type "${ext || 'unknown'}" — please upload PDF or DOCX`);
}

module.exports = { extractResumeText };
