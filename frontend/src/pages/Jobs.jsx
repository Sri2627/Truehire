import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Jobs() {
  const { hasRole } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', description: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function loadJobs() {
    setLoading(true);
    api
      .get('/jobs')
      .then((res) => setJobs(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(loadJobs, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/jobs', form);
      setForm({ title: '', description: '' });
      loadJobs();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create job posting');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(job) {
    const status = job.status === 'open' ? 'closed' : 'open';
    await api.patch(`/jobs/${job._id}/status`, { status });
    loadJobs();
  }

  const canManage = hasRole('admin', 'recruiter');

  return (
    <Layout>
      <div className="topbar">
        <h2>Jobs</h2>
      </div>

      {canManage && (
        <form className="card" onSubmit={handleAdd}>
          <h3 style={{ marginTop: 0 }}>Create a job posting</h3>
          <label>Job title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />

          <label style={{ marginTop: 10 }}>Job description</label>
          <textarea
            rows={6}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            placeholder="Responsibilities, requirements, etc."
          />

          <button className="btn-primary" type="submit" disabled={submitting} style={{ width: 180, marginTop: 12 }}>
            {submitting ? 'Creating…' : 'Create job'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No job postings yet{canManage ? ' — create one above before registering candidates.' : '.'}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Description</th>
                <th>Status</th>
                <th>Created</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id}>
                  <td>{j.title}</td>
                  <td style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>
                    {j.description.length > 160 ? j.description.slice(0, 160) + '…' : j.description}
                  </td>
                  <td>
                    <span className={`badge ${j.status === 'open' ? 'clear' : 'flagged'}`}>{j.status}</span>
                  </td>
                  <td>{new Date(j.createdAt).toLocaleDateString()}</td>
                  {canManage && (
                    <td>
                      <button onClick={() => toggleStatus(j)} style={{ fontSize: '0.8rem' }}>
                        Mark {j.status === 'open' ? 'closed' : 'open'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
