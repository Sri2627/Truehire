function normalizeSkillName(name) {
  return String(name || '').trim().toLowerCase();
}

// Computes a 0-100 match score for a candidate against a job's required
// skills (each with a weight and an optional minimum years) plus an
// optional total-experience requirement. Pure arithmetic, no AI - every
// number here traces back to a rule you can point at, and the
// "explanation" (matched/missing/exceeding) returned alongside it is a
// readout of that same math, not separately-generated text that could
// drift from it.
function computeMatchScore(job, candidate) {
  const requiredSkills = job.requiredSkills || [];
  const candidateSkillMap = new Map(
    (candidate.skills || []).map((s) => [normalizeSkillName(s.name), s])
  );

  const totalWeight = requiredSkills.reduce((sum, s) => sum + (s.weight || 0), 0) || 1;

  let skillScore = 0;
  const matched = [];
  const missing = [];
  const exceeding = [];

  for (const req of requiredSkills) {
    const key = normalizeSkillName(req.name);
    const candidateSkill = candidateSkillMap.get(key);
    const normalizedWeight = (req.weight || 0) / totalWeight;

    if (!candidateSkill) {
      missing.push({ name: req.name, weight: req.weight });
      continue;
    }

    const candidateYears = candidateSkill.years ?? null;
    const yearsSource = candidateSkill.source || (candidateYears != null ? 'stated' : null);
    const minYears = req.minYears || 0;

    let credit;
    if (minYears <= 0) {
      credit = 1; // job didn't ask for a minimum - having the skill is full credit
    } else if (candidateYears == null) {
      // Candidate has the skill but no number attached at all (rare once
      // timeline derivation runs, but possible for a skill mentioned only
      // outside any dated role, e.g. in a summary line) - partial credit
      // rather than either full marks or a penalty for missing data.
      credit = 0.6;
    } else {
      // Full credit at minYears, a little extra (capped) for exceeding it.
      credit = Math.min(candidateYears / minYears, 1.2);
    }

    skillScore += normalizedWeight * credit * 100;
    matched.push({ name: req.name, weight: req.weight, candidateYears, yearsSource, minYears });

    if (minYears > 0 && candidateYears != null && candidateYears > minYears) {
      exceeding.push({ name: req.name, candidateYears, minYears });
    }
  }

  skillScore = Math.max(0, Math.min(100, Math.round(skillScore)));

  let experienceScore = null;
  if (job.minExperienceYears) {
    const years = candidate.totalYearsExperience;
    experienceScore =
      years == null ? 0 : Math.max(0, Math.min(100, Math.round(Math.min(years / job.minExperienceYears, 1.2) * 100)));
  }

  // Skills carry most of the weight; total experience (only scored when
  // the job actually states a minimum) fills in the rest.
  const finalScore = experienceScore == null ? skillScore : Math.round(skillScore * 0.8 + experienceScore * 0.2);

  return { score: finalScore, skillScore, experienceScore, matched, missing, exceeding };
}

module.exports = { computeMatchScore, normalizeSkillName };
