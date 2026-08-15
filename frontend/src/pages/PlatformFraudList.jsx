import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Pagination from '../components/Pagination.jsx';
import api from '../api';

const FRAUD_TABS = [
  { key: '', label: 'All entries' },
  { key: 'global', label: 'Original platform list' },
  { key: 'institutions', label: 'Added by institutions' },
];

// "Add a company to the platform-wide list" flow - same pattern as the
// tenant-scoped NewFraudCompanyModal on pages/FraudList.jsx, just posting
// to /fraud/platform (companyId: null) instead of the caller's own
// institution.
function NewPlatformFraudCompanyModal({ onClose, onAdded }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/fraud/platform', { name });
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

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>Add a company to the platform-wide list</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: -6 }}>
          Visible to every institution's screening, not just one tenant.
        </p>
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

// Remove button for a platform-wide entry, with an inline "are you sure"
// confirm step. Only ever rendered for companyId: null rows (see the
// table below) - an institution's own addition can't be removed from
// here, only from that institution's own /fraud page.
function DeleteEntryButton({ entry, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/fraud/platform/${entry._id}`);
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
        title="Remove from platform-wide watch-list"
        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem' }}
      >
        Remove
      </button>
    </td>
  );
}

// Cross-tenant fraud watch-list - the "who added what, across every
// institution" view a superadmin can't get from /fraud (that page is
// always scoped to one institution at a time, via x-company-id). Lives
// on its own menu item/route rather than embedded in the dashboard, so
// it's reachable directly instead of having to scroll past the overview
// stats every time.
export default function PlatformFraudList() {
  const [tab, setTab] = useState('');
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  function load(tabValue = tab, searchValue = search, pageValue = page) {
    setLoading(true);
    setError('');
    const params = { search: searchValue || undefined, page: pageValue, limit: 15 };
    if (tabValue) params.companyId = tabValue; // 'global' | 'institutions'
    api
      .get('/fraud/platform', { params })
      .then((res) => {
        setItems(Array.isArray(res.data.items) ? res.data.items : []);
        setPageInfo({ total: res.data.total || 0, totalPages: res.data.totalPages || 1 });
      })
      .catch(() => setError('Could not load the platform fraud list'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setPage(1);
    load(tab, search, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      load(tab, search, 1);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handlePageChange(nextPage) {
    setPage(nextPage);
    load(tab, search, nextPage);
  }

  function handleAdded() {
    // Simplest correct way to reflect a new entry regardless of current
    // tab/search/sort - just reload from page 1. Also jump to the
    // "Original platform list" tab so the newly-added entry is actually
    // visible (it wouldn't show up under "Added by institutions").
    setTab('global');
    setPage(1);
    load('global', search, 1);
  }

  function handleDeleted(id) {
    setItems((prev) => prev.filter((e) => e._id !== id));
    setPageInfo((prev) => ({ ...prev, total: Math.max(prev.total - 1, 0) }));
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Fraud watch-list</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ width: 200 }}>
          + Add to platform list
        </button>
      </div>

      {showAddModal && (
        <NewPlatformFraudCompanyModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {FRAUD_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  background: tab === t.key ? 'var(--grad, #7c5cff)' : 'none',
                  color: tab === t.key ? '#fff' : 'var(--ink)',
                  border: tab === t.key ? 'none' : '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name…"
            style={{ maxWidth: 260 }}
          />
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Flagged company</th>
                <th>Added by institution</th>
                <th>Added by user</th>
                <th>Source</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry._id}>
                  <td style={{ fontWeight: 600 }}>{entry.name}</td>
                  <td>
                    {entry.companyId?.name ? (
                      entry.companyId.name
                    ) : (
                      <span className="badge role">Platform-wide</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{entry.addedBy?.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{entry.source.replace('_', ' ')}</td>
                  <td>{new Date(entry.addedAt).toLocaleDateString()}</td>
                  {entry.companyId ? (
                    <td style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Manage from that institution's page</td>
                  ) : (
                    <DeleteEntryButton entry={entry} onDeleted={handleDeleted} />
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && items.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>
            {search ? 'No companies match your search.' : 'No fraud watch-list entries yet.'}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <Pagination page={page} totalPages={pageInfo.totalPages} total={pageInfo.total} onChange={handlePageChange} />
      </div>
    </Layout>
  );
}
