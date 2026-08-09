const mongoose = require('mongoose');

const interviewInviteSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    round: { type: String, enum: ['L1', 'L2', 'HR', 'offer'], default: 'L1' },
    subject: { type: String, required: true },
    body: { type: String, required: true },
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
