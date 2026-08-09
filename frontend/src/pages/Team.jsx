import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../api';

const ROLES = ['admin', 'recruiter', 'viewer'];

const EMPTY_FORM = { name: '', email: '', mobile: '', password: '', role: 'recruiter' };

// "Add a user" flow, in a popup - same pattern as the job/candidate/fraud
// creation modals elsewhere in the app.
function NewUserModal({ onClose, onAdded }) {
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
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={saving ? undefined : onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 500, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          disabled={saving}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '1.3rem',
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>Add a user</h3>
        <form onSubmit={handleSubmit}>
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />

          <label style={{ marginTop: 10 }}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <label style={{ marginTop: 10 }}>Mobile</label>
          <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />

          <label style={{ marginTop: 10 }}>Temporary password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          <label style={{ marginTop: 10 }}>Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {error && <p className="error-text">{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer', marginTop: 20 }}
            >
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={saving} style={{ width: 140, height: 38 }}>
              {saving ? 'Adding…' : 'Add user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Team() {
  const [team, setTeam] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  function loadTeam(searchValue = search) {
    setLoading(true);
    api
      .get('/team', { params: { search: searchValue || undefined } })
      .then((res) => setTeam(Array.isArray(res.data) ? res.data : []))
      .finally(() => setLoading(false));
  }

  // Initial load.
  useEffect(() => loadTeam(''), []);

  // Debounce the search box.
  useEffect(() => {
    const timer = setTimeout(() => loadTeam(search), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function changeRole(userId, role) {
    await api.patch(`/team/${userId}/role`, { role });
    loadTeam();
  }

  function handleAdded(user) {
    // The new user only actually belongs in the visible list if it
    // matches whatever's in the search box right now.
    if (!search.trim() || `${user.name} ${user.email || ''}`.toLowerCase().includes(search.trim().toLowerCase())) {
      setTeam((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Team &amp; roles</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ width: 160 }}>
          + Add new user
        </button>
      </div>

      {showAddModal && <NewUserModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ margin: 0 }}>Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          style={{ maxWidth: 320 }}
        />
        {search && (
          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
            {loading ? 'Searching…' : `${team.length} match${team.length === 1 ? '' : 'es'}`}
          </span>
        )}
      </div>

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
        {!loading && team.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>
            {search ? 'No team members match your search.' : 'No team members yet — click "+ Add new user" above.'}
          </p>
        )}
      </div>
    </Layout>
  );
}
