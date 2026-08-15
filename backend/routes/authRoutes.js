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
const { PLAN_PRICING, PLAN_LABELS, PLAN_LIMITS } = require('../config/plans');

const router = express.Router();

// GET /auth/plans - unauthenticated on purpose: the pricing page and the
// public Signup page (frontend/src/pages/Pricing.jsx, Signup.jsx) need
// this before anyone has an account, so it reads live from
// config/plans.js instead of the frontend hardcoding numbers that could
// drift out of sync with what POST /signup - and the job/candidate limit
// checks in jobRoutes.js/candidateRoutes.js - actually enforce.
router.get('/plans', (req, res) => {
  const plans = Object.keys(PLAN_PRICING).map((key) => ({
    value: key,
    label: PLAN_LABELS[key] || key,
    monthlyPrice: PLAN_PRICING[key],
    // Infinity -> null over JSON; frontend renders null as "Unlimited".
    jobLimit: Number.isFinite(PLAN_LIMITS[key]?.jobs) ? PLAN_LIMITS[key].jobs : null,
    candidateLimit: Number.isFinite(PLAN_LIMITS[key]?.candidates) ? PLAN_LIMITS[key].candidates : null,
  }));
  res.json({ plans });
});

router.post('/signup', signupCompany);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', requireAuth, me);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
