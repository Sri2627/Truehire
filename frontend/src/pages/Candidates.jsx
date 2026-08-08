import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Candidates() {
  const { hasRole } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadCandidates() {
    setLoading(true);
    api
      .get('/candidates')
      .then((res) => setCandidates(res.data))
      .catch(() => setError('Could not load candidates'))
      .finally(() => setLoading(false));
  }

  useEffect(loadCandidates, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/candidates', form);
      setForm({ name: '', email: '', phone: '' });
      loadCandidates();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add candidate');
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Candidates</h2>
      </div>

      {hasRole('admin', 'recruiter') && (
        <form className="card" onSubmit={handleAdd}>
          <h3 style={{ marginTop: 0 }}>Add a candidate</h3>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <button className="btn-primary" type="submit" style={{ width: 160 }}>
            Add candidate
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c._id}>
                  <td>{c.name || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
