// Combines the deterministic signals actually available into one final
// hiring recommendation for a candidate against the job they're
// registered for. Same approach as the rest of this app's scoring
// (utils/jobMatching.js, utils/panelOutcome.js): every number traces
// back to a rule-based check that already ran elsewhere, weights
// re-normalize over whichever signals exist yet so an unrun check never
// silently drags the score down, and "reasons"/"concerns" are a direct
// readout of that same math - never separately-generated text that
// could drift from it.
//
// Coding Assessment, Background Verification, and HR Interview scoring
// (BRD Phase 2 Modules 2/6/3) aren't built yet - when they are, give them
// a real share of these weights instead of leaving this at three signals.
const WEIGHTS = {
  integrity: 0.3, // fraud watch-list + resume career-consistency checks
  jobMatch: 0.35, // utils/jobMatching.js
  interview: 0.35, // aggregated panel feedback across all interview rounds
};

// Fraud verdict + resume career-consistency flags (overlaps, unrealistic
// growth) folded into one "is this candidate who they say they are"
// signal. A fraud match is a hard 0; each career flag knocks points off
// rather than zeroing it outright, since a resume-parsing false positive
// on an unusual layout shouldn't behave identically to a real fraud hit.
function integritySignal(screening, careerFlags) {
  if (!screening) return null;

  let score = 100;
  const reasons = [];
  const concerns = [];

  if (screening.verdict === 'flagged') {
    score = 0;
    const n = screening.fraudMatches?.length || 0;
    concerns.push(`Matched ${n} fraud watch-list entr${n === 1 ? 'y' : 'ies'}`);
  } else if (screening.fraudListSize === 0) {
    // Scan ran against an empty list - not a real signal either way.
  } else {
    reasons.push('No fraud watch-list match');
  }

  const flagCount = careerFlags?.length || 0;
  if (flagCount > 0) {
    score = Math.max(0, score - flagCount * 25);
    for (const f of careerFlags) {
      concerns.push(
        f.type === 'employment_overlap'
          ? 'Overlapping employment dates on resume'
          : 'Unrealistic career-growth jump on resume'
      );
    }
  } else if (screening.fraudListSize !== 0) {
    reasons.push('No resume timeline inconsistencies found');
  }

  return { score, reasons, concerns };
}

// Aggregates panel outcomes (see utils/panelOutcome.js) across every
// interview round a candidate has had. A single round's outright reject
// overrides everything else - matches panelOutcome's own "one no stops
// the process" logic. Rounds without a numeric avg score fall back to a
// flat estimate (hire ~85, hold ~50) so a round that was decided without
// formal scoring still counts for something instead of being dropped.
function interviewSignal(invites) {
  const outcomes = (invites || []).map((inv) => inv.panelOutcome).filter((o) => o && o.outcome !== 'pending');
  if (outcomes.length === 0) return null;

  if (outcomes.some((o) => o.outcome === 'reject')) {
    return { score: 0, detail: 'At least one interview round was rejected by the panel', isReject: true };
  }

  const roundScores = outcomes.map((o) => (o.avgScore != null ? o.avgScore : o.outcome === 'hire' ? 85 : 50));
  const score = Math.round(roundScores.reduce((a, b) => a + b, 0) / roundScores.length);
  return { score, detail: `Averaged across ${outcomes.length} interview round(s)`, isReject: false };
}

function computeHiringRecommendation({ screening, careerFlags, matchScore, invites }) {
  const signals = [];
  const reasons = [];
  const concerns = [];

  const integrity = integritySignal(screening, careerFlags);
  if (integrity) {
    signals.push({ key: 'integrity', score: integrity.score, weight: WEIGHTS.integrity });
    reasons.push(...integrity.reasons);
    concerns.push(...integrity.concerns);
  }

  if (matchScore != null) {
    signals.push({ key: 'jobMatch', score: matchScore, weight: WEIGHTS.jobMatch });
  }

  const interview = interviewSignal(invites);
  if (interview) {
    signals.push({ key: 'interview', score: interview.score, weight: WEIGHTS.interview });
    (interview.isReject ? concerns : reasons).push(interview.detail);
  }

  if (signals.length === 0) {
    return { score: null, label: 'Not enough data yet', reasons, concerns, breakdown: {} };
  }

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const score = Math.round(signals.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight);

  // A hard reject signal (fraud match or a panel reject) always wins,
  // regardless of what the blended number came out to - a candidate
  // flagged for fraud or rejected by the panel is never a "Borderline".
  const hardReject = integrity?.score === 0 || interview?.isReject;

  let label;
  if (hardReject) label = 'Reject';
  else if (score >= 80) label = 'Strong Hire';
  else if (score >= 60) label = 'Hire';
  else if (score >= 40) label = 'Borderline';
  else label = 'Reject';

  return {
    score,
    label,
    reasons,
    concerns,
    breakdown: Object.fromEntries(signals.map((s) => [s.key, s.score])),
  };
}

module.exports = { computeHiringRecommendation };
