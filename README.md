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
# edit .env: set MONGO_URI to your local or Atlas connection string,
# and set real JWT_ACCESS_SECRET / JWT_REFRESH_SECRET values
```

### Run the init script (creates the "tables" + first admin login)

This is the script that sets up MongoDB when you first run the project:

```bash
npm run init-db
```

What it does:
- Creates every collection (`users`, `companies`, `fraud_companies`,
  `candidates`, `screenings`, `uan_records`, `interview_invites`,
  `audit_log`) with a JSON-schema validator, so MongoDB itself rejects
  malformed documents.
- Builds the indexes each collection needs (unique email/mobile on
  `users`, lookup indexes on the rest).
- Creates a "Default Company" tenant and seeds one **admin** user using
  the `SEED_ADMIN_*` values from `.env` (defaults to
  `admin@truehire.local` / `ChangeMe123!` if you don't set them).
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

- `POST /auth/register` — create a user (name, password, email or mobile,
  role, companyId)
- `POST /auth/login` — `{ identifier, password }` → `{ accessToken,
  refreshToken, user }`
- `POST /auth/refresh` — exchange a refresh token for a new access token
- `GET /auth/me` — current user profile (requires `Authorization: Bearer
  <accessToken>`)

Every protected route checks the role **on the server**
(`middleware/auth.js` → `requireAuth` + `requireRole(...)`), not just in
the UI. Roles: `superadmin`, `admin`, `recruiter`, `viewer` — the first
three matching the spec's Team & Roles screen, plus a platform-level
`superadmin` (see below).

### Creating the platform superadmin

`superadmin` is a platform-level role, not tied to any one institution
(`companyId` is `null`). It's the account that lands on the
Institutions screen and can see/add/suspend every institution and its
fraud watch-list, rather than just its own tenant's. It's never handed
out through the public signup/register forms — you create it once from
the command line:

```bash
npm run create-superadmin you@platform.local YourPassword123
# or with no args: uses SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD
# from .env, falling back to superadmin@truehire.local / ChangeMe123!
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

## What's scaffolded vs. what's next

Built now: JWT auth (login/refresh/me), role-protected candidate CRUD,
role-protected team management, the DB init/seed script, resume upload +
fraud watch-list screening at registration time, job matching/ranking with
timeline-derived skill years, and deterministic employment-overlap /
unrealistic-growth checks (all above) — plus a React shell (login,
dashboard, candidates list + register-with-resume form + re-screening,
team & roles page with role dropdown — visible only to admins).

Not yet built (present in the original spec, not requested in this pass):
OTP sign-in, a frontend table/UI for the new `/jobs/:id/matches` ranking
endpoint (the API is ready; nothing renders it yet), interview-invite
drafting, audit log UI, reports/export. The Mongo schemas and audit_log
collection are already in place for these — the models are in
`backend/models/`.
