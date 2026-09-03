import { test, expect, type Page } from '@playwright/test';

const ADMIN = { email: 'admin@local', password: 'Admin123!' };
const DENTIST = { email: 'doc@local', password: 'Doctor123!' };

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel(/contraseñ|password/i).fill(who.password);
  await page
    .getByRole('button', { name: /ingresar|sign in/i })
    .click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

test('full smoke: login → dashboard → create patient → view detail', async ({
  page,
}) => {
  await login(page, ADMIN);

  // Dashboard renders KPIs (some text from the seed)
  await expect(page.getByRole('heading', { name: /panel|dashboard/i })).toBeVisible();
  await expect(page.getByText(/pacientes activos|active patients/i)).toBeVisible();

  // Navigate to patients and create one
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: /pacientes|patients/i })).toBeVisible();
  await page.getByRole('link', { name: /nuevo paciente|new patient/i }).click();
  await page.waitForURL(/\/patients\/new$/);

  const stamp = Date.now();
  const lastName = `Smoke${stamp}`;
  const firstName = 'Test';

  await page.getByLabel(/nombre|first name/i).fill(firstName);
  await page.getByLabel(/apellido|last name/i).fill(lastName);
  await page.getByLabel(/documento|id document/i).fill(String(stamp));
  await page.getByRole('button', { name: /guardar|save/i }).click();

  // After save, redirects to /patients/{id}
  await page.waitForURL(/\/patients\/[a-f0-9-]{36}$/, { timeout: 15_000 });

  // Back to list — newly created patient should be searchable
  await page.goto(`/patients?q=${lastName}`);
  await expect(page.getByText(lastName).first()).toBeVisible();
});

test('guards: unauthed user redirected from /dashboard to /login', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await page.waitForURL(/\/(es|en)\/login/, { timeout: 15_000 });
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('role gate: dentist cannot reach /settings', async ({ page }) => {
  await login(page, DENTIST);

  // Settings link should not be visible in the nav
  await expect(page.getByRole('link', { name: /configuraci[oó]n|settings/i })).toHaveCount(0);

  // Direct navigation should be blocked
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  // Either redirected to dashboard or another non-/settings page
  expect(page.url()).not.toMatch(/\/settings$/);
});
