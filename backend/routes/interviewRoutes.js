const crypto = require('crypto');
const express = require('express');
const Candidate = require('../models/Candidate');
const Screening = require('../models/Screening');
const InterviewInvite = require('../models/InterviewInvite');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendCandidateEmail } = require('../utils/mailer');
const { computePanelOutcome } = require('../utils/panelOutcome');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

// Shared guard: candidate must exist in the caller's company AND its most
// recent screening must be a "clear" verdict. Only verified/green
// candidates can be emailed or scheduled for interview from this screen.
async function loadVerifiedCandidate(req, res) {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return null;
  }

  const latestScreening = await Screening.findOne({ candidateId: candidate._id }).sort({ screenedAt: -1 });
  if (!latestScreening || latestScreening.verdict !== 'clear') {
    res.status(400).json({ error: 'Only verified (clear) candidates can be emailed or scheduled for interview' });
    return null;
  }

  return candidate;
}

// Builds a placeholder Teams meeting link. There's no live Microsoft
// Graph/Teams integration wired up here - this just gives the invite a
// join link that looks and behaves like a real one for demo purposes.
function buildTeamsLink() {
  const meetingId = crypto.randomBytes(16).toString('hex');
  return `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${meetingId}%40thread.v2/0`;
}

// GET /candidates/:id/interviews - invite history for a candidate.
router.get('/', requireRole('admin', 'recruiter', 'viewer'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const invites = await InterviewInvite.find({ candidateId: candidate._id })
    .populate('draftedBy', 'name email')
    .populate('panelFeedback.submittedBy', 'name email')
    .sort({ draftedAt: -1 });

  // panelOutcome is derived, not stored - always computed fresh from
  // whatever panelFeedback entries exist, so it can never drift out of
  // sync with them.
  const withOutcome = invites.map((invite) => ({
    ...invite.toObject(),
    panelOutcome: computePanelOutcome(invite.panelFeedback),
  }));

  res.json(withOutcome);
});

// POST /candidates/:id/interviews - schedule an interview for a verified
// candidate: round, scheduledAt (required), and mode (default 'teams',
// which generates a placeholder Teams join link below). This step only
// creates the invite record - it does NOT send anything. The frontend's
// Schedule form calls this, then immediately opens an Email preview
// popup pre-filled with the invitation (including this invite's
// meetingLink) for review before POST /:inviteId/send actually mails it.
router.post('/', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await loadVerifiedCandidate(req, res);
  if (!candidate) return;

  try {
    const { round, scheduledAt, mode } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt is required to schedule an interview' });
    }

    const invite = new InterviewInvite({
      candidateId: candidate._id,
      round: round || 'L1',
      draftedBy: req.user.id,
      scheduledAt: new Date(scheduledAt),
      mode: mode || 'teams',
    });

    if (invite.mode === 'teams') {
      invite.meetingLink = buildTeamsLink();
    }

    await invite.save();

    await AuditLog.create({
      userId: req.user.id,
      action: 'schedule_interview',
      entityType: 'candidate',
      entityId: candidate._id,
      metadata: { round: invite.round, scheduledAt: invite.scheduledAt, mode: invite.mode },
    });

    res.status(201).json(invite);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not schedule interview' });
  }
});

// POST /candidates/:id/interviews/:inviteId/send - sends the invitation
// email for an already-scheduled interview: To the candidate, Cc the
// interview panel (passed in from the job's interviewPanel by the
// frontend). subject/body come from the Email preview popup - whatever
// was reviewed/edited there is exactly what goes out, nothing is
// generated blind on the server. Only a still-'drafted' invite can be
// sent this way; re-sending an already-sent one isn't supported here to
// avoid silently double-mailing a candidate.
router.post('/:inviteId/send', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const invite = await InterviewInvite.findOne({ _id: req.params.inviteId, candidateId: candidate._id });
  if (!invite) return res.status(404).json({ error: 'Interview invite not found' });

  if (invite.status === 'marked_sent') {
    return res.status(409).json({ error: 'The invitation email for this interview has already been sent' });
  }

  const { subject, body, cc } = req.body;
  if (!subject || !subject.trim() || !body || !body.trim()) {
    return res.status(400).json({ error: 'subject and body are required' });
  }

  const ccList = Array.isArray(cc) ? cc.map((e) => String(e || '').trim()).filter(Boolean) : [];

  try {
    const result = await sendCandidateEmail({ to: candidate.email, cc: ccList, subject, text: body });

    invite.subject = subject;
    invite.body = body;
    invite.cc = ccList;
    invite.status = 'marked_sent';
    await invite.save();

    await AuditLog.create({
      userId: req.user.id,
      action: 'send_interview_email',
      entityType: 'candidate',
      entityId: candidate._id,
      metadata: { round: invite.round, cc: ccList, delivered: result.delivered },
    });

    res.json({ ...invite.toObject(), delivered: result.delivered });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not send the email' });
  }
});

// POST /candidates/:id/interviews/:inviteId/feedback - records one
// panelist's verdict on this interview round. A recruiter/admin enters
// this on the panelist's behalf (panelists don't have their own login in
// this build) - panelistName is typically one of the job's
// interviewPanel emails, but free text is accepted too (a panelist not
// on the job's standing list, an external interviewer, etc.).
// Deliberately allowed on any invite regardless of status - real panels
// sometimes give verbal feedback before the formal "sent" bookkeeping
// catches up, and gating on status would just make people work around it.
router.post('/:inviteId/feedback', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const invite = await InterviewInvite.findOne({ _id: req.params.inviteId, candidateId: candidate._id });
  if (!invite) return res.status(404).json({ error: 'Interview invite not found' });

  const { panelistName, recommendation, score, comments } = req.body;

  if (!panelistName || !panelistName.trim()) {
    return res.status(400).json({ error: 'panelistName is required' });
  }
  if (!['hire', 'reject', 'hold'].includes(recommendation)) {
    return res.status(400).json({ error: 'recommendation must be one of: hire, reject, hold' });
  }
  if (score != null && (score < 0 || score > 100)) {
    return res.status(400).json({ error: 'score must be between 0 and 100' });
  }

  invite.panelFeedback.push({
    panelistName: panelistName.trim(),
    recommendation,
    score: score === '' || score == null ? undefined : Number(score),
    comments: comments ? comments.trim() : undefined,
    submittedBy: req.user.id,
  });

  await invite.save();

  const outcome = computePanelOutcome(invite.panelFeedback);

  await AuditLog.create({
    userId: req.user.id,
    action: 'add_panel_feedback',
    entityType: 'candidate',
    entityId: candidate._id,
    metadata: { round: invite.round, panelistName: panelistName.trim(), recommendation, outcome: outcome.outcome },
  });

  const populated = await invite.populate('panelFeedback.submittedBy', 'name email');
  res.status(201).json({ ...populated.toObject(), panelOutcome: outcome });
});

// PATCH /candidates/:id/interviews/:inviteId/status - mark an invite as
// opened in the mail client or sent, once the recruiter actually acts on it.
router.patch('/:inviteId/status', requireRole('admin', 'recruiter'), async (req, res) => {
  const { status } = req.body;
  if (!['drafted', 'opened_in_mail', 'marked_sent'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const invite = await InterviewInvite.findOneAndUpdate(
    { _id: req.params.inviteId, candidateId: req.params.id },
    { status },
    { new: true }
  );
  if (!invite) return res.status(404).json({ error: 'Interview invite not found' });

  res.json(invite);
});

module.exports = router;
