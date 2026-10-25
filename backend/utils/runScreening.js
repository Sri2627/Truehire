const fs = require('fs');
const FraudCompany = require('../models/FraudCompany');
const Screening = require('../models/Screening');
const AuditLog = require('../models/AuditLog');
const { extractResumeText } = require('./extractResumeText');
const { screenResumeText } = require('./screenText');
const { extractSkillsFromText, MASTER_SKILLS } = require('./skillExtraction');
const { deriveSkillYearsFromTimeline, deriveTotalExperience } = require('./timelineExtraction');
const { runCareerChecks } = require('./careerChecks');

async function runScreening({ candidate, file, userId, extractedText: preExtracted }) {
  const extractedText =
    preExtracted !== undefined ? preExtracted : await extractResumeText(fs.readFileSync(file.path), file.originalname);
  const fraudCompanies = await FraudCompany.find({
    $or: [{ companyId: candidate.companyId }, { companyId: null }],
  });
  const { verdict, fraudMatches } = screenResumeText(extractedText, fraudCompanies);
  const stated = extractSkillsFromText(extractedText);
  const derivedByName = new Map(
    deriveSkillYearsFromTimeline(extractedText, MASTER_SKILLS).map((skill) => [skill.name, skill])
  );

  candidate.skills = stated.map((skill) => {
    if (skill.years != null) return { name: skill.name, years: skill.years, source: 'stated' };
    const derived = derivedByName.get(skill.name);
    return derived
      ? { name: skill.name, years: derived.years, source: 'timeline_derived' }
      : { name: skill.name, years: null, source: null };
  });

  const totalYearsExperience = deriveTotalExperience(extractedText);
  const { overlaps, growthFlags } = runCareerChecks(extractedText);
  candidate.extractedText = extractedText;
  candidate.resumeFileKey = file.filename;
  if (totalYearsExperience != null) {
    candidate.totalYearsExperience = totalYearsExperience;
    candidate.totalYearsExperienceSource = 'timeline_derived';
  }
  candidate.careerFlags = [
    ...overlaps.map((detail) => ({ type: 'employment_overlap', detail })),
    ...growthFlags.map((detail) => ({ type: 'unrealistic_growth', detail })),
  ];
  await candidate.save();

  const screening = await Screening.create({
    candidateId: candidate._id,
    verdict,
    fraudMatches,
    fraudListSize: fraudCompanies.length,
    screenedBy: userId,
  });

  await AuditLog.create({
    userId,
    action: 'upload_resume',
    entityType: 'candidate',
    entityId: candidate._id,
    metadata: {
      verdict,
      matchCount: fraudMatches.length,
      fraudListSize: fraudCompanies.length,
      fileName: file.originalname,
      skillCount: candidate.skills.length,
      careerFlagCount: candidate.careerFlags.length,
    },
  });

  return screening.populate('fraudMatches.fraudCompanyId', 'name');
}

module.exports = { runScreening };
