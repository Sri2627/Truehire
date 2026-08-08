// Central place for the MongoDB connection so both server.js and the
// one-off scripts (initDb.js) can reuse the same logic.
const mongoose = require('mongoose');

async function connectDB(uri) {
  const connectionString = uri || process.env.MONGO_URI;

  if (!connectionString) {
    throw new Error('MONGO_URI is not set. Copy .env.example to .env and fill it in.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(connectionString);

  console.log(`[db] connected to MongoDB -> ${mongoose.connection.name}`);

  return mongoose.connection;
}

module.exports = { connectDB };
