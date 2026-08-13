// Combines the deterministic signals we actually have into a single
// 0-100 "trust score" for a candidate: the fraud watch-list result and
// the skill-vs-experience consistency check. Every input is a rule-based
// check that already ran elsewhere - this just weights and adds them up.
// No AI, no opaque number: the "reasons"/"concerns" returned alongside
// the score are a direct readout of the same math, not a summary of it.
//
// UAN/employment-overlap is intentionally left out of the weighting for
// now (revisited later). When it's added back in, give it a real share
// of these weights rather than bolting it on as a fourth signal that
// quietly changes what 100% means.
const FRAUD_WEIGHT = 0.6;
const SKILL_CONSISTENCY_WEIGHT = 0.4;

function computeTrustScore(screening) {
  if (!screening) {
    return null; // hasn't been screened yet - nothing to base a score on
  }

  const reasons = [];
  const concerns = [];

  // Fraud signal: 100 if clear, 0 if flagged. A "clear" verdict from a
  // scan that ran against an empty fraud list didn't actually check
  // anything, so it doesn't get to count as a real signal either way.
  let fraudScore;
  if (screening.verdict === 'flagged') {
    fraudScore = 0;
    const n = screening.fraudMatches?.length || 0;
    concerns.push(`Matched ${n} entr${n === 1 ? 'y' : 'ies'} on the fraud watch-list`);
  } else if (screening.fraudListSize === 0) {
    fraudScore = null;
    concerns.push('Fraud watch-list was empty when this candidate was screened — re-screen for a real result');
  } else {
    fraudScore = 100;
    reasons.push('No fraud watch-list match');
  }

  // Skill-consistency signal: 100 if checked and clean, deducted per
  // impossible-years flag, null (no opinion) if never checked.
  let skillScore = null;
  if (screening.skillsChecked) {
    const flagCount = screening.skillFlags?.length || 0;
    skillScore = Math.max(0, 100 - flagCount * 34); // 3+ flags -> 0
    if (flagCount === 0) {
      reasons.push('No skill-vs-experience inconsistencies found');
    } else {
      for (const f of screening.skillFlags) {
        concerns.push(`Claims ${f.claimedYears} years of ${f.skill}, which has existed for at most ${f.maxPossibleYears} years`);
      }
    }
  }

  // Weighted average over whichever signals actually have a value -
  // re-normalize instead of treating "not checked yet" as a 0, so an
  // unrun check doesn't silently drag the score down.
  const signals = [
    fraudScore != null ? { score: fraudScore, weight: FRAUD_WEIGHT } : null,
    skillScore != null ? { score: skillScore, weight: SKILL_CONSISTENCY_WEIGHT } : null,
  ].filter(Boolean);

  if (signals.length === 0) {
    return { score: null, reasons, concerns, breakdown: { fraudScore, skillScore } };
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.round(signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight);

  return { score, reasons, concerns, breakdown: { fraudScore, skillScore } };
}

module.exports = { computeTrustScore };
