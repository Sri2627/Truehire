import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import JobFormFields, { skillRowsFromJob, panelStringFromJob } from '../components/JobForm.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

// Read-only detail view. Broken out from JobDetails so the "editing"
// branch below can stay focused on the form.
function JobView({ job, canManage, onEdit, onToggleStatus, onDeleted }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const navigate = useNavigate();

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/jobs/${job._id}`);
      onDeleted();
      navigate('/jobs');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Could not delete job');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <span className={`badge ${job.status === 'open' ? 'clear' : 'flagged'}`}>{job.status}</span>
            <h2 style={{ margin: '10px 0 4px' }}>{job.title}</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
              Created {new Date(job.createdAt).toLocaleDateString()} ·{' '}
              <Link to={`/candidates?jobId=${job._id}`}>{job.candidateCount ?? 0} candidate{job.candidateCount === 1 ? '' : 's'}</Link>
              {' · '}
              <Link to={`/jobs/${job._id}/matches`}>View matches →</Link>
            </p>
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={onEdit} style={{ fontSize: '0.82rem' }}>
                Edit
              </button>
              <button onClick={onToggleStatus} style={{ fontSize: '0.82rem' }}>
                Mark {job.status === 'open' ? 'closed' : 'open'}
              </button>
            </div>
          )}
        </div>

        <h3 style={{ marginTop: 24 }}>Description</h3>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{job.description}</p>
      </div>

      <div className="card">
        <h3>Ranking criteria</h3>
        {job.requiredSkills?.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {job.requiredSkills.map((s, i) => (
              <span
                key={i}
                style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 999, background: 'var(--panel-2)', color: 'var(--ink)' }}
              >
                {s.name} · weight {s.weight}
                {s.minYears ? ` · ${s.minYears}+ yrs` : ''}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No required skills configured yet — {canManage ? 'click "Edit" above to add some.' : 'ranking is unavailable until an admin or recruiter adds some.'}
          </p>
        )}
        {job.minExperienceYears ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.84rem', marginTop: 12, marginBottom: 0 }}>
            Minimum overall experience: {job.minExperienceYears} years
          </p>
        ) : null}
        <p style={{ color: 'var(--muted)', fontSize: '0.84rem', marginTop: 12, marginBottom: 0 }}>
          Interview panel (CC'd on invitation emails):{' '}
          {job.interviewPanel?.length ? job.interviewPanel.join(', ') : canManage ? 'none set — click "Edit" above to add some.' : 'none set'}
        </p>
      </div>

      {canManage && (job.candidateCount ?? 0) === 0 && (
        <div className="card">
          <h3>Danger zone</h3>
          {confirmingDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem' }}>
              <span>Delete "{job.title}"? This can't be undone.</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              {deleteError && <span className="error-text">{deleteError}</span>}
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              style={{ background: 'none', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: '0.84rem' }}
            >
              Delete job posting
            </button>
          )}
        </div>
      )}
    </>
  );
}

// Inline edit form - same field set as job creation (JobFormFields),
// pre-filled from the job being edited, submitted via PATCH /jobs/:id.
function JobEdit({ job, onSaved, onCancel }) {
  const [form, setForm] = useState({
    title: job.title,
    description: job.description,
    minExperienceYears: job.minExperienceYears ?? '',
    interviewPanel: panelStringFromJob(job),
  });
  const [skills, setSkills] = useState(skillRowsFromJob(job));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    for (const s of skills) {
      if (!s.name.trim()) {
        setError('Every required skill needs a name (or remove the empty row)');
        return;
      }
    }

    setSaving(true);
    try {
      const { data } = await api.patch(`/jobs/${job._id}`, {
        ...form,
        requiredSkills: skills.map((s) => ({ name: s.name, weight: s.weight, minYears: s.minYears })),
        interviewPanel: form.interviewPanel.split(',').map((e) => e.trim()).filter(Boolean),
      });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Edit job posting</h3>
      <form onSubmit={handleSubmit}>
        <JobFormFields form={form} setForm={setForm} skills={skills} setSkills={setSkills} autoFocusTitle />

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', marginTop: '20px', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button className="btn-primary" type="submit" disabled={saving} style={{ width: 160, height: 38 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function JobDetails() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  function loadJob() {
    setLoading(true);
    setError('');
    api
      .get(`/jobs/${id}`)
      .then((res) => setJob(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load this job posting'))
      .finally(() => setLoading(false));
  }

  useEffect(loadJob, [id]);

  async function toggleStatus() {
    const status = job.status === 'open' ? 'closed' : 'open';
    const { data } = await api.patch(`/jobs/${job._id}/status`, { status });
    setJob((prev) => ({ ...prev, status: data.status }));
  }

  function handleSaved(updated) {
    setJob((prev) => ({ ...prev, ...updated }));
    setEditing(false);
  }

  const canManage = hasRole('admin', 'recruiter');

  return (
    <Layout>
      <div className="topbar">
        <div>
          <Link to="/jobs" style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            ← Jobs
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <p>Loading…</p>
        </div>
      ) : error ? (
        <div className="card">
          <p className="error-text" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : editing ? (
        <JobEdit job={job} onSaved={handleSaved} onCancel={() => setEditing(false)} />
      ) : (
        <JobView
          job={job}
          canManage={canManage}
          onEdit={() => setEditing(true)}
          onToggleStatus={toggleStatus}
          onDeleted={() => {}}
        />
      )}
    </Layout>
  );
}
