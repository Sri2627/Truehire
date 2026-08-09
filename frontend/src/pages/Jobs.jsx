import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Pagination from '../components/Pagination.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

// "Create a job posting" flow, in a popup - same pattern as the
// candidate-registration modal on the Candidates page: fill the form,
// submit, close. Keeps the Jobs page itself to just a list + a button,
// instead of an always-open form taking up space above the table.
function NewJobModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/jobs', form);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create job posting');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={submitting ? undefined : onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          disabled={submitting}
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

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>Create a job posting</h3>
        <form onSubmit={handleAdd}>
          <label>Job title</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            autoFocus
          />

          <label style={{ marginTop: 10 }}>Job description</label>
          <textarea
            rows={8}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            placeholder="Responsibilities, requirements, etc."
          />

          {error && <p className="error-text">{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', marginTop: '20px', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={submitting} style={{ width: 180, height: 38 }}>
              {submitting ? 'Creating…' : 'Create job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete button for a job with zero candidates registered against it -
// same inline "are you sure" confirm pattern as DeleteCandidateButton on
// the Candidates page. Jobs with candidates never render this (the
// backend blocks that delete too, so this is a UX shortcut, not the only
// guard).
function DeleteJobButton({ job, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/jobs/${job._id}`);
      onDeleted(job._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete job');
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
        <span style={{ color: 'var(--muted)' }}>Delete "{job.title}"?</span>
        <button
          onClick={handleConfirm}
          disabled={deleting}
          style={{ background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
        >
          {deleting ? 'Deleting…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
        >
          Cancel
        </button>
        {error && <span className="error-text" style={{ marginLeft: 4 }}>{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Delete job posting"
      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem' }}
    >
      Delete
    </button>
  );
}

export default function Jobs() {
  const { hasRole } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 });

  function loadJobs(searchValue = search, pageValue = page) {
    setLoading(true);
    setError('');
    api
      .get('/jobs', { params: { search: searchValue || undefined, page: pageValue, limit: 10 } })
      .then((res) => {
        setJobs(Array.isArray(res.data.items) ? res.data.items : []);
        setPageInfo({ total: res.data.total || 0, totalPages: res.data.totalPages || 1 });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load job postings'))
      .finally(() => setLoading(false));
  }

  // Initial load.
  useEffect(() => loadJobs('', 1), []);

  // Debounce the search box, and reset to page 1 whenever it changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadJobs(search, 1);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handlePageChange(nextPage) {
    setPage(nextPage);
    loadJobs(search, nextPage);
  }

  async function toggleStatus(job) {
    const status = job.status === 'open' ? 'closed' : 'open';
    await api.patch(`/jobs/${job._id}/status`, { status });
    loadJobs();
  }

  function handleJobDeleted(jobId) {
    setJobs((prev) => prev.filter((j) => j._id !== jobId));
    setPageInfo((prev) => ({ ...prev, total: Math.max(prev.total - 1, 0) }));
  }

  const canManage = hasRole('admin', 'recruiter');

  return (
    <Layout>
      <div className="topbar">
        <h2>Jobs</h2>
        {canManage && (
          <button className="btn-primary" onClick={() => setShowNewJobModal(true)} style={{ width: 180 }}>
            + Create job posting
          </button>
        )}
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ margin: 0 }}>Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job title…"
          style={{ maxWidth: 320 }}
        />
        {search && (
          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
            {loading ? 'Searching…' : `${pageInfo.total} match${pageInfo.total === 1 ? '' : 'es'}`}
          </span>
        )}
      </div>

      {showNewJobModal && (
        <NewJobModal onClose={() => setShowNewJobModal(false)} onCreated={() => loadJobs(search, 1)} />
      )}

      <div className="card">
        {error && <p className="error-text">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            {search
              ? 'No job postings match your search.'
              : `No job postings yet${canManage ? ' — click "+ Create job posting" above before registering candidates.' : '.'}`}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Description</th>
                <th>Status</th>
                <th>Candidates</th>
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
                  <td>
                    <Link to={`/candidates?jobId=${j._id}`}>{j.candidateCount ?? 0}</Link>
                  </td>
                  <td>{new Date(j.createdAt).toLocaleDateString()}</td>
                  {canManage && (
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button onClick={() => toggleStatus(j)} style={{ fontSize: '0.8rem' }}>
                          Mark {j.status === 'open' ? 'closed' : 'open'}
                        </button>
                        {(j.candidateCount ?? 0) === 0 && (
                          <DeleteJobButton job={j} onDeleted={handleJobDeleted} />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={pageInfo.totalPages} total={pageInfo.total} onChange={handlePageChange} />
      </div>
    </Layout>
  );
}
