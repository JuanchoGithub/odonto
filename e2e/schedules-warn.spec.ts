import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

async function clearAllWindows(page: Page) {
  await page.goto('/settings/schedules');
  const weekly = page.getByTestId('weekly-schedule');
  const trash = weekly.getByTestId('remove-window');
  // Windows are re-rendered (and removed mid-click) as each removal fires, so
  // tolerate click races and keep going until none remain.
  for (let guard = 0; guard < 30; guard++) {
    const n = await trash.count();
    if (n === 0) break;
    try {
      await trash.first().click({ timeout: 2_000 });
    } catch {
      // Node disappeared mid-click; loop and re-count.
    }
  }
  await weekly.getByRole('button', { name: /guardar|save/i }).click();
  // If a warn dialog appears (orphaned future appointments), accept the
  // default decisions (cancel them all) and save.
  const warn = page
    .getByRole('dialog')
    .filter({ has: page.getByText(/afecta|affect/i) });
  if (await warn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await warn.getByRole('button', { name: /^guardar$|^save$/i }).click();
    await expect(warn).not.toBeVisible({ timeout: 10_000 });
  }
}

test('editing a weekly schedule that orphans an appointment forces a decision', async ({
  page,
}) => {
  await login(page);

  // Reset: dentist with an empty schedule falls back to clinic business hours.
  await clearAllWindows(page);

  // Unique slot: spread across 52 Wednesdays starting 2031-05-07, quarter-hour
  // slots between 09:00 and 12:45 (inside the seeded 09:00–18:00 fallback).
  const stamp = Math.abs(Date.now());
  const weekOffset = stamp % 52;
  const quarter = Math.floor(stamp / 52) % 16;
  const base = new Date('2031-05-07T00:00:00'); // a Wednesday
  base.setDate(base.getDate() + weekOffset * 7);
  const slotStart = new Date(base);
  slotStart.setHours(9 + Math.floor(quarter / 4), (quarter % 4) * 15, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + 15 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  await page.goto('/appointments');
  await page
    .getByRole('button', { name: /nuevo turno|new appointment/i })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: /buscar|search/i })
    .first()
    .click();
  await dialog
    .getByPlaceholder(/buscar|search/i)
    .first()
    .fill('García');
  await dialog
    .locator('button')
    .filter({ hasText: /García/ })
    .first()
    .click();
  await dialog.locator('input[name="starts_at"]').fill(fmt(slotStart));
  await dialog.locator('input[name="ends_at"]').fill(fmt(slotEnd));
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  // Adding a single Monday window flips the dentist onto an explicit schedule
  // that doesn't cover Wednesday, orphaning the appointment just created.
  await page.goto('/settings/schedules');
  const weekly = page.getByTestId('weekly-schedule');
  await weekly
    .getByTestId('weekly-day-1')
    .getByRole('button', { name: /agregar horario|add hours/i })
    .click();
  await weekly.getByRole('button', { name: /guardar|save/i }).click();

  const warn = page
    .getByRole('dialog')
    .filter({ has: page.getByText(/afecta|affect/i) });
  await expect(warn).toBeVisible({ timeout: 10_000 });
  await expect(warn.getByText(/García/i).first()).toBeVisible();

  // Confirm with default decisions (cancels the orphan).
  await warn.getByRole('button', { name: /^guardar$|^save$/i }).click();
  await expect(warn).not.toBeVisible({ timeout: 10_000 });

  // Leave the schedule clean for the next run.
  await clearAllWindows(page);
});
