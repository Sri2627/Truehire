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

## What's scaffolded vs. what's next

Built now: JWT auth (login/refresh/me), role-protected candidate CRUD,
role-protected team management, the DB init/seed script, and a React
shell (login, dashboard, candidates list + add form, team & roles page
with role dropdown — visible only to admins).

Not yet built (present in the original spec, not requested in this pass):
OTP sign-in, resume upload + parsing, fraud watch-list matching engine,
UAN/employment overlap check, interview-invite drafting, audit log UI,
reports/export. The Mongo schemas and audit_log collection are already in
place for these — the models are in `backend/models/`.
