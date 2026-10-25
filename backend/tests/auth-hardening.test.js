const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');
require('express-async-errors');

process.env.JWT_ACCESS_SECRET = 'test_access_secret_with_more_than_32_chars';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_with_more_than_32_chars';

const authRoutes = require('../routes/authRoutes');
const candidateRoutes = require('../routes/candidateRoutes');
const applicationRoutes = require('../routes/applicationRoutes');

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

test('public requests cannot use employer registration or select a privileged role', async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Attacker', email: 'user@example.com', password: 'password123', role: 'superadmin' }),
    });
    assert.equal(response.status, 401);
  });
});

test('non-admin authenticated users cannot create employer accounts', async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  const token = jwt.sign({ id: 'user-id', role: 'recruiter', companyId: 'company-id' }, process.env.JWT_ACCESS_SECRET);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Attacker', email: 'user@example.com', password: 'password123', role: 'superadmin' }),
    });
    assert.equal(response.status, 403);
  });
});

test('institution admins cannot create superadmins or target another tenant', async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  const token = jwt.sign(
    { id: 'admin-id', role: 'admin', companyId: '507f1f77bcf86cd799439011' },
    process.env.JWT_ACCESS_SECRET
  );

  await withServer(app, async (baseUrl) => {
    const request = (body) => fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const privilegedRole = await request({
      name: 'Attacker',
      email: 'attacker@example.com',
      password: 'password123',
      role: 'superadmin',
    });
    assert.equal(privilegedRole.status, 400);

    const otherTenant = await request({
      name: 'Attacker',
      email: 'other@example.com',
      password: 'password123',
      companyId: '507f191e810c19729de860ea',
    });
    assert.equal(otherTenant.status, 403);
  });
});

test('jobseekers cannot use employer candidate endpoints', async () => {
  const app = express();
  app.use('/candidates', candidateRoutes);
  const token = jwt.sign({ id: 'jobseeker-id', role: 'jobseeker', companyId: null }, process.env.JWT_ACCESS_SECRET);

  await withServer(app, async (baseUrl) => {
    const candidateResponse = await fetch(`${baseUrl}/candidates`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(candidateResponse.status, 403);
  });
});

test('employer users cannot read a jobseeker application account', async () => {
  const app = express();
  app.use('/applications', applicationRoutes);
  const token = jwt.sign({ id: 'employer-id', role: 'recruiter', companyId: 'company-id' }, process.env.JWT_ACCESS_SECRET);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/applications`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
  });
});

test('only jobseekers can update the jobseeker profile endpoint', async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  const token = jwt.sign(
    { id: 'recruiter-id', role: 'recruiter', companyId: 'company-id' },
    process.env.JWT_ACCESS_SECRET
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/profile`, {
      method: 'PUT',
      headers: new Headers([['authorization', 'Bearer ' + token], ['content-type', 'application/json']]),
      body: JSON.stringify({ name: 'Changed Name', email: 'changed@example.com' }),
    });
    assert.equal(response.status, 403);
  });
});

test('only jobseekers can upload, download, or delete a profile resume', async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  const token = jwt.sign(
    { id: 'recruiter-id', role: 'recruiter', companyId: 'company-id' },
    process.env.JWT_ACCESS_SECRET
  );

  await withServer(app, async (baseUrl) => {
    const headers = new Headers([['authorization', `Bearer ${token}`]]);
    const uploadResponse = await fetch(`${baseUrl}/auth/profile/resume`, {
      method: 'POST',
      headers,
      body: new FormData(),
    });
    const downloadResponse = await fetch(`${baseUrl}/auth/profile/resume`, { headers });
    const deleteResponse = await fetch(`${baseUrl}/auth/profile/resume`, { method: 'DELETE', headers });

    assert.equal(uploadResponse.status, 403);
    assert.equal(downloadResponse.status, 403);
    assert.equal(deleteResponse.status, 403);
  });
});

test('Express 4 forwards rejected async route handlers to the error middleware', async () => {
  const app = express();
  app.get('/reject', async () => {
    throw new Error('expected test failure');
  });
  app.use((err, req, res, next) => res.status(500).json({ error: 'handled' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/reject`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'handled' });
  });
});
