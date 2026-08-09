const crypto = require('crypto');
const express = require('express');
const Candidate = require('../models/Candidate');
const Screening = require('../models/Screening');
const InterviewInvite = require('../models/InterviewInvite');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendCandidateEmail } = require('../utils/mailer');

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
    .sort({ draftedAt: -1 });

  res.json(invites);
});

// POST /candidates/:id/interviews - draft an email and/or schedule an
// interview (Teams by default) for a verified candidate. subject/body are
// required. Pass sendNow: true (used by the Email popup's Send button) to
// actually deliver the email to the candidate right away via the backend
// mailer, instead of just saving a draft; scheduledAt is optional and,
// when present with mode "teams", gets a generated Teams join link.
router.post('/', requireRole('admin', 'recruiter'), async (req, res) => {
  const candidate = await loadVerifiedCandidate(req, res);
  if (!candidate) return;

  try {
    const { round, subject, body, scheduledAt, mode, sendNow } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ error: 'subject and body are required' });
    }

    const invite = new InterviewInvite({
      candidateId: candidate._id,
      round: round || 'L1',
      subject,
      body,
      draftedBy: req.user.id,
    });

    if (scheduledAt) {
      invite.scheduledAt = new Date(scheduledAt);
      invite.mode = mode || 'teams';
      if (invite.mode === 'teams') {
        invite.meetingLink = buildTeamsLink();
      }
    }

    let delivered = false;
    if (sendNow) {
      try {
        const result = await sendCandidateEmail({ to: candidate.email, subject, text: body });
        delivered = result.delivered;
        invite.status = 'marked_sent';
      } catch (mailErr) {
        return res.status(502).json({ error: mailErr.message || 'Could not send the email' });
      }
    }

    await invite.save();

    await AuditLog.create({
      userId: req.user.id,
      action: sendNow ? 'send_interview_email' : scheduledAt ? 'schedule_interview' : 'draft_interview_email',
      entityType: 'candidate',
      entityId: candidate._id,
      metadata: { round: invite.round, scheduledAt: invite.scheduledAt, mode: invite.mode, delivered },
    });

    res.status(201).json({ ...invite.toObject(), delivered });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create interview invite' });
  }
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
