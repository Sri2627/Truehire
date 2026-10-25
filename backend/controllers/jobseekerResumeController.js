const fs = require('fs/promises');
const path = require('path');
const User = require('../models/User');
const { UPLOAD_DIR } = require('../middleware/upload');
const { extractResumeText } = require('../utils/extractResumeText');

function resumePath(fileKey) {
  if (!fileKey || path.basename(fileKey) !== fileKey) return null;
  const filePath = path.resolve(UPLOAD_DIR, fileKey);
  return filePath.startsWith(`${path.resolve(UPLOAD_DIR)}${path.sep}`) ? filePath : null;
}

async function uploadJobseekerResume(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a PDF or DOCX resume to upload' });

  let user;
  try {
    await extractResumeText(await fs.readFile(file.path), file.originalname);
    user = await User.findById(req.user.id);
    if (!user || user.role !== 'jobseeker') {
      await fs.unlink(file.path).catch((err) => {
        if (err.code !== 'ENOENT') console.error('[jobseeker resume] temporary file cleanup failed:', err.message);
      });
      return res.status(user ? 403 : 404).json({ error: user ? 'Jobseeker profile access required' : 'User not found' });
    }

    const previousFile = resumePath(user.profile?.resume?.fileKey);
    user.set('profile.resume', {
      fileKey: path.basename(file.filename),
      originalName: path.basename(file.originalname.replace(/\\/g, '/')),
      uploadedAt: new Date(),
    });
    await user.save();

    if (previousFile && previousFile !== path.resolve(file.path)) {
      await fs.unlink(previousFile).catch((err) => {
        if (err.code !== 'ENOENT') console.error('[jobseeker resume] replaced resume cleanup failed:', err.message);
      });
    }

    return res.status(201).json({
      resume: {
        originalName: user.profile.resume.originalName,
        uploadedAt: user.profile.resume.uploadedAt,
      },
    });
  } catch (err) {
    await fs.unlink(file.path).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('[jobseeker resume] temporary file cleanup failed:', cleanupError.message);
    });
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    console.error('[jobseeker resume] upload failed:', err.message);
    throw err;
  }
}

async function downloadJobseekerResume(req, res) {
  const user = await User.findOne({ _id: req.user.id, role: 'jobseeker' }).select('profile.resume');
  if (!user) return res.status(404).json({ error: 'Profile not found' });
  const fileKey = user.profile?.resume?.fileKey;
  const filePath = resumePath(fileKey);
  if (!filePath) return res.status(404).json({ error: 'No resume has been uploaded' });

  try {
    await fs.access(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'The stored resume file is unavailable' });
    throw err;
  }

  return res.download(filePath, user.profile.resume.originalName || path.basename(filePath));
}

async function deleteJobseekerResume(req, res) {
  const user = await User.findOne({ _id: req.user.id, role: 'jobseeker' });
  if (!user) return res.status(404).json({ error: 'Profile not found' });
  const filePath = resumePath(user.profile?.resume?.fileKey);
  if (!filePath) return res.status(404).json({ error: 'No resume has been uploaded' });

  user.set('profile.resume', undefined);
  await user.save();
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[jobseeker resume] file removal failed:', err.message);
      return res.status(500).json({ error: 'Resume was removed from your profile, but its file could not be deleted' });
    }
  }
  return res.json({ message: 'Resume removed from your profile' });
}

module.exports = { uploadJobseekerResume, downloadJobseekerResume, deleteJobseekerResume };
