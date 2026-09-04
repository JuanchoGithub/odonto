# Odonto

A web-based dental clinic management app deployed at **https://midentista.vercel.app**.

> **All operational details, onboarding instructions, secrets management, deploy process, and known gotchas live in [AGENTS.md](./AGENTS.md).** This README is a one-page pointer.

Bilingual (es / en), per-clinic currency, role-based access (admin / dentist / receptionist).

**Modules**: Patients · Appointments · Insurers (obras sociales) · Treatments · Billing · Reports · Settings · Attachments · Dashboard

**Stack**: Next.js 15 · TypeScript · Tailwind · shadcn/ui · next-intl · Auth.js v5 · Turso/LibSQL · Vercel Blob · jsPDF · Recharts · Playwright

## Quick start

```bash
npm install
cp .env.example .env.local
npm run migrate
npm run seed          # optional
npm run dev
```

Open <http://localhost:3000>. Seeded users:

| Email | Password | Role |
| --- | --- | --- |
| `admin@local` | `Admin123!` | admin |
| `doc@local` | `Doctor123!` | dentist |
| `front@local` | `Front123!` | receptionist |

## Deploy

Every push to `main` auto-deploys to Vercel. Secrets are managed via `.local/.env.production` (gitignored). See [AGENTS.md → Deploy](./AGENTS.md#10-deploy) for the full procedure.

## License

Private — all rights reserved.
