# Odonto

A web-based dental clinic management app: patients, appointments, odontogram, treatments, billing, attachments, reports. Bilingual (es / en), per-clinic currency, role-based access (admin / dentist / receptionist).

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + shadcn-style UI primitives
- **next-intl** (i18n: es default, en secondary)
- **Auth.js v5** (Credentials, JWT sessions, bcrypt)
- **Turso / LibSQL** as the database (raw `@libsql/client`)
- **Vercel Blob** for file attachments (X-rays, photos, consent)
- **jsPDF** for invoice PDF export
- **Recharts v3** for reports

## Local development

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# then edit .env.local — see "Environment variables" below

# 3. Create local DB + run migrations
npm run migrate
npm run seed      # optional: 3 demo users + 10 demo patients

# 4. Run
npm run dev
# open http://localhost:3000
```

For a local DB without Turso, set in `.env.local`:

```
TURSO_URL=file:./local.db
TURSO_TOKEN=
```

### Seed credentials

| Email         | Password    | Role         |
| ------------- | ----------- | ------------ |
| `admin@local` | `Admin123!` | admin        |
| `doc@local`   | `Doctor123!`| dentist      |
| `front@local` | `Front123!` | receptionist |

## Environment variables

| Name                 | Required | Notes                                                        |
| -------------------- | -------- | ------------------------------------------------------------ |
| `TURSO_URL`          | yes      | `libsql://<db>-<org>.turso.io` for prod, `file:./local.db` for local |
| `TURSO_TOKEN`        | prod     | Turso DB auth token                                          |
| `AUTH_SECRET`        | yes      | `openssl rand -base64 32`                                    |
| `AUTH_URL`           | prod     | e.g. `https://odonto.vercel.app`                             |
| `BLOB_READ_WRITE_TOKEN` | yes    | Vercel Blob token                                            |
| `CLINIC_LOCALE`      | local    | `es` (default → ARS) or `en` (→ USD); only used by the seed |

## CI / CD / Deploy

The repo ships with three GitHub Actions workflows. Once you set the GitHub secrets, every push runs them automatically — no manual work.

### Workflows

| File                          | Trigger                | What it does                                             |
| ----------------------------- | ---------------------- | -------------------------------------------------------- |
| `.github/workflows/ci.yml`    | every push / PR        | typecheck, lint, build (uses `file:./.ci.db`)            |
| `.github/workflows/e2e.yml`   | every push / PR        | Playwright smoke (login → create patient → guards)       |
| `.github/workflows/deploy.yml`| push to `main`         | `vercel deploy --prod` + smoke test the live URL         |

### One-shot setup (after you have a Turso DB and a Vercel token)

1. **Create a Turso DB** (free tier):
   ```bash
   turso db create odonto
   turso db tokens create odonto
   ```
   Save the URL (`libsql://odonto-<your-org>.turso.io`) and the token.

2. **Generate a Vercel token** at <https://vercel.com/account/tokens> (scope: Full Access, or scoped to this project once it's created).

3. **Run the bootstrap script** locally:
   ```bash
   export VERCEL_TOKEN='<vercel-token>'
   export TURSO_URL='libsql://odonto-<your-org>.turso.io'
   export TURSO_TOKEN='<turso-token>'
   # Optional: AUTH_URL if you have a custom domain
   npm run vercel:setup
   ```
   The script will:
   - Link the Vercel project (creating it on first run)
   - Create a Vercel Blob store named `odonto` and capture its token
   - Push `TURSO_URL`, `TURSO_TOKEN`, `AUTH_SECRET`, `AUTH_URL`, `BLOB_READ_WRITE_TOKEN` to Vercel (all 3 env targets)
   - Push the same values as GitHub Actions secrets on `JuanchoGithub/odonto`
   - Run `npm run migrate` against the production Turso DB
   - `git push origin main` to trigger the first deploy

4. **Branch protection (optional but recommended):** Settings → Branches → Add rule for `main` → require `quality` and `e2e` from CI to pass before merge.

### Subsequent deploys

Just `git push origin main`. The `Deploy` workflow runs the production build via Vercel and smoke-tests the live URL.

### Re-running setup

If you need to rotate a secret or re-provision Blob, re-run `npm run vercel:setup`. It is idempotent for env vars (Vercel deduplicates by key+target).

### Manual deploy (fallback)

```bash
vercel deploy --prod --token=$VERCEL_TOKEN
```

## Architecture

```
app/
  [locale]/           # i18n segment; layouts enforce auth + role
    (auth)/login
    (app)/
      dashboard/      # KPIs
      patients/       # CRUD, search, profile tabs
      appointments/   # week calendar + conflict check
      treatments/     # per-patient + global list
      billing/        # invoices, payments, PDF export
      reports/        # revenue, top treatments, no-show, productivity
      settings/       # clinic profile + user mgmt (admin only)
  api/                # auth + per-entity JSON endpoints
components/           # UI primitives + module components
lib/                  # db, auth, rbac, i18n, format, schemas
server/actions/       # 'use server' actions per module
migrations/           # plain .sql files, applied by scripts/migrate.mjs
scripts/              # migrate.mjs, seed.mjs
messages/             # es.json, en.json
```

### Data model (SQLite / Turso)

`clinics` · `users` · `patients` · `appointments` · `teeth_chart` · `tooth_conditions` · `treatments` · `invoices` · `invoice_lines` · `payments` · `attachments` · `audit_log`

Foreign keys are ON (`PRAGMA foreign_keys = ON`). Every write to a clinical entity appends a row to `audit_log`.

### Currency & tax

- Locale default: `es → ARS`, `en → USD`. Editable in `/settings` per clinic.
- Stored in cents (integer) to avoid float drift.
- `formatMoney(cents, currency, locale)` uses `Intl.NumberFormat` for display.
- jsPDF invoice export reuses the same formatter.
- Each invoice line carries `tax_kind` (`standard | reduced | none`) and `tax_bps`. The clinic defines the two preset rates (`tax_rate_standard_bps`, `tax_rate_reduced_bps`).

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run migrate` — apply pending `.sql` migrations
- `npm run seed` — insert demo data

## Adding a migration

Create `migrations/NNNN_description.sql` with `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` statements. The runner applies files in lexical order and records them in `_migrations`. Idempotent SQL is preferred.

## Roles

| Role          | Patients | Appointments | Odontogram | Treatments | Billing | Reports | Settings |
| ------------- | -------- | ------------ | ---------- | ---------- | ------- | ------- | -------- |
| admin         | ✓        | ✓            | ✓          | ✓          | ✓       | ✓       | ✓        |
| dentist       | ✓        | ✓            | ✓          | ✓          | read    | ✓       |          |
| receptionist  | ✓        | ✓            |            |            | ✓       | ✓       |          |

Role is enforced both in the nav and in every server action via `requireRole()` / `requireUser()`.
