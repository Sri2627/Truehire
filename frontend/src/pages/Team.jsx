import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../api';

const ROLES = ['admin', 'recruiter', 'viewer'];

const EMPTY_FORM = { name: '', email: '', mobile: '', password: '', role: 'recruiter' };

function AddUserForm({ onAdded }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.email && !form.mobile) {
      setError('Provide an email or a mobile number for the new user');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post('/team', form);
      onAdded(data);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 style={{ marginTop: 0 }}>Add a user</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Mobile</label>
          <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Temporary password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        <div style={{ minWidth: 120 }}>
          <label>Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn-primary" type="submit" disabled={saving} style={{ width: 160, marginTop: 12 }}>
        {saving ? 'Adding…' : 'Add user'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

export default function Team() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadTeam() {
    setLoading(true);
    api
      .get('/team')
      .then((res) => setTeam(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(loadTeam, []);

  async function changeRole(userId, role) {
    await api.patch(`/team/${userId}/role`, { role });
    loadTeam();
  }

  function handleAdded(user) {
    setTeam((prev) => [...prev, user]);
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Team &amp; roles</h2>
      </div>

      <AddUserForm onAdded={handleAdded} />

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member._id}>
                  <td>{member.name}</td>
                  <td>{member.email}</td>
                  <td>
                    <select value={member.role} onChange={(e) => changeRole(member._id, e.target.value)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
