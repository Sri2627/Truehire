// Aggregates a set of per-panelist verdicts into a single outcome for the
// round. A single explicit reject wins over everything else - matching
// how most real hiring panels actually work (consensus needed to move
// forward, not a majority vote); all-hire is a clean hire; anything else
// (a mix including a hold, or no feedback submitted yet) is "hold" -
// there's no default hire, silence never reads as a yes.
function computePanelOutcome(panelFeedback) {
  if (!panelFeedback || panelFeedback.length === 0) {
    return { outcome: 'pending', avgScore: null };
  }

  const recommendations = panelFeedback.map((f) => f.recommendation);
  const scores = panelFeedback.filter((f) => f.score != null).map((f) => f.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  let outcome;
  if (recommendations.includes('reject')) {
    outcome = 'reject';
  } else if (recommendations.every((r) => r === 'hire')) {
    outcome = 'hire';
  } else {
    outcome = 'hold';
  }

  return { outcome, avgScore };
}

module.exports = { computePanelOutcome };
