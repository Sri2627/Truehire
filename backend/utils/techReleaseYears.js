// When each technology first became publicly available. Used for a
// simple, deterministic sanity check: nobody can have more years of
// experience with a technology than the technology has existed for.
// No AI needed - "15 years of Kubernetes" is checkable as a hard fact
// (Kubernetes shipped in 2014) without ever looking at the candidate's age.
//
// Keys are lowercase, aliases included so "k8s" / "kubernetes" both hit.
// Extend this list as new skills show up in job postings or resumes -
// anything not listed here is skipped (not flagged), so an incomplete
// table fails safe rather than producing false positives.
const RELEASE_YEARS = {
  // Frontend
  angular: 2010, // AngularJS 2010, Angular (v2+) 2016 - use the earlier, more generous date
  angularjs: 2010,
  react: 2013,
  'react.js': 2013,
  reactjs: 2013,
  vue: 2014,
  'vue.js': 2014,
  svelte: 2016,
  jquery: 2006,
  typescript: 2012,
  javascript: 1995,

  // Backend / frameworks
  '.net': 2002,
  'asp.net': 2002,
  '.net core': 2016,
  'node.js': 2009,
  nodejs: 2009,
  node: 2009,
  express: 2010,
  django: 2005,
  flask: 2010,
  spring: 2003,
  'spring boot': 2014,
  laravel: 2011,
  rails: 2004,
  'ruby on rails': 2004,

  // Languages
  python: 1991,
  java: 1995,
  'c#': 2000,
  golang: 2009,
  go: 2009,
  rust: 2010,
  kotlin: 2011,
  swift: 2014,
  php: 1995,

  // Cloud / infra
  aws: 2006,
  azure: 2010,
  gcp: 2008,
  'google cloud': 2008,
  docker: 2013,
  kubernetes: 2014,
  k8s: 2014,
  terraform: 2014,
  ansible: 2012,
  jenkins: 2011,
  // AWS-specific services - easy to miss since "aws" alone doesn't cover
  // them, and JDs frequently name the specific service as its own
  // required skill (this happened for real: "Amazon S3" was configured
  // as a required skill on a job and could never match anything because
  // no S3 alias existed here - the extractor silently found nothing).
  s3: 2006,
  'aws s3': 2006,
  'amazon s3': 2006,
  lambda: 2014,
  'aws lambda': 2014,
  'api gateway': 2015,
  'aws api gateway': 2015,
  dynamodb: 2012,
  'amazon dynamodb': 2012,
  serverless: 2014, // the term/pattern's popularization via AWS Lambda's launch
  git: 2005,
  'github actions': 2019,

  // Data
  mongodb: 2009,
  postgresql: 1996,
  postgres: 1996,
  mysql: 1995,
  'sql server': 1989,
  sql: 1974, // SQL itself, not any specific product - generous on purpose
  redis: 2009,
  elasticsearch: 2010,
  kafka: 2011,
  graphql: 2015,
  'rest api': 1999, // per Fielding's REST dissertation
  microservices: 2005, // term/pattern popularized ~2011-2014; using the earlier documented usage is deliberately generous

  // Mobile
  'react native': 2015,
  flutter: 2017,
};

function normalizeSkillName(name) {
  return String(name || '').trim().toLowerCase();
}

function releaseYearFor(skillName) {
  return RELEASE_YEARS[normalizeSkillName(skillName)] ?? null;
}

function maxPossibleYears(skillName, asOfDate = new Date()) {
  const year = releaseYearFor(skillName);
  if (year == null) return null;
  return asOfDate.getFullYear() - year;
}

module.exports = { RELEASE_YEARS, releaseYearFor, maxPossibleYears, normalizeSkillName };
