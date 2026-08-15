const mongoose = require('mongoose');

const interviewInviteSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    round: { type: String, enum: ['L1', 'L2', 'HR', 'offer'], default: 'L1' },
    // Filled in when the invitation email is actually sent (see POST
    // /:inviteId/send in routes/interviewRoutes.js), not when the
    // interview is first scheduled - scheduling now always happens
    // first, and only then does the Email preview popup (pre-filled
    // with the meeting link below) let the subject/body be set and sent.
    subject: { type: String },
    body: { type: String },
    // Interview-panel emails CC'd on the invitation email once sent -
    // captured at send time (see POST /:inviteId/send) so the record
    // reflects who actually got it, even if the job's panel list changes
    // later.
    cc: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ['drafted', 'opened_in_mail', 'marked_sent'],
      default: 'drafted',
    },
    // Optional interview scheduling, added alongside the plain "draft an
    // email" flow above - a verified candidate can be emailed, scheduled,
    // or both in the same invite.
    scheduledAt: { type: Date },
    mode: { type: String, enum: ['teams', 'phone', 'in_person'], default: 'teams' },
    // Placeholder Teams meeting link (no live Microsoft Graph/Teams
    // integration is wired up) - generated when mode is 'teams' and
    // scheduledAt is set, so the invite still has something to send/join.
    meetingLink: { type: String },
    draftedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // What the panel actually decided, once the interview has happened.
    // Panelists don't get their own logins in this build - a recruiter or
    // admin records each panelist's verdict on their behalf (typically
    // one per email in the job's interviewPanel list), so this is one
    // entry per panelist per round, not one entry per invite.
    panelFeedback: [
      {
        panelistName: { type: String, required: true, trim: true },
        recommendation: { type: String, enum: ['hire', 'reject', 'hold'], required: true },
        score: { type: Number, min: 0, max: 100 }, // optional - not every panel scores numerically
        comments: { type: String, trim: true },
        submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        submittedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: { createdAt: 'draftedAt', updatedAt: false },
    // Explicit collection name - Mongoose's auto-pluralized default for
    // "InterviewInvite" is "interviewinvites" (no underscore), not the
    // "interview_invites" collection scripts/initDb.js creates. See
    // models/FraudCompany.js for the full explanation of why this matters.
    collection: 'interview_invites',
  }
);

module.exports = mongoose.model('InterviewInvite', interviewInviteSchema);
