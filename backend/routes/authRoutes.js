const express = require('express');
const {
  signupCompany,
  register,
  login,
  refresh,
  me,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', signupCompany);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', requireAuth, me);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
