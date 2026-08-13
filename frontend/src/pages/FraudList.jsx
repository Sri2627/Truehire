import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Pagination from '../components/Pagination.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

// "Add a company to the watch-list" flow, in a popup - same pattern as the
// job/candidate creation modals elsewhere in the app.
function NewFraudCompanyModal({ onClose, onAdded }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/fraud', { name });
      onAdded(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add company');
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

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>Add a company to the watch-list</h3>
        <form onSubmit={handleAdd}>
          <label>Company name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 3 Star Communication Pvt Ltd"
            required
            autoFocus
          />

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
              {saving ? 'Adding…' : 'Add company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete button with an inline "are you sure" confirm step, matching the
// pattern used for deleting candidates.
function DeleteEntryButton({ entry, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/fraud/${entry._id}`);
      onDeleted(entry._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove entry');
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
          <span style={{ color: 'var(--muted)' }}>Remove?</span>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            style={{ background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
          >
            {deleting ? 'Removing…' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={deleting}
            style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
        {error && <p className="error-text" style={{ marginTop: 4 }}>{error}</p>}
      </td>
    );
  }

  return (
    <td>
      <button
        onClick={() => setConfirming(true)}
        title="Remove from watch-list"
        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem' }}
      >
        Remove
      </button>
    </td>
  );
}

export default function FraudList() {
  // Read-only for superadmin (browsing another institution's list) —
  // adding/removing entries stays admin-only, matching the backend
  // (routes/fraudRoutes.js POST/DELETE are requireRole('admin')).
  const { hasRole } = useAuth();
  const canManage = hasRole('admin');
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  function loadEntries(searchValue = search, pageValue = page) {
    setLoading(true);
    api
      .get('/fraud', { params: { search: searchValue || undefined, page: pageValue, limit: 10 } })
      .then((res) => {
        setEntries(Array.isArray(res.data.items) ? res.data.items : []);
        setPageInfo({ total: res.data.total || 0, totalPages: res.data.totalPages || 1 });
      })
      .catch(() => setError('Could not load the fraud watch-list'))
      .finally(() => setLoading(false));
  }

  // Initial load.
  useEffect(() => loadEntries('', 1), []);

  // Debounce the search box, and reset to page 1 whenever it changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadEntries(search, 1);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handlePageChange(nextPage) {
    setPage(nextPage);
    loadEntries(search, nextPage);
  }

  function handleAdded() {
    // Simplest correct way to reflect a new entry under the current
    // search/page state (which page it lands on depends on sort order) -
    // just reload page 1.
    setPage(1);
    loadEntries(search, 1);
  }

  function handleDeleted(id) {
    setEntries((prev) => prev.filter((e) => e._id !== id));
    setPageInfo((prev) => ({ ...prev, total: Math.max(prev.total - 1, 0) }));
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Fraud watch-list</h2>
        {canManage && (
          <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ width: 180 }}>
            + Add new company
          </button>
        )}
      </div>

      {showAddModal && (
        <NewFraudCompanyModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />
      )}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ margin: 0 }}>Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company name…"
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
                <th>Company</th>
                <th>Source</th>
                <th>Added by</th>
                <th>Added</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id}>
                  <td>{entry.name}</td>
                  <td>{entry.source === 'excel_upload' ? 'Excel upload' : 'Manual entry'}</td>
                  <td>{entry.addedBy?.name || '—'}</td>
                  <td>{new Date(entry.addedAt).toLocaleDateString()}</td>
                  {canManage && <DeleteEntryButton entry={entry} onDeleted={handleDeleted} />}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && entries.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>
            {search
              ? 'No companies match your search.'
              : canManage
              ? 'No companies on the watch-list yet — click "+ Add new company" above.'
              : 'No companies on this institution\u2019s watch-list yet.'}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <Pagination page={page} totalPages={pageInfo.totalPages} total={pageInfo.total} onChange={handlePageChange} />
      </div>
    </Layout>
  );
}
