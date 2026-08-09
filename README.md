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
the UI. Roles: `admin`, `recruiter`, `viewer` — matching the spec's
Team & Roles screen.

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

## What's scaffolded vs. what's next

Built now: JWT auth (login/refresh/me), role-protected candidate CRUD,
role-protected team management, the DB init/seed script, resume upload +
fraud watch-list screening at registration time (above), and a React
shell (login, dashboard, candidates list + register-with-resume form +
re-screening, team & roles page with role dropdown — visible only to
admins).

Not yet built (present in the original spec, not requested in this pass):
OTP sign-in, UAN/employment overlap check, interview-invite drafting,
audit log UI, reports/export. The Mongo schemas and audit_log collection
are already in place for these — the models are in `backend/models/`.
