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

## Production deploy (Vercel + Turso)

1. **Provision a Turso DB**
   ```bash
   # https://docs.turso.tech/quickstart
   turso db create odonto
   turso db tokens create odonto
   ```
   Save the URL (`libsql://...`) and the token.

2. **Push the repo to GitHub** (or GitLab/Bitbucket) and import the project in Vercel.

3. **Set environment variables in Vercel** (Project → Settings → Environment Variables):
   - `TURSO_URL` = `libsql://odonto-<your-org>.turso.io`
   - `TURSO_TOKEN` = the token from step 1
   - `AUTH_SECRET` = `openssl rand -base64 32`
   - `AUTH_URL` = `https://<your-domain>`
   - `BLOB_READ_WRITE_TOKEN` = Vercel Blob token (Storage → Create Store → "odonto" → copy the `BLOB_READ_WRITE_TOKEN`)

4. **Run migrations + seed against the production DB** (one-time, locally):
   ```bash
   TURSO_URL='libsql://odonto-<your-org>.turso.io' \
   TURSO_TOKEN='<token>' \
   CLINIC_LOCALE=es \
   npm run migrate
   TURSO_URL='libsql://odonto-<your-org>.turso.io' \
   TURSO_TOKEN='<token>' \
   CLINIC_LOCALE=es \
   npm run seed
   ```
   After the first run, the application's first-login flow will force an admin to confirm the clinic profile (currency, locale, tax rates) in `/settings`.

5. **Deploy** — push to the connected branch and Vercel will build + deploy.

> The `postinstall` script runs `node scripts/migrate.mjs` against whatever DB the build env sees. For Vercel builds, set the Turso URL + token as env vars **before the first build** so migrations are applied automatically. If migrations ever fail to apply at build time, run them manually against prod as in step 4.

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
