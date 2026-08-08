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
    draftedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'draftedAt', updatedAt: false } }
);

module.exports = mongoose.model('InterviewInvite', interviewInviteSchema);
