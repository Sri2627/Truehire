require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { connectDB } = require('./config/db');

// Register every Mongoose model up front. Requiring a model file is what
// calls mongoose.model(name, schema) - if a model is only ever required
// indirectly (e.g. via a script that isn't part of the normal server
// boot path), any .populate() against a ref to it throws
// "Schema hasn't been registered for model ..." the first time it's used.
require('./models/Company');
require('./models/User');
require('./models/FraudCompany');
require('./models/Job');
require('./models/Candidate');
require('./models/Screening');
require('./models/AuditLog');
require('./models/InterviewInvite');
require('./models/JobApplication');

const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const teamRoutes = require('./routes/teamRoutes');
const fraudRoutes = require('./routes/fraudRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const institutionRoutes = require('./routes/institutionRoutes');
const applicationRoutes = require('./routes/applicationRoutes');

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication requests. Try again later.' },
});
app.use('/auth/login', authLimiter);
app.use('/auth/refresh', authLimiter);
app.use('/auth/forgot-password', authLimiter);
app.use('/auth/reset-password', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth/signup', authLimiter);
app.use('/auth/jobseeker-signup', authLimiter);
app.use('/applications', rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many applications from this network. Try again later.' },
}));

app.use('/auth', authRoutes);
app.use('/jobs', jobRoutes);
app.use('/candidates', candidateRoutes);
app.use('/applications', applicationRoutes);
app.use('/candidates/:id/interviews', interviewRoutes);
app.use('/team', teamRoutes);
app.use('/fraud', fraudRoutes);
app.use('/institutions', institutionRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Resume files must be 10MB or smaller' });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_PART_COUNT') {
    return res.status(413).json({ error: 'Too many files or form fields in the upload' });
  }
  if (err.code === 'UNSUPPORTED_RESUME_TYPE') {
    return res.status(415).json({ error: err.message });
  }
  if (err.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ error: 'Origin is not allowed' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

if (
  !process.env.JWT_ACCESS_SECRET ||
  !process.env.JWT_REFRESH_SECRET ||
  process.env.JWT_ACCESS_SECRET.length < 32 ||
  process.env.JWT_REFRESH_SECRET.length < 32 ||
  process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET
) {
  console.error('[server] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different random secrets of at least 32 characters.');
  process.exit(1);
}

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] True Hire API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[server] Failed to connect to MongoDB:', err.message);
    console.error('Have you run "npm run init-db" and set up your .env file?');
    process.exit(1);
  });
