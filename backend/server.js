require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
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

const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const teamRoutes = require('./routes/teamRoutes');
const fraudRoutes = require('./routes/fraudRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const institutionRoutes = require('./routes/institutionRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/jobs', jobRoutes);
app.use('/candidates', candidateRoutes);
app.use('/candidates/:id/interviews', interviewRoutes);
app.use('/team', teamRoutes);
app.use('/fraud', fraudRoutes);
app.use('/institutions', institutionRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] True Hire API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[server] Failed to connect to MongoDB:', err.message);
    console.error('Have you run "npm run init-db" and set up your .env file?');
    process.exit(1);
  });
