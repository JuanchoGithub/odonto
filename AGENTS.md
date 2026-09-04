# AGENTS.md

Onboarding for AI agents and human contributors working on **Odonto**, a Next.js 15 dental clinic management app deployed at `https://midentista.vercel.app`.

This is the source of truth. README.md is a one-page pointer; everything operational lives here.

---

## 1. What is Odonto?

Bilingual (es / en) clinic management app. Modules:
- **Patients** — CRUD + insurance link + per-patient odontogram + treatments + invoices
- **Appointments** — week calendar with conflict detection
- **Insurers** (obras sociales) — master table, searchable, with inline onboarding
- **Treatments** — per-patient pipeline + cost
- **Billing** — invoices (two-rate tax) + payments + jsPDF export
- **Reports** — recharts dashboards (revenue, top treatments, no-show, by-dentist)
- **Settings** — clinic profile (currency, locale, tax rates) + user management
- **Attachments** — Vercel Blob storage (X-rays, photos, consent)
- **Dashboard** — KPIs

Default currency is per-clinic; default locale is `es` (ARS) or `en` (USD), editable in Settings.

---

## 2. Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + TypeScript (strict) |
| UI | Tailwind CSS + shadcn-style primitives (`components/ui/*`) |
| i18n | `next-intl` with `[locale]` segment; locales `es` (default), `en` |
| Auth | Auth.js v5 (Credentials + JWT) + bcryptjs |
| DB | **Turso / LibSQL** (raw `@libsql/client`, no ORM) |
| Migrations | plain `.sql` files in `migrations/`, applied by `scripts/migrate.mjs` |
| Files | Vercel Blob (`@vercel/blob`) |
| PDF | jsPDF (client-side) |
| Charts | Recharts v3 |
| Forms | `react-hook-form` + `zod` |
| Tables | TanStack Table (under shadcn) |
| Validation | zod |
| Date | `date-fns` + `date-fns-tz` |
| Tests | Playwright (e2e) |
| CI | GitHub Actions (`.github/workflows/`) |
| Hosting | Vercel (auto-deploy on push to `main`) |

---

## 3. Repo layout

```
odonto/
├── app/
│   ├── [locale]/                 # all UI lives here
│   │   ├── (auth)/login/         # login page
│   │   ├── appointments/         # calendar
│   │   ├── billing/              # invoices
│   │   ├── dashboard/
│   │   ├── insurers/             # /insurers, /insurers/new, /insurers/[id]
│   │   ├── patients/             # list, new, [id] (with tabs: general/medical/odontogram/treatments/attachments/invoices)
│   │   ├── reports/
│   │   ├── settings/
│   │   ├── treatments/
│   │   ├── error.tsx             # error boundary
│   │   ├── loading.tsx           # loading skeleton
│   │   ├── not-found.tsx         # 404
│   │   ├── layout.tsx            # locale layout (TopNav, AuthProvider, Toaster)
│   │   └── page.tsx              # /<locale> root → redirect to /dashboard
│   ├── api/                      # JSON endpoints
│   │   ├── appointments/         # GET ?start=ISO
│   │   ├── attachments/          # GET ?patient_id=
│   │   ├── auth/[...nextauth]/   # Auth.js handler
│   │   ├── insurers/             # GET (list/search), POST (create)
│   │   ├── invoices/             # GET
│   │   ├── patients/             # GET (list/search), POST (create JSON)
│   │   └── treatments/           # GET
│   ├── globals.css
│   └── layout.tsx                # root layout (no nav)
├── components/
│   ├── ui/                       # shadcn primitives: button, input, select, table, badge, ...
│   ├── nav/top-nav.tsx           # main nav with role-based link filtering
│   ├── auth/                     # login form, session provider
│   ├── appointments/             # week calendar, dialog with patient picker
│   ├── insurers/                 # InsurerPicker (combo) + form
│   ├── patients/                 # PatientForm (full)
│   ├── treatments/, billing/, reports/, attachments/  # per-tab components
│   └── ui/                       # toaster, empty-state
├── lib/
│   ├── auth.ts                   # Auth.js config (Credentials provider, JWT)
│   ├── db.ts                     # @libsql/client wrapper, query/queryOne/transaction
│   ├── i18n.ts                   # next-intl routing + getRequestConfig
│   ├── format.ts                 # formatMoney, formatDate (locale-aware)
│   ├── rbac.ts                   # requireUser, requireRole, can(role, action)
│   ├── schemas/                  # zod schemas (common, used by server actions)
│   └── utils.ts                  # cn(), uid(), nowIso()
├── server/actions/               # 'use server' actions per module
│   ├── patients.ts               # createPatient, updatePatient, deletePatient, listPatients, getPatient, createPatientJson, createPatientInline
│   ├── appointments.ts
│   ├── treatments.ts
│   ├── billing.ts
│   ├── insurers.ts
│   ├── attachments.ts
│   └── settings.ts
├── messages/
│   ├── es.json
│   └── en.json
├── migrations/                   # plain .sql files, applied in lexical order
│   ├── 0001_init.sql             # clinics, users, patients, appointments, teeth_chart, tooth_conditions, treatments, invoices, invoice_lines, payments, attachments, audit_log
│   └── 0002_insurers.sql        # insurers table, patients.insurer_id, patients.insurance_plan
├── scripts/
│   ├── migrate.mjs               # applies migrations, tracks in _migrations
│   ├── seed.mjs                  # 3 users + 10 patients + sample appointments/treatments/invoices
│   └── vercel-setup.mjs          # one-shot Vercel bootstrap (see §10)
├── e2e/                          # Playwright tests
│   ├── smoke.spec.ts             # login, dashboard, create patient, role gates
│   ├── repro-appointment.spec.ts # appointment dialog (searchable picker, inline new patient)
│   ├── repro-bugs.spec.ts        # gender picker, insurer onboarding clicks
│   ├── insurers.spec.ts          # insurer CRUD, duplicate-name rejection
│   └── insurer-onboarding.spec.ts
├── lib/i18n.ts                   # next-intl routing (single source of truth)
├── lib/navigation.ts
├── middleware.ts                 # next-intl middleware (locale resolution)
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── playwright.config.ts
├── vercel.json
├── .github/workflows/            # ci.yml, e2e.yml, deploy.yml
└── .env.example, .env.ci.example  # placeholder env files (no secrets)
```

---

## 4. Local development

```bash
# 1. Install
npm install

# 2. Configure (NO real secrets in this file — see §6)
cp .env.example .env.local
#   edit .env.local to set TURSO_URL=file:./local.db for a fully local DB,
#   or paste a real Turso URL+token for a cloud DB

# 3. Migrate + seed
npm run migrate
npm run seed            # optional: 3 users + 10 patients

# 4. Run
npm run dev
#   open http://localhost:3000  (redirects to /es or /en based on Accept-Language)
```

### Scripts cheat sheet

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (`.next/`) |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate` | Apply pending `.sql` files in `migrations/` |
| `npm run seed` | Insert demo data (3 users + 10 patients + sample appts) |
| `npm run test:e2e` | Playwright (requires the dev server or `next start` to be running on :3000) |
| `npm run test:e2e:install` | Install Playwright Chromium |

### Seeded users

| Email | Password | Role |
| --- | --- | --- |
| `admin@local` | `Admin123!` | admin |
| `doc@local` | `Doctor123!` | dentist |
| `front@local` | `Front123!` | receptionist |

The seed is idempotent for users (`INSERT OR IGNORE`) but will duplicate patients if re-run. Reset by deleting the local DB file.

---

## 5. Migrations

Plain `.sql` files in `migrations/`, applied in lexical order by `scripts/migrate.mjs`. The runner records applied filenames in a `_migrations` table.

```bash
# Add a new migration
$EDITOR migrations/0003_foo.sql

# Apply
npm run migrate
```

Idempotency: prefer `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` (additive changes only). For destructive changes, write a new migration that handles the case where the old schema is in use.

---

## 6. Secrets and local config

> **Rule: no real secrets are ever committed to the repo.**

- `.env`, `.env.local`, `.env*.local` — gitignored. Put real values in `.env.local` for development.
- `.env.example` and `.env.ci.example` — committed; contain only placeholders. Use them as the schema reference.
- **Production secrets** live in a gitignored directory at the repo root: `.local/`. See `.local/README.md` for the convention.

### Production secrets file: `.local/.env.production`

This file holds the real values for the `https://midentista.vercel.app` deployment:

```bash
TURSO_URL=libsql://<db>-<org>.turso.io
TURSO_TOKEN=<turso-platform-auth-token>
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://midentista.vercel.app
BLOB_READ_WRITE_TOKEN=<vercel-blob-rw-token>
```

This file:
- Lives on the deployer's local machine, never in git (`.local/` is in `.gitignore`).
- Is loaded with `set -a; source .local/.env.production; set +a` before running `scripts/vercel-setup.mjs` or any other script that needs prod credentials.
- Should be chmod 600.

### How to provision a fresh production deploy

1. Create a Turso DB: `turso db create odonto` (or via the web UI), capture the URL and a `turso db tokens create` token.
2. Run `npm run migrate` with `TURSO_URL` and `TURSO_TOKEN` exported to apply migrations.
3. Run `npm run seed` with `CLINIC_LOCALE=es` to create the seed data.
4. In the Vercel dashboard for `midentista` (or run `scripts/vercel-setup.mjs` which does the same thing programmatically), set the five env vars above on all three targets (production / preview / development).
5. Add `VERCEL_TOKEN` as a GitHub Actions repository secret so the Deploy workflow can run `vercel build --prod && vercel deploy --prebuilt --prod`.

Detailed step-by-step in §10.

---

## 7. RBAC

Three roles, enforced in `lib/rbac.ts`:

| Role | Patients | Appointments | Odontogram | Treatments | Billing | Insurers | Reports | Settings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| admin | R/W | R/W | R/W | R/W | R/W | R/W | R | R/W |
| dentist | R/W | R/W | R/W | R/W | R | R/W | R | – |
| receptionist | R/W | R/W | – | – | R/W | R/W | R | – |

Use `requireUser()` in server actions, `requireRole(['admin'])` for admin-only. The `can(role, action)` matrix in `lib/rbac.ts` is the single source of truth.

Nav links are filtered in `components/nav/top-nav.tsx` based on `user.role`.

---

## 8. Database schema

- `clinics` — single-row v1, but designed to allow multi-clinic (don't add `clinic_id` to other tables without thinking through the migration).
- `users` — Auth.js-compatible; `role` is checked at the app level.
- `patients` — has `insurer_id` (FK to `insurers`) and a denormalized `insurance_provider` string for legacy / free-text cases.
- `appointments` — `status` controls the calendar render. The conflict check in `createAppointment` ignores `cancelled`, `completed`, and `no_show` statuses (only active slots block).
- `teeth_chart` + `tooth_conditions` — per-tooth, per-surface conditions.
- `treatments` — `cost_cents` (integer, never float), `tax_kind` (standard / reduced / none).
- `invoices` + `invoice_lines` + `payments` — full balance tracking; `payments` sum vs `invoices.total_cents` determines paid status.
- `insurers` — `name UNIQUE`, plan/phone/email/notes.
- `attachments` — Vercel Blob references.
- `audit_log` — every write to a clinical entity appends a row (`entity`, `entity_id`, `action`, `meta` JSON, `at`).

`PRAGMA foreign_keys = ON` is set in the migration. **Never disable it.**

`createPatientInline` exists for non-redirecting flows (e.g. inline new-patient from appointment dialog). The regular `createPatient` redirects to `/patients/[id]` after success.

---

## 9. Common tasks for agents

### Add a new field to patients
1. Add a column to `migrations/000N_patients_<field>.sql`:
   ```sql
   ALTER TABLE patients ADD COLUMN <field> TEXT;
   ```
2. Update the zod schema in `server/actions/patients.ts` (the `PatientSchema`).
3. Update the `PatientRow` type in the same file.
4. Update the INSERT and UPDATE column lists in `createPatient`, `updatePatient`, `createPatientJson`, `createPatientInline`.
5. Add a field to `components/patients/patient-form.tsx` (use `<Label>` + `<Input>` + `name="..."`).
6. Add the label to `messages/es.json` and `messages/en.json` under `patients.*`.
7. Add an e2e test in `e2e/`.
8. `npm run typecheck && npm run build && npm run test:e2e`.
9. Commit + push. Vercel auto-deploys.

### Add a new module (e.g. "inventory")
1. Create `migrations/000N_inventory.sql` with tables + indexes.
2. Create `server/actions/inventory.ts` with zod schema, CRUD, audit log.
3. Create `app/[locale]/inventory/{page,new,[id]}.tsx` and `components/inventory/`.
4. Add `lib/schemas/inventory.ts` if you need shared types.
5. Add nav link in `components/nav/top-nav.tsx` with appropriate role filter.
6. Add RBAC entries in `lib/rbac.ts`.
7. Add i18n keys in both `messages/*.json`.
8. Add e2e tests.
9. Commit + push.

### Trigger a one-off migration against prod
```bash
set -a; source .local/.env.production; set +a
npm run migrate
```
The `postinstall` script also runs `migrate` against whatever env vars are set, so a fresh Vercel build (with `TURSO_URL` + `TURSO_TOKEN` set) will auto-apply pending migrations.

### Inspect a patient
Use the API: `curl -b cookies.txt https://midentista.vercel.app/api/patients?q=García` after authenticating via the UI (copy the session cookie from devtools).

### Run a single test
```bash
npx playwright test e2e/insurers.spec.ts
```

### Force a redeploy without code changes
Use the Vercel dashboard, or push an empty commit:
```bash
git commit --allow-empty -m "chore: trigger redeploy" && git push
```

---

## 10. Deploy

The `midentista` project is on Vercel, auto-deploys on push to `main`. The GitHub Actions Deploy workflow (`.github/workflows/deploy.yml`) also runs `vercel build --prod && vercel deploy --prebuilt --prod` using the `VERCEL_TOKEN` GitHub secret. Either path produces the same production URL.

**Live URL**: `https://midentista.vercel.app`

### Fresh production deploy (bootstrap)

The `scripts/vercel-setup.mjs` script automates the full bootstrap. Run it locally with these in your shell:

```bash
export VERCEL_TOKEN='<vercel-token>'            # https://vercel.com/account/tokens
export TURSO_URL='libsql://<db>-<org>.turso.io'
export TURSO_TOKEN='<turso-platform-token>'

# Optional: if you have a pre-existing Vercel project with a different name
export VERCEL_PROJECT='midentista'

node scripts/vercel-setup.mjs
```

The script will:
1. Look up (or create) the Vercel project named `VERCEL_PROJECT` (default: `midentista`).
2. Create a Vercel Blob store named `odonto` if one doesn't exist, and capture its `BLOB_READ_WRITE_TOKEN`.
3. Push `TURSO_URL`, `TURSO_TOKEN`, `AUTH_SECRET` (random 32-byte), `AUTH_URL`, `BLOB_READ_WRITE_TOKEN` to Vercel for all three env targets.
4. Run `npm run migrate` against the production Turso DB.
5. `git push origin main` to trigger the first deploy via the GitHub Action.

**Required GitHub secret**: `VERCEL_TOKEN` (a Vercel personal access token). Add it at https://github.com/JuanchoGithub/odonto/settings/secrets/actions.

### Post-deploy verification
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://midentista.vercel.app/login
# 200 = up
```

### Rollback
Vercel dashboard → midentista → Deployments → click a previous successful deployment → Promote to Production.

---

## 11. Known gotchas

1. **Nested forms** are invalid HTML and cause subtle bugs. If you need a form inside another (e.g. inline onboarding from a dialog), use a **Radix `Dialog` portal** with `onPointerDownOutside={(e) => e.preventDefault()}` to prevent the parent dialog from closing. Custom `<div>` portals with `z-index` tricks WILL fail — the surrounding Radix dialog's content wins the click.

2. **Server actions that redirect** from inside a Radix `Dialog` cause the dialog to close (because the page navigates). Use a non-redirecting variant (e.g. `createPatientInline`) for inline flows. See `server/actions/patients.ts` for the pattern.

3. **`newOpen` state on the InsurerPicker**: the NewInsurerDialog is rendered as a child of InsurerPicker, but portaled to `document.body`. When the parent PatientForm re-renders (on every keystroke), the InsurerPicker re-renders. The portal condition `newOpen ? createPortal(...) : null` is re-evaluated, but the dialog content stays mounted as long as `newOpen` is true. **Do not unmount the portal content** unless you intend to close the dialog.

4. **Migration order is lexical.** `0001_` runs before `0002_`. Use zero-padded numbers.

5. **`AUTH_SECRET` rotation** invalidates all sessions. Do not rotate in production without planning.

6. **The `BLOB_READ_WRITE_TOKEN` is sensitive.** Anyone with it can write/delete blobs on your account. Keep it in Vercel env + GitHub secrets + your local `.local/.env.production` only.

7. **Next-intl + `[locale]` segment**: the middleware rewrites `/` to `/<locale>/...`. Routes are file-based inside `app/[locale]/`. Don't put anything outside `[locale]/` except the auth API, `app/page.tsx` (root redirect), and `app/layout.tsx` (root html).

8. **Cash / float drift**: all money is stored in cents (integer) via `amountToCents` in `lib/utils.ts`. Never use floats for money.

9. **Vercel CLI + `vcp_` tokens**: `vcp_` personal access tokens work for the REST API but the Vercel CLI rejects them with "token is not valid" when used via `--token`. Use them only for REST API calls (which is what `scripts/vercel-setup.mjs` does). The Deploy workflow is auto-triggered by Vercel's GitHub App integration, not by the CLI.

10. **The build step on Vercel runs `postinstall`** which is `node scripts/migrate.mjs || true`. So fresh deploys auto-apply migrations as long as `TURSO_URL` + `TURSO_TOKEN` are set in the build env. If they're missing, the build still succeeds (because of `|| true`) and you must apply migrations manually.

---

## 12. Quick reference: "how do I…?"

- **Add a new patient field** → §9
- **Add a new module** → §9
- **Run a migration against prod** → §9
- **Debug a failing e2e test** → check `test-results/` for the screenshot and `error-context.md`. Re-run with `npx playwright test --reporter=list` for verbose output.
- **Reset the prod DB** → run `npm run seed` (it uses `INSERT OR IGNORE` for users, but will duplicate patients — for a real reset, drop the Turso DB and recreate).
- **See who is logged in** → `curl -b cookies.txt https://midentista.vercel.app/api/auth/session`
- **Inspect the audit log** → query `audit_log` table directly via the Turso CLI or a SQL client.
- **Change the default currency per locale** → `app/[locale]/page.tsx` (just kidding, it's per-clinic in Settings, not per-locale)
- **Disable a module for testing** → comment out its entry in `components/nav/top-nav.tsx` and the nav `links` array; do not remove the page (other links may depend on it).

---

Last updated: see `git log AGENTS.md` for the change history.
