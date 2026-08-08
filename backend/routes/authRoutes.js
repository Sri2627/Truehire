const express = require('express');
const { register, login, refresh, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', requireAuth, me);

module.exports = router;
