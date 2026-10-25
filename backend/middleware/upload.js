const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXT = ['.pdf', '.docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_BULK_FILES = 20;
const MAX_BULK_SIZE = 50 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    const error = new Error('Only PDF and DOCX resumes are supported');
    error.code = 'UNSUPPORTED_RESUME_TYPE';
    return cb(error);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_BULK_FILES, fields: 10, parts: MAX_BULK_FILES + 10 },
});

module.exports = { upload, UPLOAD_DIR, MAX_FILE_SIZE, MAX_BULK_FILES, MAX_BULK_SIZE };
