import { expect, type Page, type Locator } from '@playwright/test';

/** Wait until the streamed page tree has fully settled (Suspense swap done). */
export async function settleCalendar(page: Page) {
  await expect(page.getByTestId('view-calendar')).toHaveCount(1, {
    timeout: 15_000,
  });
}

export const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DDTHH:mm */
export const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export async function login(
  page: Page,
  email = 'doc@local',
  password = 'Doctor123!',
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/contraseñ|password/i).fill(password);
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

/** Populate the appointment dialog's date + start-time + duration fields. */
export async function fillWhen(
  dialog: Locator,
  page: Page,
  start: Date,
  durationMin: number,
) {
  await dialog
    .locator('input[name="appt_date"]')
    .fill(
      `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    );
  const hm = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  await dialog.getByTestId('appt-start-time').click();
  await page
    .getByRole('option', { name: new RegExp(`^${hm}$`) })
    .click();
  await dialog.getByTestId('appt-duration').click();
  await page
    .getByRole('option', { name: new RegExp(`^${durationMin} min$`) })
    .click();
}

/** Pick the patient matching `name` in the dialog's patient combobox. */
export async function pickPatient(dialog: Locator, name = 'García') {
  await dialog
    .getByRole('button', { name: /buscar|search/i })
    .first()
    .click();
  await dialog
    .getByPlaceholder(/buscar|search/i)
    .first()
    .fill(name);
  await dialog
    .locator('button')
    .filter({ hasText: new RegExp(name, 'i') })
    .first()
    .click();
}
