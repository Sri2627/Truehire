// Monthly price (INR) assumed for each Company.plan value. There is no
// payment gateway wired into True Hire yet - no Razorpay/Stripe
// subscription, no invoices, no real transaction log - so every revenue
// figure the app shows (routes/institutionRoutes.js GET /revenue,
// pages/Revenue.jsx) is an ESTIMATE computed from this table, not a
// record of money that has actually been collected. Keep that framing in
// the UI copy wherever these numbers are shown.
//
// Update this table (and only this table) if pricing changes - every
// revenue calculation reads from here.
const PLAN_PRICING = {
  free: 0,
  pro: 4999,
  enterprise: 19999,
};

const PLAN_LABELS = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

// Usage caps enforced server-side (routes/jobRoutes.js POST /,
// routes/candidateRoutes.js POST / and POST /bulk) - not just numbers
// shown on the pricing page. `Infinity` means uncapped; JSON.stringify
// turns that into `null` on the wire (see GET /auth/plans below), which
// the frontend treats as "Unlimited".
const PLAN_LIMITS = {
  free: { jobs: 10, candidates: 100 },
  pro: { jobs: 100, candidates: 1000 },
  enterprise: { jobs: Infinity, candidates: Infinity },
};

module.exports = { PLAN_PRICING, PLAN_LABELS, PLAN_LIMITS };
