import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Pagination from '../components/Pagination.jsx';
import api from '../api';

const EMPTY_FORM = {
  name: '',
  plan: 'free',
  addAdmin: false,
  adminName: '',
  adminEmail: '',
  adminMobile: '',
  adminPassword: '',
};

// "Add a new institution" flow, in a popup - same pattern as the other
// creation modals in the app (Team, FraudList, JobForm). Optionally
// creates that institution's first admin user in the same step.
function NewInstitutionModal({ onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('An institution name is required');
      return;
    }
    if (form.addAdmin && !form.adminEmail.trim() && !form.adminMobile.trim()) {
      setError('Provide an email or mobile for the institution\u2019s admin');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        plan: form.plan,
        admin: form.addAdmin
          ? {
              name: form.adminName,
              email: form.adminEmail || undefined,
              mobile: form.adminMobile || undefined,
              password: form.adminPassword,
            }
          : undefined,
      };
      const { data } = await api.post('/institutions', payload);
      onAdded(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create institution');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={saving ? undefined : onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
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

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>Add a new institution</h3>
        <form onSubmit={handleSubmit}>
          <label>Institution name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme Talent Solutions"
            required
            autoFocus
          />

          <label style={{ marginTop: 10 }}>Plan</label>
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            <option value="free">Free — ₹0</option>
            <option value="pro">Pro — ₹4,999/month</option>
            <option value="enterprise">Enterprise — ₹19,999/month</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={form.addAdmin}
              onChange={(e) => setForm({ ...form, addAdmin: e.target.checked })}
            />
            Add its first admin user now
          </label>

          {form.addAdmin && (
            <div style={{ marginTop: 4 }}>
              <label>Admin name</label>
              <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />

              <label style={{ marginTop: 10 }}>Admin email</label>
              <input
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              />

              <label style={{ marginTop: 10 }}>Admin mobile</label>
              <input value={form.adminMobile} onChange={(e) => setForm({ ...form, adminMobile: e.target.value })} />

              <label style={{ marginTop: 10 }}>Temporary password</label>
              <input
                type="password"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                required
              />
            </div>
          )}

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
            <button className="btn-primary" type="submit" disabled={saving} style={{ width: 170, height: 38 }}>
              {saving ? 'Creating…' : 'Create institution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Institutions() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  function loadInstitutions(searchValue = search, pageValue = page) {
    setLoading(true);
    api
      .get('/institutions', { params: { search: searchValue || undefined, page: pageValue, limit: 10 } })
      .then((res) => {
        setItems(Array.isArray(res.data.items) ? res.data.items : []);
        setPageInfo({ total: res.data.total || 0, totalPages: res.data.totalPages || 1 });
      })
      .catch(() => setError('Could not load institutions'))
      .finally(() => setLoading(false));
  }

  useEffect(() => loadInstitutions('', 1), []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadInstitutions(search, 1);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handlePageChange(nextPage) {
    setPage(nextPage);
    loadInstitutions(search, nextPage);
  }

  function handleAdded() {
    setPage(1);
    loadInstitutions(search, 1);
  }

  // "View" opens this institution in its own new tab rather than
  // navigating in-app - each tab then has its own independent selected
  // institution (see AuthContext.jsx), so a superadmin can have two
  // institutions' data open side by side without one clobbering the
  // other. Named window target (not plain '_blank') so clicking View on
  // the SAME institution again reuses its existing tab instead of
  // spawning duplicates - only a genuinely different institution opens a
  // genuinely new tab.
  function handleView(inst) {
    const params = new URLSearchParams({ institution: inst._id, institutionName: inst.name || '' });
    window.open(`/dashboard?${params.toString()}`, `institution-${inst._id}`);
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Institutions</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ width: 190 }}>
          + Add new institution
        </button>
      </div>

      {showAddModal && <NewInstitutionModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ margin: 0 }}>Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by institution name…"
          style={{ maxWidth: 320 }}
        />
        {search && (
          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
            {loading ? 'Searching…' : `${pageInfo.total} match${pageInfo.total === 1 ? '' : 'es'}`}
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
                <th>Institution</th>
                <th>Plan</th>
                <th>Users</th>
                <th>Jobs</th>
                <th>Candidates</th>
                <th>Fraud entries</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((inst) => (
                <tr key={inst._id}>
                  <td style={{ fontWeight: 600 }}>{inst.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{inst.plan || 'free'}</td>
                  <td>{inst.userCount}</td>
                  <td>{inst.jobCount}</td>
                  <td>{inst.candidateCount}</td>
                  <td>{inst.fraudCount}</td>
                  <td>{new Date(inst.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => handleView(inst)}
                      style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && items.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>
            {search ? 'No institutions match your search.' : 'No institutions yet — click "+ Add new institution" above.'}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <Pagination page={page} totalPages={pageInfo.totalPages} total={pageInfo.total} onChange={handlePageChange} />
      </div>
    </Layout>
  );
}
