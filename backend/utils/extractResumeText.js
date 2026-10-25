const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

function invalidResume(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

// Extracts plain text from a resume file buffer.
// Same file-type support as the original ProfileXRay tool: PDF and DOCX
// are read; legacy .doc is explicitly rejected as unsupported.
async function extractResumeText(buffer, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();

  if (ext === '.pdf') {
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw invalidResume('The uploaded file is not a valid PDF');
    }
    try {
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (err) {
      throw invalidResume('Could not read the uploaded PDF');
    }
  }

  if (ext === '.docx') {
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
      throw invalidResume('The uploaded file is not a valid DOCX document');
    }
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (err) {
      throw invalidResume('Could not read the uploaded DOCX document');
    }
  }

  if (ext === '.doc') {
    throw invalidResume('Legacy .doc files are not supported — please upload PDF or DOCX');
  }

  throw invalidResume(`Unsupported file type "${ext || 'unknown'}" — please upload PDF or DOCX`);
}

module.exports = { extractResumeText };
