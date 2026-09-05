# AGENTS.md

Onboarding for AI agents and human contributors working on **Odonto**, a Next.js 15 dental clinic management app deployed at `https://midentista.vercel.app`.

This is the source of truth. README.md is a one-page pointer; everything operational lives here.

> **Deploy path (read this first).** Production deploys use a **Vercel Deploy Hook** — a per-project URL whose unique token is the URL itself. No CLI, no `vercel` token.
> - **CI** (`.github/workflows/deploy.yml`): `POST $DEPLOY_HOOK_URL` on push to `main`, then polls `/es/login` until 200.
> - **Local** (`scripts/deploy.mjs`): `node scripts/deploy.mjs --wait`.
> - The hook URL lives in `DEPLOY_HOOK_URL` (GitHub repo secret) and is mirrored in `.local/.env.production`. The old `VERCEL_TOKEN` secret is unused and can be deleted. Full details in §11; the `vcp_` reason is in §12.9.

---

## 1. What is Odonto?

Bilingual (es / en) clinic management app. Modules:
- **Patients** — CRUD + insurance link + per-patient odontogram + treatments + invoices
- **Appointments** — week calendar on a 15-minute slot grid; blocks are sized by duration; drag to move (cross-day too) and drag the bottom edge to extend; drag on empty space to select a range and create with that duration; overlapping appointments are allowed (rendered side-by-side); each dentist has a color (random on creation, editable in Settings → Users); doctor filter for receptionists; calendar/list view toggle; non-working hours are shaded gray (per-dentist when filtered, clinic business hours on the "all" view); the dialog takes `_date` + 15-min start-time select + duration; each appointment records `created_by` + `created_via` (`manual` = New button, `click` = slot click, `drag` = drag-select, `shared` = patient self-booked via turn picker); the list view additionally shows pending (shared, unbooked) turn-picker links
- **Insurers** (obras sociales) — master table, searchable, with inline onboarding
- **Treatments** — per-patient pipeline + cost
- **Billing** — invoices (two-rate tax) + payments + jsPDF export
- **Reports** — recharts dashboards (revenue, top treatments, no-show, by-dentist)
- **Settings** — clinic profile (currency, locale, tax rates) + user management
- **Attachments** — Vercel Blob storage (X-rays, photos, consent)
- **Dashboard** — KPIs
- **Turn picker** — staff generate a signed, single-use, self-expiring link (`/pick-turn/[token]`) so patients book their own slot; single-use (consumed on booking), idle-revoked after 5 days (configurable via `TURN_PICKER_IDLE_MS`), absolute expiry default 14 days

**Calendar grid** — `components/appointments/time-grid.tsx` is the source of truth for the time-axis layout: `SLOT_MINUTES` (15), `SLOT_PX` (14px per slot), and the 8:00–19:00 display window. Blocks are absolutely positioned (`top`/`height` from times), share a column equally when overlapping, and drag/resize + drag-to-create are plain pointer events (no dnd library) that round to 15-min slots. Click (not drag) opens the edit dialog — a `suppressClick` ref swallows the click that follows a completed drag. Non-working areas are shaded from `getWeekWindows` in `lib/availability.ts` (respects dentist schedules/exceptions, or clinic business hours when the filter is "all"). e2e testids that must be preserved: `appt-badge` (blocks), `day-col-N` (day columns), `view-calendar`/`view-list` (toggle), `dentist-filter`, `off-hours` (shading), `appt-list-row` / `pending-link-row` (list view), `appt_date` / `appt-start-time` / `appt-duration` (dialog fields).
- **Soft delete (patients)** — `patients.deleted_at` timestamp; delete asks for confirmation, sets the flag, hidden from lists, undoable via toast action ("Undo") or the restore button on the deleted patient's page
- **Schedules** — per-dentist weekly hours + day-level exceptions (`time_off` / `custom_hours`), clinic business hours as fallback when a dentist has no schedule rows, clinic holidays; editing a schedule that would leave existing appointments outside the new hours requires a per-appointment decision (reschedule / cancel / keep-as-exception); slot availability engine in `lib/availability.ts` is the single source of truth (also consulted by `createAppointment`)

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
| Hosting | Vercel — **deploys via a Deploy Hook URL, not the CLI** (see §11) |

---

## 3. Deploy in 30 seconds

For the live production URL `https://midentista.vercel.app`:

```bash
# Local
set -a; source .local/.env.production; set +a
node scripts/deploy.mjs --wait
```

```bash
# CI
git push origin main   # .github/workflows/deploy.yml does the same thing
```

**Required secret / env** (one URL, two places):

- **GitHub repo secret** `DEPLOY_HOOK_URL` → https://github.com/JuanchoGithub/odonto/settings/secrets/actions
- **Local** `DEPLOY_HOOK_URL` line in `/Users/jayjay/gitrepos/odonto/.local/.env.production`

How to create the hook: Vercel → `midentista` project → **Settings → Git → Deploy Hooks → Create Hook** (name it, branch `main`). Copy the URL. **Treat the URL like a password.**

The `VERCEL_TOKEN` GitHub secret is no longer used by any workflow — safe to delete from https://github.com/JuanchoGithub/odonto/settings/secrets/actions.

See §11 for the full details (rollback, bootstrap, troubleshooting) and §12.9 for why the Vercel CLI is deliberately avoided.

---

## 4. Repo layout

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
│   └── vercel-setup.mjs          # one-shot Vercel bootstrap (see §11)
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

## 5. Local development

```bash
# 1. Install
npm install

# 2. Configure (NO real secrets in this file — see §7)
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

## 6. Migrations

Plain `.sql` files in `migrations/`, applied in lexical order by `scripts/migrate.mjs`. The runner records applied filenames in a `_migrations` table.

```bash
# Add a new migration
$EDITOR migrations/0003_foo.sql

# Apply
npm run migrate
```

Idempotency: prefer `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` (additive changes only). For destructive changes, write a new migration that handles the case where the old schema is in use.

---

## 7. Secrets and local config

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

Detailed step-by-step in §11.

---

## 8. RBAC

Three roles, enforced in `lib/rbac.ts`:

| Role | Patients | Appointments | Odontogram | Treatments | Billing | Insurers | Reports | Settings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| admin | R/W | R/W | R/W | R/W | R/W | R/W | R | R/W |
| dentist | R/W | R/W | R/W | R/W | R | R/W | R | – |
| receptionist | R/W | R/W | – | – | R/W | R/W | R | – |

Use `requireUser()` in server actions, `requireRole(['admin'])` for admin-only. The `can(role, action)` matrix in `lib/rbac.ts` is the single source of truth.

Nav links are filtered in `components/nav/top-nav.tsx` based on `user.role`.

---

## 9. Database schema

- `clinics` — single-row v1, but designed to allow multi-clinic (don't add `clinic_id` to other tables without thinking through the migration).
- `users` — Auth.js-compatible; `role` is checked at the app level.
- `patients` — has `insurer_id` (FK to `insurers`) and a denormalized `insurance_provider` string for legacy / free-text cases.
- `appointments` — `status` controls the calendar render. Overlapping appointments are **allowed** (same or different dentists); the calendar renders them side-by-side. Only the working-hours check (`isWithinWorkingHours`) can reject a write.
- `users.color` — per-dentist calendar color (hex). NULL → deterministic palette fallback from `lib/colors.ts`. Set randomly on dentist creation, editable by admin in Settings → Users.
- `teeth_chart` + `tooth_conditions` — per-tooth, per-surface conditions.
- `treatments` — `cost_cents` (integer, never float), `tax_kind` (standard / reduced / none).
- `invoices` + `invoice_lines` + `payments` — full balance tracking; `payments` sum vs `invoices.total_cents` determines paid status.
- `insurers` — `name UNIQUE`, plan/phone/email/notes.
- `attachments` — Vercel Blob references.
- `audit_log` — every write to a clinical entity appends a row (`entity`, `entity_id`, `action`, `meta` JSON, `at`).

`PRAGMA foreign_keys = ON` is set in the migration. **Never disable it.**

`createPatientInline` exists for non-redirecting flows (e.g. inline new-patient from appointment dialog). The regular `createPatient` redirects to `/patients/[id]` after success.

---

## 10. Common tasks for agents

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

### Trigger a production deploy
```bash
set -a; source .local/.env.production; set +a
node scripts/deploy.mjs --wait    # polls /es/login until 200
```
Or push to `main` — `.github/workflows/deploy.yml` calls the same hook and waits for the prod URL to return 200.
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

## 11. Deploy

The `midentista` project is on Vercel. Deployments are triggered by **Vercel Deploy Hooks** — a unique URL that takes a `POST` and rebuilds the project. No CLI, no auth header, the URL itself is the credential.

- **GitHub Actions** (`.github/workflows/deploy.yml`) fires on every push to `main`, calls the hook, then polls `/es/login` until 200.
- **Local** (`scripts/deploy.mjs`) does the same thing from your terminal with `node scripts/deploy.mjs --wait`.

**Required GitHub secret**: `DEPLOY_HOOK_URL` — a deploy-hook URL created at Vercel → `midentista` → Settings → Git → Deploy Hooks. Store it at https://github.com/JuanchoGithub/odonto/settings/secrets/actions. Mirror it in `.local/.env.production` so `scripts/deploy.mjs` works locally.

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
5. Create a deploy hook (or reuse `DEPLOY_HOOK_URL` from env) so future pushes auto-deploy.

### Post-deploy verification
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://midentista.vercel.app/es/login
# 200 = up
```

### Rollback
Vercel dashboard → midentista → Deployments → click a previous successful deployment → Promote to Production.

### Why not the Vercel CLI?
The current `VERCEL_TOKEN` GitHub secret is a `vcp_` personal access token, which the Vercel CLI rejects with "token is not valid" (the CLI expects the older 24-char format). Deploy hooks sidestep this entirely: the URL is the credential, no CLI binary, no token validation.

---

## 12. Known gotchas

1. **Nested forms** are invalid HTML and cause subtle bugs. If you need a form inside another (e.g. inline onboarding from a dialog), use a **Radix `Dialog` portal** with `onPointerDownOutside={(e) => e.preventDefault()}` to prevent the parent dialog from closing. Custom `<div>` portals with `z-index` tricks WILL fail — the surrounding Radix dialog's content wins the click.

2. **Server actions that redirect** from inside a Radix `Dialog` cause the dialog to close (because the page navigates). Use a non-redirecting variant (e.g. `createPatientInline`) for inline flows. See `server/actions/patients.ts` for the pattern.

3. **`newOpen` state on the InsurerPicker**: the NewInsurerDialog is rendered as a child of InsurerPicker, but portaled to `document.body`. When the parent PatientForm re-renders (on every keystroke), the InsurerPicker re-renders. The portal condition `newOpen ? createPortal(...) : null` is re-evaluated, but the dialog content stays mounted as long as `newOpen` is true. **Do not unmount the portal content** unless you intend to close the dialog.

4. **Migration order is lexical.** `0001_` runs before `0002_`. Use zero-padded numbers.

5. **`AUTH_SECRET` rotation** invalidates all sessions. Do not rotate in production without planning.

6. **The `BLOB_READ_WRITE_TOKEN` is sensitive.** Anyone with it can write/delete blobs on your account. Keep it in Vercel env + GitHub secrets + your local `.local/.env.production` only.

7. **Next-intl + `[locale]` segment**: the middleware rewrites `/` to `/<locale>/...`. Routes are file-based inside `app/[locale]/`. Don't put anything outside `[locale]/` except the auth API, `app/page.tsx` (root redirect), and `app/layout.tsx` (root html).

8. **Cash / float drift**: all money is stored in cents (integer) via `amountToCents` in `lib/utils.ts`. Never use floats for money.

9. **Datetimes are tz-aware ISO, never naive local strings.** Browser-side code (appointment dialog, drag/resize) must send `.toISOString()` values; the server interprets them against `clinics.timezone` via `lib/availability.ts`. Naive `YYYY-MM-DDTHH:mm` strings are parsed in the server TZ (UTC on Vercel), which corrupts wall-clock math for clinics in other zones.

10. **Mass "outside working hours" rejections → check `clinics.timezone` first.** If staff report that every create/move fails, verify the clinic timezone in Settings (it applies to every availability check). A common trap: saving the clinic form while the wrong timezone is shown silently persists it. Also verify the dentist's own weekly schedule (Settings → Schedules) — a narrow dentist schedule overrides clinic business hours and legitimately blocks writes outside it.

9. **Vercel CLI + `vcp_` tokens**: `vcp_` personal access tokens work for the REST API but the Vercel CLI rejects them with "token is not valid" when used via `--token`. Use them only for REST API calls (which is what `scripts/vercel-setup.mjs` does). **Production deploys are triggered by a Vercel Deploy Hook** (created in `midentista → Settings → Git → Deploy Hooks`) — `POST` to that URL from `.github/workflows/deploy.yml` and from `scripts/deploy.mjs`. The URL itself is the credential; store it in `DEPLOY_HOOK_URL` (GitHub repo secret) and `.local/.env.production` (local). No CLI, no token.

10. **The build step on Vercel runs `postinstall`** which is `node scripts/migrate.mjs || true`. So fresh deploys auto-apply migrations as long as `TURSO_URL` + `TURSO_TOKEN` are set in the build env. If they're missing, the build still succeeds (because of `|| true`) and you must apply migrations manually.

---

## 13. Mobile design guidelines (iPhone-first)

The app is built **iPhone-first** (390×844 default), then progressively enhanced for larger screens. Mobile is not "the desktop site scaled down" — it has its own components, its own layout, and its own gestures. These rules are mandatory; do not regress them.

### 13.1 The contract

- **Default is mobile.** Build the layout for 390px first. Use `md:` (≥768px) and `lg:` (≥1024px) prefixes to enhance, never the other way around. If a feature only works on desktop, it is a bug.
- **iPhone viewport is set in `app/layout.tsx`.** `width=device-width, initialScale=1, viewportFit=cover`, `themeColor: '#ffffff'`. Do not remove `viewportFit=cover`; the notch will clip content.
- **All money lives in cents** (integer) via `amountToCents` in `lib/utils.ts`. Never use floats. See §12.8.
- **All datetimes are tz-aware ISO.** Browser builds `.toISOString()`; the server interprets against `clinics.timezone` via `lib/availability.ts`. Naive `YYYY-MM-DDTHH:mm` strings parsed in server TZ corrupt wall-clock math. See §12.9.

### 13.2 Tokens (already configured)

- `tailwind.config.ts` — `container.padding` is responsive: `1rem` base, `1.5rem sm:`, `2rem lg:`. Use the `container` class. Do not reintroduce `padding: 2rem` (it cost us 64px of horizontal on iPhone).
- `app/globals.css` — `min-h: 100dvh` (not `100vh`; iOS Safari's URL bar inflates `vh`), `overscroll-behavior-y: none`, `touch-action: manipulation` on buttons, `-webkit-tap-highlight-color: transparent`, plus `pt-safe / pb-safe / pl-safe / pr-safe` utilities backed by `env(safe-area-inset-*)`.
- `components/ui/button.tsx` — every size variant includes `min-h-[44px]` and `touch-manipulation`. The iOS HIG minimum touch target is 44×44.
- `components/ui/input.tsx` and `select.tsx` — base text size is `text-base` (16px) so iOS does not auto-zoom on focus. Inputs become `text-sm` only at `sm:` and up.
- `components/ui/table.tsx` — `TableHead` / `TableCell` use mobile-lean cells (`px-3 py-3`) and bump to `sm:p-4` on desktop. List pages still set a `min-w-[...]` on the inner table so it scrolls horizontally on the few desktop pages that ship a table (preserves the existing UX).

### 13.3 Shell

- `app/[locale]/layout.tsx` mounts both navs: `<TopNav>` (`hidden lg:flex`, `pt-safe`) and `<BottomNav>` (`md:hidden`, 5 tabs, safe-area padded). The `<main>` has `pb-20 md:pb-0` to clear the bottom nav. Do not remove either.
- `components/nav/bottom-nav.tsx` — Dashboard / Appointments / (+Create) / Patients / More. The center button is `/patients/new`. The More sheet is role-gated (see `PRIMARY` / `MORE` arrays). When adding a new top-level section, update both `PRIMARY` (if it's a primary destination) and `MORE` (if it's secondary). Use the existing i18n keys under `nav.*`.
- `components/nav/top-nav.tsx` — desktop only (`hidden lg:flex`). Has a hamburger that opens a mobile accordion with all role-allowed links. Preserve `aria-label="Primary"`, `aria-current="page"`, and `aria-expanded` on the toggle.

### 13.4 Lists, tables, cards

- **Every list page must have a mobile-card view AND a desktop-table view** in the same component, switched by `md:hidden` / `hidden md:block`. The list pages that follow this pattern: `app/[locale]/patients/page.tsx`, `app/[locale]/billing/page.tsx`, `app/[locale]/insurers/page.tsx`, `app/[locale]/settings/page.tsx`, `components/appointments/appointment-list.tsx`, `components/treatments/patient-treatments.tsx`, `components/billing/patient-invoices.tsx`, `components/attachments/patient-attachments.tsx`.
- Mobile cards are `min-h-[64px]`, `rounded-xl`, `border`, `active:bg-accent`. Whole row is a `<Link>` or `<button>` (one tap target). Phone numbers are `tel:` links inside the card with `onClick={(e) => e.stopPropagation()}` so tapping the phone does not open the card.
- Each card carries a `data-testid` (`patient-list-row`, `invoice-list-row`, `insurer-list-row`, `user-list-row`, `treatment-list-row`, `pending-link-row`, `appt-list-row`) for e2e stability.

### 13.5 Dialogs → bottom sheets

- Every Radix `Dialog` is rendered as a **bottom sheet on mobile** and a **centered modal on `sm:` and up**. The class is:
  ```
  inset-x-0 bottom-0 w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe
  max-h-[92dvh] overflow-y-auto
  sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2
  sm:-translate-x-1/2 sm:-translate-y-1/2
  sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]
  ```
  Plus a 40×4px drag-handle dot at the top on mobile (`<div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />`).
- Files that already follow this pattern: `components/appointments/appointment-dialog.tsx`, `components/appointments/attend-sheet.tsx`, `components/appointments/appointment-list.tsx` (the share dialog), `components/turn-picker/generate-link-dialog.tsx`, `components/odontogram/tooth-edit-sheet.tsx`, `components/schedules/schedules-client.tsx` (orphan decision), `components/patients/delete-patient-button.tsx`, `components/insurers/insurer-picker.tsx` (NewInsurerDialog), `components/billing/patient-invoices.tsx` (new-invoice), `components/treatments/patient-treatments.tsx` (new-treatment).
- **Do not center a Radix Dialog on mobile.** Centered dialogs are the #1 cause of "my screen is unreadable" reports.

### 13.6 Appointments specifically

- `components/appointments/time-grid.tsx` — the 7-day grid is `minmax(130px, 1fr) × 7 + 52px = 962px min-width`, so it forces horizontal scroll on phones. **Drag / resize / select is gated by `useCoarsePointer()`** (`window.matchMedia('(pointer: coarse)')`). On touch: no `setPointerCapture`, no drag-select, no resize — `pointerdown` on a block or column is a tap. Resize handle is 24px tall (was 6px) with a 40px-wide grab indicator.
- `components/appointments/week-calendar.tsx` — `view` defaults to `'list'` when `(max-width: 767px).matches`, `'calendar'` otherwise. The tabs preserve `view-calendar` / `view-list` testids.
- `components/appointments/appointment-list.tsx` — mobile = `<ul>` of cards (`min-h-[64px]`, dentist color bar, name, time, status, `tel:`). For `scheduled | arrived | in_chair` rows, the card has an **Attend** button (`data-testid="appt-attend"`, `min-h-[48px]`) that opens `AttendSheet`.
- `components/appointments/attend-sheet.tsx` — the new "Attend" mode. Patient header, `tel:` call link, status stepper (`scheduled → arrived → in_chair → completed`) one-tap advance, plus quick links to `/patients/[id]?tab=odontogram` and `?tab=treatments`. New entries: `appointments.attend`, `appointments.attendTitle`, `appointments.advanceTo`, `appointments.openChart`, `appointments.call`.
- The patient page must accept `?tab=` and **default to that tab** when present (`app/[locale]/patients/[id]/page.tsx`). The full whitelist is `TABS` in that file — extend it when adding a new tab.

### 13.7 Odontogram — the symbol rule (non-negotiable)

The dental-charting standard is enforced in code. **Every** surface that shows a condition symbol (desktop chart, mobile list, legend chip, edit sheet) must use the **same SVG**. Do not re-implement with unicode glyphs, emojis, or different colors — clinical findings are encoded by the symbol, and a ✕ on mobile and a ring on desktop are two different clinical findings.

- **Single source of truth**: `components/odontogram/tooth-svg.tsx` exports `WholeSymbol` (the in-chart overlay) and `WholeConditionSymbol` (a standalone SVG for use outside the chart). Use these.
- **Standard mappings** (must not change without a clinical sign-off):
  - `missing` — red X across the whole tooth (`#dc2626`)
  - `crown` — red ring around the tooth (`#dc2626`)
  - `to_extract` — two blue parallel slashes (`#2563eb`)
  - `perno` — red filled disc with white "P"
  - `sealant` — red bar across the top of the tooth (`#dc2626`)
  - `conduct_todo` — blue "TC" badge at the top (`#2563eb`)
  - `conduct_done` — red "TC" badge at the top (`#dc2626`)
  - `clean` — green check inside the tooth outline (`#059669`)
- `WHOLE_CONDITIONS` (in `tooth-svg.tsx`, `tooth-list-picker.tsx`, and `condition-chip.tsx`) is the set of `missing | crown | to_extract | perno | sealant | conduct_todo | conduct_done | clean`. All three files must agree — if you add a new whole-tooth condition, update all three.
- The mobile `<ToothListPicker>` (in `tooth-list-picker.tsx`) renders a real `<ToothSvg>` at 48×48px, **not** a colored circle with a glyph. This is what shows per-surface conditions (caries / restoration) on phones; without the SVG, those were invisible.
- `components/odontogram/odontogram.tsx` — the "advancedPicker" card is **`hidden md:block`** to avoid duplicating the edit path on mobile. Do not unhide it on mobile.
- Touch targets: tooth buttons ≥ `min-h-[56px] min-w-[56px]`, condition chips `min-h-[44px]`, surface buttons in the edit sheet `min-h-[44px]`, condition badges in the legend follow the same rule.

### 13.8 Forms

- Inputs are 16px on mobile (no iOS auto-zoom) → `text-base sm:text-sm`. The base `Input` and `Select` components already do this — use them.
- `grid-cols-3` collapses to `grid-cols-1` on mobile when stacking matters (see `appointment-dialog.tsx` `appt_date` / `appt_start_time` / `appt_duration`).
- Native `<input type="file">` is unsightly and overflows on mobile. Wrap it in a `<label>` with `cursor-pointer` and a `text-muted-foreground` placeholder, like `components/attachments/patient-attachments.tsx` does.

### 13.9 Toasts

- `components/ui/toaster.tsx` positions the viewport **above the bottom nav** on mobile (`bottom-20`) and at the top-right on `sm:` and up. The close button is always visible on touch (`sm:opacity-0 sm:group-hover:opacity-100`).

### 13.10 What NOT to do

- Do not call `vercel deploy` from CI or locally — the Vercel CLI rejects `vcp_` tokens. Use the deploy hook (§3, §11). The Vercel GitHub App integration is not configured for this project.
- Do not add `w-full` to a centered dialog — on phones it produces 0px gutter.
- Do not use `autoFocus` on an input inside a dialog. iOS pops the keyboard, pushes the layout, and obscures the form. `appointment-dialog.tsx`'s `PatientPicker` removed `autoFocus` for exactly this reason.
- Do not put `overflow-x-auto` on the page-level container. It hides that the inner content is wider than the viewport. Wrap tables, not pages.
- Do not introduce new dialogs without the bottom-sheet class in §13.5. Copy from an existing dialog.
- Do not change `viewport` in `app/layout.tsx` to remove `viewportFit=cover`. The iPhone notch will clip the sticky top nav.
- Do not use `vh` (use `dvh` in `globals.css`). Safari's URL bar inflates `vh` and your fixed-position elements jump.
- Do not re-implement the dental symbols with unicode, emojis, or different colors. Use `WholeConditionSymbol`.

### 13.11 When adding a new top-level page

1. Use the responsive container (`container py-4 md:py-8`) and the responsive heading (`text-2xl md:text-3xl`).
2. If it's a list, add a mobile-card view + a desktop-table view (see §13.4) and a matching `data-testid` on each card row.
3. If it has forms, all dialogs must use the bottom-sheet class (§13.5).
4. If it should appear in the bottom nav, add a `Link` entry to `PRIMARY` in `components/nav/bottom-nav.tsx`. If it's secondary, add to `MORE` instead.
5. Add i18n keys to both `messages/es.json` and `messages/en.json` in the `nav.*` namespace.
6. Run `npm run typecheck && npm run lint && npm run build` and verify in DevTools with an iPhone profile before committing.

### 13.12 When adding a new medical / clinical symbol

If the feature is clinical (ICD-10, dental, dermatology, etc.) and uses standardized glyphs:

1. The glyph definition lives in **one** file (the component that owns the domain — e.g. `tooth-svg.tsx`).
2. Re-export a standalone variant (like `WholeConditionSymbol`) so other surfaces (lists, chips, dialogs, exports) can render at any size.
3. Add the new condition to every `WHOLE_CONDITIONS`-like set across files that consume it.
4. Never invent a unicode / emoji / different color for the same clinical meaning.

---

## 14. Quick reference: "how do I…?"

- **Add a new patient field** → §10
- **Add a new module** → §10
- **Run a migration against prod** → §10
- **Debug a failing e2e test** → check `test-results/` for the screenshot and `error-context.md`. Re-run with `npx playwright test --reporter=list` for verbose output.
- **Reset the prod DB** → run `npm run seed` (it uses `INSERT OR IGNORE` for users, but will duplicate patients — for a real reset, drop the Turso DB and recreate).
- **See who is logged in** → `curl -b cookies.txt https://midentista.vercel.app/api/auth/session`
- **Inspect the audit log** → query `audit_log` table directly via the Turso CLI or a SQL client.
- **Change the default currency per locale** → `app/[locale]/page.tsx` (just kidding, it's per-clinic in Settings, not per-locale)
- **Disable a module for testing** → comment out its entry in `components/nav/top-nav.tsx` and the nav `links` array; do not remove the page (other links may depend on it).

---

Last updated: see `git log AGENTS.md` for the change history.
