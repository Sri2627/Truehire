import React, { useState } from 'react';
import api from '../api';

export const ROUNDS = ['L1', 'L2', 'HR', 'offer'];

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

        <form onSubmit={handleSend} style={{ display: 'flex', width: '450px', flexDirection: 'column', gap: 10 }}>
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
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} required style={{ width: '450px' }} />
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

// Email + schedule-interview actions for a single candidate. Only ever
// rendered for candidates whose latest screening verdict is "clear"
// (verified/green) - the backend enforces the same rule independently.
// `layout="cell"` renders as a <td> (for a table row); layout="block"
// renders as a plain <div> (for a non-table context).
export default function InterviewActions({ candidate, layout = 'cell' }) {
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

  const Wrapper = layout === 'cell' ? 'td' : 'div';

  return (
    <Wrapper>
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
    </Wrapper>
  );
}
