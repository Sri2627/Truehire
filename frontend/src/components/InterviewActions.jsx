import React, { useEffect, useState } from 'react';
import api from '../api';

export const ROUNDS = ['L1', 'L2', 'HR', 'offer'];

const MODE_LABELS = { teams: 'Microsoft Teams', phone: 'Phone call', in_person: 'In person' };

function defaultInviteSubject(candidate, round) {
  return `Interview invitation${round ? ` — ${round}` : ''}: ${candidate.name || 'Candidate'}`;
}

// Built once the interview is actually scheduled and its meeting link
// exists (see scheduleInterview below) - this is what pre-fills the Email
// preview popup's body, editable before it's sent.
function defaultInviteBody(candidate, invite) {
  const when = invite.scheduledAt ? new Date(invite.scheduledAt).toLocaleString() : '';
  const modeLabel = MODE_LABELS[invite.mode] || invite.mode;
  const linkLine = invite.meetingLink ? `\nJoin link: ${invite.meetingLink}\n` : '';

  return `Hi ${candidate.name || ''},

Congratulations — your profile has cleared our screening. We would like to invite you for your ${invite.round} interview.

Date & time: ${when}
Mode: ${modeLabel}
${linkLine}
Please let us know if this time does not work for you and we will find another slot.

Regards,
True Hire team`;
}

// Shown automatically the moment an interview is scheduled - preview and
// edit the invitation email before it actually sends. To is fixed to the
// candidate's email; Cc is fixed to the job's interview panel (both
// read-only here - change the panel from the job's Edit form instead).
// Nothing is sent until Send is clicked.
function EmailPreviewPopup({ candidate, invite, interviewPanel, onClose, onSent }) {
  const [subject, setSubject] = useState(defaultInviteSubject(candidate, invite.round));
  const [body, setBody] = useState(defaultInviteBody(candidate, invite));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const { data } = await api.post(`/candidates/${candidate._id}/interviews/${invite._id}/send`, {
        subject,
        body,
        cc: interviewPanel,
      });
      onSent(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send email');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="scanning-overlay" onClick={sending ? undefined : onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
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

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>Interview scheduled — review &amp; send invitation</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: -6 }}>
          Nothing is sent yet. Review the email below, then click Send.
        </p>

        <form onSubmit={handleSend} style={{ display: 'flex', width: '460px', flexDirection: 'column', gap: 10 }}>
          <div>
            <label>To</label>
            <input value={candidate.email || 'No email on file'} disabled />
          </div>
          <div>
            <label>Cc — interview panel</label>
            <input
              value={interviewPanel.length ? interviewPanel.join(', ') : 'No interview panel set on this job'}
              disabled
            />
          </div>
          <div>
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} required style={{ width: '460px' }} />
          </div>

          {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer', marginTop: 20 }}
            >
              Send later
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

// One panelist's verdict form, plus the list of verdicts already
// recorded for this round. Every submission is one panelist's entry -
// the aggregate outcome badge (hire/reject/hold/pending) is computed
// server-side from all of them together (see utils/panelOutcome.js) and
// comes back on the invite itself, not derived here.
function PanelFeedbackModal({ candidate, invite, interviewPanel, onClose, onFeedbackAdded }) {
  // When interviewPanel is empty, "Other…" is the select's only option -
  // the browser shows it selected regardless of state, so state has to
  // start there too. Otherwise the select visually shows "Other…" while
  // panelistName is still '', the custom-name input never renders (its
  // condition checks for '__other__' specifically), and Save fails with
  // "Enter who this feedback is from" with no way to fix it on screen.
  const [panelistName, setPanelistName] = useState(interviewPanel[0] || '__other__');
  const [customPanelist, setCustomPanelist] = useState('');
  const [recommendation, setRecommendation] = useState('hire');
  const [score, setScore] = useState('');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const name = panelistName === '__other__' ? customPanelist.trim() : panelistName.trim();
    if (!name) {
      setError('Enter who this feedback is from');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/candidates/${candidate._id}/interviews/${invite._id}/feedback`, {
        panelistName: name,
        recommendation,
        score: score === '' ? undefined : Number(score),
        comments: comments.trim() || undefined,
      });
      onFeedbackAdded(data);
      setCustomPanelist('');
      setScore('');
      setComments('');
      setRecommendation('hire');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save feedback');
    } finally {
      setSaving(false);
    }
  }

  const outcome = invite.panelOutcome?.outcome;
  const outcomeBadgeClass = outcome === 'hire' ? 'clear' : outcome === 'reject' ? 'flagged' : 'role';

  return (
    <div className="scanning-overlay" onClick={saving ? undefined : onClose}>
      <div
        className="scanning-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative', maxHeight: '85vh', overflowY: 'auto' }}
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

        <h3 style={{ marginTop: 0, paddingRight: 28 }}>
          Panel feedback — {invite.round} · {candidate.name || 'Candidate'}
        </h3>

        {outcome && outcome !== 'pending' && (
          <span className={`badge ${outcomeBadgeClass}`} style={{ fontSize: '0.82rem' }}>
            Panel outcome: {outcome}
            {invite.panelOutcome.avgScore != null ? ` (avg score ${invite.panelOutcome.avgScore})` : ''}
          </span>
        )}

        {invite.panelFeedback?.length > 0 && (
          <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invite.panelFeedback.map((f, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', fontSize: '0.84rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{f.panelistName}</strong>
                  <span
                    className={`badge ${f.recommendation === 'hire' ? 'clear' : f.recommendation === 'reject' ? 'flagged' : 'role'}`}
                    style={{ fontSize: '0.72rem' }}
                  >
                    {f.recommendation}{f.score != null ? ` · ${f.score}` : ''}
                  </span>
                </div>
                {f.comments && <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>{f.comments}</p>}
              </div>
            ))}
          </div>
        )}

        <h4 style={{ marginBottom: 6 }}>Add a panelist's feedback</h4>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label>Panelist</label>
            <select value={panelistName} onChange={(e) => setPanelistName(e.target.value)}>
              {interviewPanel.map((email) => (
                <option key={email} value={email}>{email}</option>
              ))}
              <option value="__other__">Other…</option>
            </select>
          </div>
          {panelistName === '__other__' && (
            <div>
              <label>Panelist name or email</label>
              <input value={customPanelist} onChange={(e) => setCustomPanelist(e.target.value)} autoFocus />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Recommendation</label>
              <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)}>
                <option value="hire">Hire</option>
                <option value="reject">Reject</option>
                <option value="hold">Hold</option>
              </select>
            </div>
            <div style={{ width: 140 }}>
              <label>Score (optional)</label>
              <input type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
          </div>
          <div>
            <label>Comments (optional)</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={4} />
          </div>

          {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '0 16px', height: 38, cursor: 'pointer' }}
            >
              Done
            </button>
            <button className="btn-primary" type="submit" disabled={saving} style={{ width: 160, height: 38 }}>
              {saving ? 'Saving…' : 'Save feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Schedule-interview action for a single candidate, plus the email
// preview/send popup that opens automatically once scheduling completes.
// Only ever rendered for candidates whose latest screening verdict is
// "clear" - the backend enforces the same rule independently.
// `interviewPanel` is the job's list of panel emails (see JobMatches.jsx),
// CC'd on the invitation once Send is clicked, and offered as the default
// panelist choices when recording feedback below.
// `layout="cell"` renders as a <td> (for a table row); layout="block"
// renders as a plain <div> (for a non-table context).
export default function InterviewActions({ candidate, interviewPanel = [], layout = 'cell' }) {
  const [scheduling, setScheduling] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    round: 'L1',
    scheduledAt: '',
    meetingMode: 'teams',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingInvite, setPendingInvite] = useState(null); // scheduled or "Send email" clicked - awaiting the preview popup's Send
  const [feedbackInvite, setFeedbackInvite] = useState(null); // which invite's panel-feedback modal is open
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  function loadInvites() {
    api
      .get(`/candidates/${candidate._id}/interviews`)
      .then((res) => setInvites(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoadingInvites(false));
  }

  useEffect(loadInvites, [candidate._id]);

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
        scheduledAt: scheduleForm.scheduledAt,
        mode: scheduleForm.meetingMode,
      });
      setScheduling(false);
      // Scheduling done - immediately surface the invitation email for
      // review before it goes anywhere.
      setPendingInvite(data);
      loadInvites();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not schedule interview');
    } finally {
      setSaving(false);
    }
  }

  function handleSent() {
    setPendingInvite(null);
    loadInvites();
  }

  function handleFeedbackAdded(updatedInvite) {
    setInvites((prev) => prev.map((inv) => (inv._id === updatedInvite._id ? updatedInvite : inv)));
    setFeedbackInvite(updatedInvite);
  }

  const Wrapper = layout === 'cell' ? 'td' : 'div';

  return (
    <Wrapper>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setScheduling((v) => !v); setError(''); }}
            style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--blue)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            📅 Schedule interview
          </button>
        </div>

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

        {pendingInvite && (
          <EmailPreviewPopup
            candidate={candidate}
            invite={pendingInvite}
            interviewPanel={interviewPanel}
            onClose={() => setPendingInvite(null)}
            onSent={handleSent}
          />
        )}

        {feedbackInvite && (
          <PanelFeedbackModal
            candidate={candidate}
            invite={feedbackInvite}
            interviewPanel={interviewPanel}
            onClose={() => setFeedbackInvite(null)}
            onFeedbackAdded={handleFeedbackAdded}
          />
        )}

        {!loadingInvites && invites.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {invites.map((invite) => {
              const outcome = invite.panelOutcome?.outcome;
              const outcomeBadgeClass = outcome === 'hire' ? 'clear' : outcome === 'reject' ? 'flagged' : 'role';
              return (
                <div key={invite._id} style={{ fontSize: '0.78rem', color: 'var(--muted)', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                  <div>
                    <strong>{invite.round}</strong>
                    {invite.scheduledAt && <> — {new Date(invite.scheduledAt).toLocaleString()}</>}
                    {invite.meetingLink && (
                      <>
                        {' '}·{' '}
                        <a href={invite.meetingLink} target="_blank" rel="noreferrer">Teams link</a>
                      </>
                    )}
                  </div>
                  {invite.status !== 'marked_sent' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ color: 'var(--warning)' }}>— invite not sent yet</span>
                      <button
                        type="button"
                        onClick={() => setPendingInvite(invite)}
                        style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '0.76rem', padding: 0 }}
                      >
                        ✉ Send email
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    {outcome && outcome !== 'pending' && (
                      <span className={`badge ${outcomeBadgeClass}`} style={{ fontSize: '0.72rem' }}>
                        Panel: {outcome}
                        {invite.panelOutcome.avgScore != null ? ` (avg ${invite.panelOutcome.avgScore})` : ''}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setFeedbackInvite(invite)}
                      style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '0.76rem', padding: 0 }}
                    >
                      {invite.panelFeedback?.length ? `View feedback (${invite.panelFeedback.length})` : '+ Add panel feedback'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Wrapper>
  );
}
