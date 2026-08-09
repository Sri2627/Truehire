import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../api';

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
  const [entries, setEntries] = useState([]);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addError, setAddError] = useState('');

  function loadEntries(searchValue) {
    setLoading(true);
    api
      .get('/fraud', { params: searchValue ? { search: searchValue } : {} })
      .then((res) => setEntries(Array.isArray(res.data) ? res.data : []))
      .catch(() => setError('Could not load the fraud watch-list'))
      .finally(() => setLoading(false));
  }

  // Initial load.
  useEffect(() => loadEntries(''), []);

  // Debounce the search box so we're not firing a request on every
  // keystroke.
  useEffect(() => {
    const timer = setTimeout(() => loadEntries(search), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setAddError('');
    try {
      const { data } = await api.post('/fraud', { name });
      // Only splice the new entry into the visible list if it would
      // actually match the current search filter.
      if (!search.trim() || data.name.toLowerCase().includes(search.trim().toLowerCase())) {
        setEntries((prev) => [data, ...prev]);
      }
      setName('');
    } catch (err) {
      setAddError(err.response?.data?.error || 'Could not add company');
    } finally {
      setSaving(false);
    }
  }

  function handleDeleted(id) {
    setEntries((prev) => prev.filter((e) => e._id !== id));
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Fraud watch-list</h2>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <form onSubmit={handleAdd} style={{ flex: 1, minWidth: 280 }}>
            <h3 style={{ marginTop: 0 }}>Add a company to the watch-list</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>Company name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 3 Star Communication Pvt Ltd"
                  required
                />
              </div>
              <button className="btn-primary" type="submit" disabled={saving} style={{ width: 140 }}>
                {saving ? 'Adding…' : 'Add company'}
              </button>
            </div>
            {addError && <p className="error-text">{addError}</p>}
          </form>

          <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />

          <div style={{ flex: 1, minWidth: 280 }}>
            <h3 style={{ marginTop: 0 }}>Search watch-list</h3>
            <label>Company name</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company name…"
            />
            {search && (
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 6 }}>
                {loading ? 'Searching…' : `${entries.length} match${entries.length === 1 ? '' : 'es'}`}
              </p>
            )}
          </div>
        </div>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id}>
                  <td>{entry.name}</td>
                  <td>{entry.source === 'excel_upload' ? 'Excel upload' : 'Manual entry'}</td>
                  <td>{entry.addedBy?.name || '—'}</td>
                  <td>{new Date(entry.addedAt).toLocaleDateString()}</td>
                  <DeleteEntryButton entry={entry} onDeleted={handleDeleted} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && entries.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>
            {search ? 'No companies match your search.' : 'No companies on the watch-list yet — add one above.'}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Layout>
  );
}
