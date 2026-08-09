import React, { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
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
function NewCandidateModal({ onClose, onRegistered, setOverlayStage, setScanning }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [resumeFile, setResumeFile] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const fileInputRef = useRef(null);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');

    if (!resumeFile) {
      setError('A resume (PDF or DOCX) is required to register a candidate');
      return;
    }

    const formData = new FormData();
    formData.append('name', form.name);
    formData.append('email', form.email);
    formData.append('phone', form.phone);
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

// Delete button with an inline "are you sure" confirm step, rather than
// a browser confirm() dialog, to match the rest of the app's styling.
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
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [overlayStage, setOverlayStage] = useState('');
  const [showNewCandidateModal, setShowNewCandidateModal] = useState(false);

  function loadCandidates() {
    setLoading(true);
    api
      .get('/candidates')
      .then((res) => setCandidates(res.data))
      .catch(() => setError('Could not load candidates'))
      .finally(() => setLoading(false));
  }

  useEffect(loadCandidates, []);

  function handleScreened(candidateId, screening) {
    setCandidates((prev) =>
      prev.map((c) => (c._id === candidateId ? { ...c, latestScreening: screening } : c))
    );
  }

  function handleDeleted(candidateId) {
    setCandidates((prev) => prev.filter((c) => c._id !== candidateId));
  }

  const canScreen = hasRole('admin', 'recruiter');

  return (
    <Layout>
      {scanning && <ScanningOverlay stage={overlayStage || 'Uploading resume…'} />}

      <div className="topbar">
        <h2>Candidates</h2>
        {canScreen && (
          <button className="btn-primary" onClick={() => setShowNewCandidateModal(true)} style={{ width: 160 }}>
            + New candidate
          </button>
        )}
      </div>

      {showNewCandidateModal && (
        <NewCandidateModal
          onClose={() => setShowNewCandidateModal(false)}
          onRegistered={loadCandidates}
          setOverlayStage={setOverlayStage}
          setScanning={setScanning}
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
                <th>Added</th>
                <th>Fraud watch-list screening</th>
                {canScreen && <th>Interview</th>}
                {canScreen && <th></th>}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c._id}>
                  <td>{c.name || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
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
          <p style={{ color: 'var(--muted)' }}>No candidates yet — click "+ New candidate" above.</p>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Layout>
  );
}
