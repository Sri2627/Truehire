# True Hire — React + Node/Express + MongoDB

Revised stack per your instructions: React frontend, Node.js/Express backend,
MongoDB, JWT-based role authentication. Android is parked for a later phase.

## Folder layout

```
truehire/
  backend/     Node.js + Express API, MongoDB models, JWT auth, init script
  frontend/    React (Vite) app - login, dashboard, candidates, team/roles
```

## 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env: set MONGO_URI, two different random JWT secrets (32+ chars),
# SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (12+ chars), and CORS_ORIGINS
```

### Run the init script (creates the "tables" + first admin login)

This is the script that sets up MongoDB when you first run the project:

```bash
npm run init-db
```

What it does:
- Creates every collection (`users`, `companies`, `fraud_companies`,
  `candidates`, `screenings`, `uan_records`, `interview_invites`,
  `job_applications`,
  `audit_log`) with a JSON-schema validator, so MongoDB itself rejects
  malformed documents.
- Builds the indexes each collection needs (unique email/mobile on
  `users`, lookup indexes on the rest).
- Creates a "Default Company" tenant and seeds one **admin** user using
  `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env`; the script
  refuses to seed a default or short password.
- Safe to re-run — it skips anything that already exists and just
  refreshes the validators.

### Load the fraud watch-list (13.5k companies)

`backend/data/fake_institutions.xlsx` ships with the project. After
`init-db` has created the tenant, load it into `fraud_companies`:

```bash
npm run seed-fraud-list
```

This parses the "Fake Institutions" column, normalizes each name
(lowercase, punctuation stripped) for matching, collapses in-file
duplicates, and upserts into the `Default Company` tenant on a unique
`(companyId, normalizedName)` index — so it's safe to re-run and won't
create duplicates. Pass a different file or tenant name as arguments:

```bash
npm run seed-fraud-list -- /path/to/other-file.xlsx "Some Other Company"
```

### Start the API

```bash
npm start
# or npm run dev for auto-restart on file changes
```

The API listens on `http://localhost:5000` (change `PORT` in `.env`).

### Auth flow (JWT, role-based)

- `POST /auth/signup` — public institution signup; the first account is
  always an institution admin.
- `POST /auth/jobseeker-signup` — public signup that assigns only the
  `jobseeker` role and creates no institution membership.
- `POST /auth/register` — authenticated admin endpoint for adding only
  tenant-scoped admin/recruiter/viewer accounts. Public role or tenant
  selection is not allowed; use `/team` for normal invitations.
- `POST /auth/login` — `{ identifier, password }` → `{ accessToken,
  refreshToken, user }`
- `POST /auth/refresh` — exchange a refresh token for a new access token
- `GET /auth/me` — current user profile (requires `Authorization: Bearer
  <accessToken>`)

Every protected route checks the role **on the server**
(`middleware/auth.js` → `requireAuth` + `requireRole(...)`), not just in
the UI. Roles are `superadmin`, `admin`, `recruiter`, `viewer`, and
`jobseeker`. Institution team roles are admin/recruiter/viewer; superadmin
is platform-only and jobseeker accounts are separate from employers.

### Creating the platform superadmin

`superadmin` is a platform-level role, not tied to any one institution
(`companyId` is `null`). It's the account that lands on the
Institutions screen and can see/add/suspend every institution and its
fraud watch-list, rather than just its own tenant's. It's never handed
out through the public signup/register forms — you create it once from
the command line:

```bash
npm run create-superadmin you@platform.local YourUniquePassword123
# Or set SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD in .env.
# New superadmin passwords must be at least 12 characters.
```

Safe to re-run — running it again on an existing email just checks it's
already a superadmin.

**Promoting an existing user instead of creating a new one:** if the
email you pass already has an account (e.g. the default seeded admin,
`admin@truehire.local`), the script promotes that user in place and
leaves its existing password untouched. Just pass the email, no
password:

```bash
npm run create-superadmin admin@truehire.local
```

Then log in with that same account's existing password.

#### Why this doesn't need any special Atlas permissions

The `users` collection on Atlas was likely created (by `init-db`, once,
a while ago) with a server-side JSON-schema validator whose `role` enum
only allows `['admin', 'recruiter', 'viewer']`. Properly fixing that
validator needs the `dbAdmin` role, which a lot of Atlas database users
— especially free-tier ones — don't have, and some don't even have the
`bypassDocumentValidation` privilege either (an earlier version of this
script depended on that and could still fail with `user is not allowed
to do action [bypassDocumentValidation]`).

So this script doesn't fight the validator at all: instead of ever
writing `role: 'superadmin'`, it sets `role: 'admin'` (already
schema-valid) plus a separate `isSuperAdmin: true` flag, which the
validator has no opinion on and so doesn't reject. `authController.js`'s
`effectiveRole()` is the one place that reconciles the two — everywhere
else in the app (route guards, JWTs, the frontend) just keeps checking
for `role === 'superadmin'` as if the flag didn't exist. No `dbAdmin`,
no `bypassDocumentValidation`, no manual Atlas UI edits required.

If an account was created with an older version of this script that did
write `role: 'superadmin'` literally, re-running `create-superadmin` on
that same email automatically migrates it onto the flag-based approach
(you'll see a "Migrated ..." line) — worth doing, since a document with
an invalid `role` value can otherwise fail on unrelated writes (login's
`lastLoginAt` update, password reset, etc.) every time, under MongoDB's
default `strict` validation level.

## 2. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`. The Vite dev server proxies `/auth`,
`/candidates`, and `/team` to the backend on port 5000, so no CORS setup
is needed locally.

Log in with the seeded admin account, or call `POST /auth/register` to
create more users with specific roles.

## 3. Resume upload + fraud watch-list screening

Ported from the standalone **ProfileXRay** tool, and — like ProfileXRay —
the resume is required up front: you register a candidate *with* their
resume, and the verdict comes back as part of registration, not as a
separate later step. The resume (PDF or DOCX) is checked line-by-line for
an **exact match** (case-insensitive, whitespace/punctuation/legal-suffix
normalized — see `utils/normalizeCompanyName.js`) against the
`fraud_companies` watch-list — the same rule ProfileXRay's browser version
used, now run server-side and persisted per candidate.

- `POST /candidates` — multipart, fields `name`/`email`/`phone` + a
  required `resume` file (PDF or DOCX, 10MB max). Creates the candidate,
  immediately extracts and screens the resume in the same request, and
  rolls the candidate record back if screening fails (never leaves an
  unscreened orphan). Returns `{ candidate, screening }`.
- `POST /candidates/:id/screen` — re-screen an existing candidate with a
  new/updated resume file. Same extraction + matching path.
- `GET /candidates/:id/screenings` — screening history for a candidate,
  most recent first.
- `GET /candidates` includes each candidate's `latestScreening`
  (verdict, matches, and `fraudListSize` — how many watch-list entries
  that particular scan ran against) so the list view can show an
  accurate badge without a second call, and so a scan that ran against
  an empty/unseeded list still reads as such after a refresh.
- The API checks PDF/DOCX file signatures in addition to file extensions.
  Bulk upload accepts at most 20 files and 50 MB total; each file is at
  most 10 MB.
- Uploaded files are saved to `backend/uploads/` (gitignored) — swap
  `middleware/upload.js`'s disk storage for S3/GCS-backed storage before
  production use.

In the frontend, the **Candidates** page's "Register a candidate" form
requires a resume file and shows the verdict immediately in a result
panel (verdict, matched fraud entries, or a warning if the fraud list
was empty when the scan ran) — plus a scanning overlay while the request
is in flight. Each row also has a "Re-screen" control for updating an
existing candidate's resume later.

## 4. Job matching, ranking, and deterministic career checks

`POST /jobs` now accepts optional `requiredSkills` (`{ name, weight,
minYears }`) and `minExperienceYears`. Once a job has required skills set,
`GET /jobs/:id/matches` ranks every candidate registered against it by a
0-100 score (`utils/jobMatching.js`) with a per-candidate breakdown
(matched / missing / exceeding) - pure arithmetic, no AI, every number
traceable to the job's stated requirements.

The skill-years problem: most real resumes list skills as a flat block
with no years attached anywhere ("React, TypeScript, AWS, Node.js"), so
there's nothing to score against. Two new modules solve this without an
LLM call:

- `utils/skillExtraction.js` - dictionary presence check (does the resume
  mention this skill at all) plus a regex for the few resumes that *do*
  state "N years of X" explicitly.
- `utils/timelineExtraction.js` - for everything else, derives years from
  the resume's own dated Experience section: parses date ranges
  ("08/2025 - Current", "Jan 2022 – Present", etc.) into role segments,
  finds the earliest segment that mentions a given skill, and computes
  years as (now − that segment's start date), capped by how long the
  technology has existed (`utils/techReleaseYears.js`). Total experience
  is derived the same way, from the single earliest role. Verified against
  a real resume with a flat skills list: every skill correctly extracted
  with `years: null` from the flat list, then correctly backfilled (e.g.
  ~4.4 yrs for a skill first named in a 2022-dated role) from the
  Experience section - a 98% match score against a realistic job posting,
  end to end.
- Stated years always win over derived ones when both exist. Recruiters
  can override anything via `PATCH /candidates/:id` (`skills`,
  `totalYearsExperience`), which is stamped `source: 'manual'`.

Two more checks reuse the same date segments, fully deterministic:

- `utils/careerChecks.js` → `detectEmploymentOverlaps` - flags overlapping
  employment date ranges (the resume-derived version of the existing
  manual UAN-overlap check, no manual data entry required).
- `utils/careerChecks.js` → `detectUnrealisticGrowth` - flags a 2+
  seniority-level jump (via a keyword-based title ranking) inside under
  18 months, e.g. Fresher → Senior Architect → Director within a year.
  Verified against both a clean real resume (no flags) and a synthetic
  fresher-to-director-in-8-months resume (flags both jumps correctly).

Both checks run automatically at registration/screening time and are
stored on the candidate as `careerFlags` - advisory, shown to a
recruiter, never an auto-rejection.

**Deliberately not built here:** an LLM-based version of any of this. The
whole app (fraud screening, job matching, career checks) is built so every
number is traceable to a fixed rule, not a model's judgment call - a
"Level 2" that asks an AI to directly judge fraud/growth realism would
trade that away for cases these heuristics still miss (e.g. narrative
prose with no clean date ranges). Flagging that as a real design decision
this file doesn't resolve on its own, not an oversight.

## Jobseeker accounts and applications

Jobseekers can create an account at `/jobseeker-signup`, browse open
postings at `/careers`, apply with a PDF or DOCX resume, and follow their
application status at `/my-applications`. Jobseekers cannot access
employer, team, or institution-scoped candidate APIs. Applications enter
the employer's existing candidate pipeline and use the same resume
screening workflow.

- The signed-in jobseeker profile (`/profile`) can store one private PDF or
  DOCX resume (up to 10 MB); a new upload replaces the previous file.
- `POST /auth/profile/resume`, `GET /auth/profile/resume`, and
  `DELETE /auth/profile/resume` upload, download, and remove only the
  authenticated jobseeker's own resume.
- `GET /jobs/public` and `GET /jobs/public/:id` return only open postings.
- `POST /applications` accepts multipart `jobId`, `resume`, and optional
  `phone`; repeat applications to the same job are rejected.
- `GET /applications` returns only the signed-in jobseeker's applications.
- Employers can view job applications at `GET /jobs/:id/applications`
  and update status at
  `PATCH /jobs/:id/applications/:applicationId/status`.

## API security and tests

Configure `CORS_ORIGINS` as comma-separated exact frontend origins.
Set `TRUST_PROXY=true` only when running behind one trusted reverse
proxy. The API uses Helmet, bounded JSON and upload sizes, per-IP
authentication throttling, and centralized Express 4 async error
handling. Access and refresh JWT secrets must be different random values
of at least 32 characters. New account and reset passwords require at
least 8 characters.

Run backend tests with `npm test` from `backend/`. The repository root
`.gitignore` excludes generated bundles, uploads, dependency folders,
editor configuration, and environment files.

## What's not included yet

Not yet built: OTP sign-in, a real payment gateway, audit-log UI, and
reports/export.
