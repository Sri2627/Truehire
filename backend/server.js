require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { connectDB } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const teamRoutes = require('./routes/teamRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/candidates', candidateRoutes);
app.use('/team', teamRoutes);

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
