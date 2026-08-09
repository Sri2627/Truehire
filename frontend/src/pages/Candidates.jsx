import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Pagination from '../components/Pagination.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

// Full-screen overlay shown while a resume is being scanned. Stays open
// for the real duration of the request (extract + match usually takes
// well under a second, but a large PDF or a cold server can take longer)
// with a small minimum display time so it never just flashes on screen.
function ScanningOverlay({ stage }) {
  return (
    <div className="scanning-overlay">
      <div className="scanning-card">
        <div className="spinner" />
        <p className="scanning-title">Screening resume…</p>
        <p className="scanning-stage">{stage}</p>
      </div>
    </div>
  );
}

const MIN_OVERLAY_MS = 1400;

async function withMinDuration(promise, setStage) {
  const start = Date.now();
  setStage('Extracting resume text…');
  const result = await promise;
  setStage('Matching against fraud watch-list…');
  const elapsed = Date.now() - start;
  if (elapsed < MIN_OVERLAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_OVERLAY_MS - elapsed));
  }
  return result;
}

// Prominent, immediate result panel shown right after a candidate is
// registered + screened - mirrors ProfileXRay's "upload, get a verdict"
// directness instead of making the user go find the badge in the table.
function ScanResultPanel({ result, onDismiss, bare }) {
  if (!result) return null;
  const { candidateName, screening } = result;
  const flagged = screening.verdict === 'flagged';

  return (
    <div className={bare ? '' : `card scan-result ${flagged ? 'scan-result-flagged' : 'scan-result-clear'}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={`badge ${screening.verdict}`} style={{ fontSize: '0.9rem' }}>
            {flagged ? 'FLAGGED - possible fraud' : 'VERIFIED - clear'}
          </span>
          <p style={{ margin: '10px 0 0', fontWeight: 600 }}>{candidateName}'s resume has been screened.</p>
          {flagged ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--danger)', fontSize: '0.86rem' }}>
              {screening.fraudMatches.map((m, i) => (
                <li key={i}>
                  Matched fraud watch-list entry "{m.fraudCompanyId?.name || 'unknown'}" (resume line: "{m.matchedText}")
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.86rem' }}>
              No line in the resume matched any of the {screening.fraudListSize} entries on the fraud watch-list.
            </p>
          )}
          {screening.fraudListSize === 0 && (
            <p style={{ margin: '8px 0 0', color: 'var(--warning)', fontSize: '0.82rem' }}>
              ⚠ The fraud watch-list has 0 entries for this account - this result didn't check against anything.
              Run <code>npm run seed-fraud-list</code> on the backend, then re-screen.
            </p>
          )}
        </div>
        {!bare && (
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem' }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// Full "Register a candidate" flow, in a modal: fill the form, submit,
// and - once scanning finishes - see the candidate's fraud-watch-list
// status right there before closing, instead of hunting for it in the
// table afterwards.
function NewCandidateModal({ onClose, onRegistered, setOverlayStage, setScanning, jobs, defaultJobId }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', jobId: defaultJobId || '' });
  const [resumeFile, setResumeFile] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const fileInputRef = useRef(null);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');

    if (!form.jobId) {
      setError('Choose which job posting this candidate is applying for');
      return;
    }

    if (!resumeFile) {
      setError('A resume (PDF or DOCX) is required to register a candidate');
      return;
    }

    const formData = new FormData();
    formData.append('name', form.name);
    formData.append('email', form.email);
    formData.append('phone', form.phone);
    formData.append('jobId', form.jobId);
    formData.append('resume', resumeFile);

    setSubmitting(true);
    setScanning(true);
    try {
      const { data } = await withMinDuration(api.post('/candidates', formData), setOverlayStage);
      setScanResult({ candidateName: data.candidate.name, screening: data.screening });
      onRegistered();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not register candidate');
    } finally {
      setSubmitting(false);
      setScanning(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={scanResult ? undefined : onClose}>
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

        {scanResult ? (
          <>
            <h3 style={{ marginTop: 0, paddingRight: 28 }}>Candidate registered</h3>
            <ScanResultPanel result={scanResult} bare />
            <button className="btn-primary" onClick={onClose} style={{ width: 160, height: 38, marginTop: 16 }}>
              Done
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0, paddingRight: 28 }}>Register a candidate</h3>
            <form onSubmit={handleAdd}>
              <div style={{ marginBottom: 12 }}>
                <label>Job posting</label>
                <select
                  value={form.jobId}
                  onChange={(e) => setForm({ ...form, jobId: e.target.value })}
                  required
                >
                  <option value="" disabled>
                    {jobs.length === 0 ? 'No job postings yet — create one first' : 'Select a job…'}
                  </option>
                  {jobs.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.title} {j.status === 'closed' ? '(closed)' : ''}
                    </option>
                  ))}
                </select>
              </div>

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

              <div style={{ marginTop: 12 }}>
                <label>Resume (required — PDF or DOCX, screened against the fraud watch-list immediately)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  required
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                />
              </div>

              {error && <p className="error-text">{error}</p>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', marginTop:'20px', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button className="btn-primary" type="submit" disabled={submitting} style={{ width: 220, height: 38 }}>
                  {submitting ? 'Registering…' : 'Register'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// "Bulk upload resumes" flow: pick a job, pick many resume files in one
// go, upload them all in a single request. The backend registers +
// screens each one independently, so one bad file in the batch doesn't
// sink the rest — the per-file outcome (registered/flagged/clear, or an
// error) is shown once the batch comes back.
function BulkUploadModal({ onClose, onUploaded, jobs, defaultJobId }) {
  const [jobId, setJobId] = useState(defaultJobId || '');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  function handleFiles(e) {
    setFiles(Array.from(e.target.files || []));
  }

  async function handleUpload(e) {
    e.preventDefault();
    setError('');

    if (!jobId) {
      setError('Choose which job posting these resumes are for');
      return;
    }
    if (files.length === 0) {
      setError('Select one or more resume files (PDF or DOCX)');
      return;
    }

    const formData = new FormData();
    formData.append('jobId', jobId);
    files.forEach((f) => formData.append('resumes', f));

    setUploading(true);
    try {
      const { data } = await api.post('/candidates/bulk', formData);
      setResult(data);
      onUploaded();
    } catch (err) {
      setError(err.response?.data?.error || 'Bulk upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={result ? undefined : onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          disabled={uploading}
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

        {result ? (
          <>
            <h3 style={{ marginTop: 0, paddingRight: 28 }}>Bulk upload complete</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.86rem', marginTop: -6 }}>
              {result.succeeded} of {result.total} resume(s) registered and screened
              {result.failed > 0 ? `, ${result.failed} failed` : ''}.
            </p>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Candidate</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: '0.82rem' }}>{r.fileName}</td>
                      <td style={{ fontSize: '0.82rem' }}>{r.success ? r.candidate.name : '—'}</td>
                      <td>
                        {r.success ? (
                          <span className={`badge ${r.screening.verdict}`}>
                            {r.screening.verdict === 'flagged' ? 'Flagged' : 'Clear'}
                          </span>
                        ) : (
                          <span className="error-text" style={{ fontSize: '0.8rem' }}>{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary" onClick={onClose} style={{ width: 160, height: 38, marginTop: 16 }}>
              Done
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0, paddingRight: 28 }}>Bulk upload resumes</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.86rem', marginTop: -6 }}>
              Select a job and as many resumes as you like — each one is registered as a candidate and screened
              against the fraud watch-list automatically. Name is guessed from the file name and email from the
              resume text, so double-check them afterwards in the candidate list.
            </p>
            <form onSubmit={handleUpload}>
              <label>Job posting</label>
              <select value={jobId} onChange={(e) => setJobId(e.target.value)} required>
                <option value="" disabled>
                  {jobs.length === 0 ? 'No job postings yet — create one first' : 'Select a job…'}
                </option>
                {jobs.map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.title} {j.status === 'closed' ? '(closed)' : ''}
                  </option>
                ))}
              </select>

              <div style={{ marginTop: 12 }}>
                <label>Resumes (PDF or DOCX, select multiple)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  multiple
                  required
                  onChange={handleFiles}
                />
                {files.length > 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 4 }}>
                    {files.length} file(s) selected
                  </p>
                )}
              </div>

              {error && <p className="error-text">{error}</p>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={uploading}
                  style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', marginTop: '20px', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button className="btn-primary" type="submit" disabled={uploading} style={{ width: 220, height: 38 }}>
                  {uploading ? `Uploading ${files.length || ''}…` : 'Upload & screen all'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// Delete button with an inline "are you sure" confirm step, rather than
// a browser confirm() dialog, to match the rest of the app's styling.
// A single candidate field (name/email/phone) that's plain text until
// clicked, then becomes an input with Save/Cancel. Mainly for fixing the
// guessed name/email that bulk resume upload produces, but works anywhere.
function EditableField({ candidate, field, type = 'text', onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(candidate[field] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEdit() {
    setValue(candidate[field] || '');
    setError('');
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch(`/candidates/${candidate._id}`, { [field]: value });
      onSaved(candidate._id, data);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  }

  if (!editing) {
    return (
      <td
        onClick={startEdit}
        title="Click to edit"
        style={{ cursor: 'pointer' }}
      >
        {candidate[field] || <span style={{ color: 'var(--muted)' }}>—</span>}
      </td>
    );
  }

  return (
    <td>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type={type}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          style={{ minWidth: 120, height: 28, fontSize: '0.85rem' }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: 'var(--blue)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          {saving ? '…' : '✓'}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={saving}
          style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          ✕
        </button>
      </div>
      {error && <p className="error-text" style={{ margin: '2px 0 0', fontSize: '0.75rem' }}>{error}</p>}
    </td>
  );
}

function DeleteCandidateButton({ candidate, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/candidates/${candidate._id}`);
      onDeleted(candidate._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete candidate');
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
          <span style={{ color: 'var(--muted)' }}>Delete {candidate.name || 'this candidate'}?</span>
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
        </div>
        {error && <p className="error-text" style={{ marginTop: 4 }}>{error}</p>}
      </td>
    );
  }

  return (
    <td>
      <button
        onClick={() => setConfirming(true)}
        title="Delete candidate"
        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem' }}
      >
        Delete
      </button>
    </td>
  );
}

// One row's "screen a resume" file input + upload state, kept per-candidate
// so multiple rows can be mid-upload independently.
// Popup for reviewing a candidate's declared employment history and
// running a UAN check: flags overlapping employer date ranges, which is
// the classic sign of moonlighting or misreported employment on a
// UAN/PF record.
function UanCheckModal({ candidate, onClose, onChecked }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employer: '', startDate: '', endDate: '' });
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(
    candidate.latestScreening?.uanChecked
      ? { uanOverlaps: candidate.latestScreening.uanOverlaps || [] }
      : null
  );

  function loadRecords() {
    setLoading(true);
    api
      .get(`/candidates/${candidate._id}/uan-records`)
      .then((res) => setRecords(Array.isArray(res.data) ? res.data : []))
      .catch(() => setError('Could not load employment records'))
      .finally(() => setLoading(false));
  }

  useEffect(loadRecords, []);

  async function handleAddRecord(e) {
    e.preventDefault();
    if (!form.employer.trim() || !form.startDate) return;

    setAdding(true);
    setError('');
    try {
      const { data } = await api.post(`/candidates/${candidate._id}/uan-records`, form);
      setRecords((prev) => [...prev, data].sort((a, b) => new Date(a.startDate) - new Date(b.startDate)));
      setForm({ employer: '', startDate: '', endDate: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add employment record');
    } finally {
      setAdding(false);
    }
  }

  async function handleRunCheck() {
    setChecking(true);
    setError('');
    try {
      const { data } = await api.post(`/candidates/${candidate._id}/uan-check`);
      setResult({ uanOverlaps: data.uanOverlaps || [] });
      onChecked(candidate._id, data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not run UAN check');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4 }}
        >
          ✕
        </button>

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>UAN check — {candidate.name || 'candidate'}</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
          Compares this candidate's declared employment periods for overlapping dates — a sign of moonlighting or misreported employment on the UAN/PF record.
        </p>

        {loading ? (
          <p>Loading…</p>
        ) : (
          <table style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>Employer</th>
                <th>From</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r._id}>
                  <td>{r.employer}</td>
                  <td>{new Date(r.startDate).toLocaleDateString()}</td>
                  <td>{r.endDate ? new Date(r.endDate).toLocaleDateString() : 'Present'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && records.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No employment records on file yet — add one below.</p>
        )}

        <form onSubmit={handleAddRecord} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label>Employer</label>
            <input value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} required />
          </div>
          <div>
            <label>From</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
          </div>
          <div>
            <label>To (blank = current)</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <button className="btn-primary" type="submit" disabled={adding} style={{ height: 38 }}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}

        {result && (
          <div style={{ marginBottom: 16 }}>
            <span className={`badge ${result.uanOverlaps?.length ? 'flagged' : 'clear'}`}>
              {result.uanOverlaps?.length ? `${result.uanOverlaps.length} overlapping record(s)` : 'No overlaps found'}
            </span>
            {result.uanOverlaps?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--danger)', fontSize: '0.86rem' }}>
                {result.uanOverlaps.map((o, i) => (
                  <li key={i}>
                    {o.employer}: {new Date(o.startDate).toLocaleDateString()} – {o.endDate ? new Date(o.endDate).toLocaleDateString() : 'present'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer' }}
          >
            Close
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleRunCheck}
            disabled={checking || records.length === 0}
            style={{ width: 160, height: 38 }}
          >
            {checking ? 'Checking…' : 'Run UAN check'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScreenResumeCell({ candidate, canScreen, onScreened, setOverlayStage, setScanning }) {
  const [error, setError] = useState('');
  const [showUanModal, setShowUanModal] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setError('');
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const { data } = await withMinDuration(
        api.post(`/candidates/${candidate._id}/screen`, formData),
        setOverlayStage
      );
      onScreened(candidate._id, data.screening);
    } catch (err) {
      setError(err.response?.data?.error || 'Screening failed');
    } finally {
      setScanning(false);
    }
  }

  const verdict = candidate.latestScreening?.verdict;
  const emptyFraudList = candidate.latestScreening?.fraudListSize === 0;
  const uanChecked = candidate.latestScreening?.uanChecked;
  const uanOverlapCount = candidate.latestScreening?.uanOverlaps?.length || 0;

  return (
    <td>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {verdict && (
          <span className={`badge ${verdict}`}>
            {verdict === 'flagged'
              ? `Flagged (${candidate.latestScreening.fraudMatches?.length || 0})`
              : 'Clear'}
          </span>
        )}
        {verdict === 'clear' && emptyFraudList && (
          <span
            className="badge flagged"
            title="This scan ran against 0 fraud watch-list entries - the fraud list wasn't seeded yet when it ran. Re-screen after seeding to get a real result."
          >
            ⚠ list was empty
          </span>
        )}
        {uanChecked && (
          <span className={`badge ${uanOverlapCount ? 'flagged' : 'clear'}`}>
            {uanOverlapCount ? `UAN: ${uanOverlapCount} overlap(s)` : 'UAN: clear'}
          </span>
        )}
        {canScreen && (
          <>
            <label style={{ margin: 0, color: 'var(--blue)', fontSize: '0.82rem', cursor: 'pointer' }}>
              {verdict ? 'Re-screen' : 'Screen resume'}
              <input type="file" accept=".pdf,.docx" onChange={handleFile} style={{ display: 'none' }} />
            </label>
        
          </>
        )}
      </div>
      {error && <p className="error-text" style={{ marginTop: 4 }}>{error}</p>}
      {showUanModal && (
        <UanCheckModal candidate={candidate} onClose={() => setShowUanModal(false)} onChecked={onScreened} />
      )}
    </td>
  );
}

const ROUNDS = ['L1', 'L2', 'HR', 'offer'];

function defaultSubject(candidate) {
  return `Interview invitation - ${candidate.name || 'Candidate'}`;
}

function defaultBody(candidate) {
  return `Hi ${candidate.name || ''},\n\nCongratulations - your profile has cleared our screening. We'd like to move forward with an interview.\n\nRegards,\nTrue Hire team`;
}

// Popup for composing and actually sending an interview email to a
// verified candidate - same pattern as the site's contact-page send flow:
// an overlay with editable To/Subject/Body and a Send button that hits
// the backend, which delivers the mail itself (no mailto:, no relying on
// the browser's own mail client).
function EmailPopup({ candidate, onClose, onSent }) {
  const [subject, setSubject] = useState(defaultSubject(candidate));
  const [body, setBody] = useState(defaultBody(candidate));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const { data } = await api.post(`/candidates/${candidate._id}/interviews`, {
        round: 'L1',
        subject,
        body,
        sendNow: true,
      });
      onSent(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send email');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 500, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          disabled={sending}
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

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>Email {candidate.name || 'candidate'}</h3>

        <form onSubmit={handleSend} style={{ display: 'flex', width:'450px', flexDirection: 'column', gap: 10 }}>
          <div>
            <label>To</label>
            <input value={candidate.email || 'No email on file'} disabled />
          </div>
          <div>
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} required style={{width:'450px'}} />
          </div>

          {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer', marginTop: 20 }}
            >
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={sending || !candidate.email} style={{ width: 120, height: 38 }}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          {!candidate.email && (
            <p className="error-text" style={{ margin: 0 }}>This candidate has no email address on file.</p>
          )}
        </form>
      </div>
    </div>
  );
}

// Email + schedule-interview actions for a single candidate row. Only ever
// rendered for candidates whose latest screening verdict is "clear"
// (verified/green) - the backend enforces the same rule independently.
function InterviewActionsCell({ candidate }) {
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    round: 'L1',
    scheduledAt: '',
    meetingMode: 'teams',
    subject: `Interview scheduled - ${candidate.name || 'Candidate'}`,
    body: defaultBody(candidate),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastInvite, setLastInvite] = useState(null);

  function handleSent(invite) {
    setLastInvite(invite);
    setShowEmailPopup(false);
  }

  async function scheduleInterview(e) {
    e.preventDefault();
    if (!scheduleForm.scheduledAt) {
      setError('Pick a date and time');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/candidates/${candidate._id}/interviews`, {
        round: scheduleForm.round,
        subject: scheduleForm.subject,
        body: scheduleForm.body,
        scheduledAt: scheduleForm.scheduledAt,
        mode: scheduleForm.meetingMode,
      });
      setLastInvite(data);
      setScheduling(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not schedule interview');
    } finally {
      setSaving(false);
    }
  }

  return (
    <td>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setShowEmailPopup(true); setError(''); }}
            style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--blue)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            ✉ Email
          </button>
          <button
            type="button"
            onClick={() => { setScheduling((v) => !v); setError(''); }}
            style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--blue)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            📅 Schedule interview
          </button>
        </div>

        {showEmailPopup && (
          <EmailPopup candidate={candidate} onClose={() => setShowEmailPopup(false)} onSent={handleSent} />
        )}

        {scheduling && (
          <form onSubmit={scheduleInterview} style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={scheduleForm.round} onChange={(e) => setScheduleForm({ ...scheduleForm, round: e.target.value })}>
                {ROUNDS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <select value={scheduleForm.meetingMode} onChange={(e) => setScheduleForm({ ...scheduleForm, meetingMode: e.target.value })}>
                <option value="teams">Microsoft Teams</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <input
              type="datetime-local"
              value={scheduleForm.scheduledAt}
              onChange={(e) => setScheduleForm({ ...scheduleForm, scheduledAt: e.target.value })}
              required
            />
            <button className="btn-primary" type="submit" disabled={saving} style={{ fontSize: '0.8rem' }}>
              {saving ? 'Scheduling…' : 'Schedule'}
            </button>
          </form>
        )}

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        {lastInvite && (
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            {lastInvite.scheduledAt ? (
              <>
                Scheduled for {new Date(lastInvite.scheduledAt).toLocaleString()}
                {lastInvite.meetingLink && (
                  <>
                    {' '}·{' '}
                    <a href={lastInvite.meetingLink} target="_blank" rel="noreferrer">Teams link</a>
                  </>
                )}
              </>
            ) : lastInvite.delivered ? (
              'Email sent to candidate.'
            ) : (
              'Email queued (SMTP not configured - simulated send only).'
            )}
          </div>
        )}
      </div>
    </td>
  );
}

export default function Candidates() {
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobIdFilter = searchParams.get('jobId') || '';

  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [overlayStage, setOverlayStage] = useState('');
  const [showNewCandidateModal, setShowNewCandidateModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 });

  function loadJobs() {
    // Used to populate the "Filter by job" dropdown and the job pickers in
    // the New Candidate / Bulk Upload modals - needs every job, not one
    // page of the (separately paginated) Jobs list page.
    api
      .get('/jobs', { params: { limit: 100 } })
      .then((res) => setJobs(Array.isArray(res.data.items) ? res.data.items : []))
      .catch(() => {});
  }

  function loadCandidates(searchValue = search, pageValue = page) {
    setLoading(true);
    api
      .get('/candidates', {
        params: {
          jobId: jobIdFilter || undefined,
          search: searchValue || undefined,
          page: pageValue,
          limit: 10,
        },
      })
      .then((res) => {
        setCandidates(Array.isArray(res.data.items) ? res.data.items : []);
        setPageInfo({ total: res.data.total || 0, totalPages: res.data.totalPages || 1 });
      })
      .catch(() => setError('Could not load candidates'))
      .finally(() => setLoading(false));
  }

  useEffect(loadJobs, []);

  // Job filter changes (from the dropdown, or a "?jobId=" link from the
  // Jobs page) reset back to page 1.
  useEffect(() => {
    setPage(1);
    loadCandidates(search, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIdFilter]);

  // Debounce the search box, and reset to page 1 whenever it changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadCandidates(search, 1);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handlePageChange(nextPage) {
    setPage(nextPage);
    loadCandidates(search, nextPage);
  }

  function handleScreened(candidateId, screening) {
    setCandidates((prev) =>
      prev.map((c) => (c._id === candidateId ? { ...c, latestScreening: screening } : c))
    );
  }

  function handleDeleted(candidateId) {
    setCandidates((prev) => prev.filter((c) => c._id !== candidateId));
    setPageInfo((prev) => ({ ...prev, total: Math.max(prev.total - 1, 0) }));
  }

  function handleEdited(candidateId, updated) {
    setCandidates((prev) =>
      prev.map((c) => (c._id === candidateId ? { ...c, name: updated.name, email: updated.email, phone: updated.phone } : c))
    );
  }

  function handleJobFilterChange(value) {
    if (value) {
      setSearchParams({ jobId: value });
    } else {
      setSearchParams({});
    }
  }

  const canScreen = hasRole('admin', 'recruiter');
  const filteredJob = jobs.find((j) => j._id === jobIdFilter);

  return (
    <Layout>
      {scanning && <ScanningOverlay stage={overlayStage || 'Uploading resume…'} />}

      <div className="topbar">
        <h2>Candidates</h2>
        {canScreen && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => setShowBulkUploadModal(true)} style={{ width: 190 }}>
              ⇪ Bulk upload resumes
            </button>
            <button className="btn-primary" onClick={() => setShowNewCandidateModal(true)} style={{ width: 160 }}>
              + New candidate
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ margin: 0 }}>Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone…"
            style={{ maxWidth: 280 }}
          />
          {search && (
            <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
              {loading ? 'Searching…' : `${pageInfo.total} match${pageInfo.total === 1 ? '' : 'es'}`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ margin: 0 }}>Filter by job</label>
          <select value={jobIdFilter} onChange={(e) => handleJobFilterChange(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>
                {j.title} {j.status === 'closed' ? '(closed)' : ''}
              </option>
            ))}
          </select>
          {jobIdFilter && !filteredJob && jobs.length > 0 && (
            <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>(job not found)</span>
          )}
        </div>
      </div>

      {showNewCandidateModal && (
        <NewCandidateModal
          onClose={() => setShowNewCandidateModal(false)}
          onRegistered={() => loadCandidates()}
          setOverlayStage={setOverlayStage}
          setScanning={setScanning}
          jobs={jobs}
          defaultJobId={jobIdFilter}
        />
      )}

      {showBulkUploadModal && (
        <BulkUploadModal
          onClose={() => setShowBulkUploadModal(false)}
          onUploaded={() => { loadCandidates(); loadJobs(); }}
          jobs={jobs}
          defaultJobId={jobIdFilter}
        />
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
                <th>Job</th>
                <th>Added</th>
                <th>Fraud watch-list screening</th>
                {canScreen && <th>Interview</th>}
                {canScreen && <th></th>}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c._id}>
                  {canScreen ? (
                    <>
                      <EditableField candidate={c} field="name" onSaved={handleEdited} />
                      <EditableField candidate={c} field="email" type="email" onSaved={handleEdited} />
                      <EditableField candidate={c} field="phone" onSaved={handleEdited} />
                    </>
                  ) : (
                    <>
                      <td>{c.name || '—'}</td>
                      <td>{c.email || '—'}</td>
                      <td>{c.phone || '—'}</td>
                    </>
                  )}
                  <td>{c.job?.title || '—'}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <ScreenResumeCell
                    candidate={c}
                    canScreen={canScreen}
                    onScreened={handleScreened}
                    setOverlayStage={setOverlayStage}
                    setScanning={setScanning}
                  />
                  {canScreen && (
                    c.latestScreening?.verdict === 'clear' ? (
                      <InterviewActionsCell candidate={c} />
                    ) : (
                      <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>—</td>
                    )
                  )}
                  {canScreen && <DeleteCandidateButton candidate={c} onDeleted={handleDeleted} />}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && candidates.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>
            {search
              ? 'No candidates match your search.'
              : jobIdFilter
              ? 'No candidates for this job yet.'
              : 'No candidates yet — click "+ New candidate" above.'}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <Pagination page={page} totalPages={pageInfo.totalPages} total={pageInfo.total} onChange={handlePageChange} />
      </div>
    </Layout>
  );
}
