import { test, expect } from '@playwright/test';
import { fillWhen } from './helpers';

const PATIENT = 'García';

test('patient detail shows full appointment history in the appointments tab', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });

  // Create two distinct appointments for the same patient.
  async function createAppt(hourOffset: number, minutes = 0) {
    const start = new Date();
    start.setDate(start.getDate() + 1 + hourOffset * 7);
    while (start.getDay() === 0 || start.getDay() === 6) {
      start.setDate(start.getDate() + 1);
    }
    start.setHours(hourOffset + 9, minutes, 0, 0);

    await page.goto('/appointments');
    await page
      .getByRole('button', { name: /nuevo turno|new appointment/i })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('appt-patient-input').fill(PATIENT);
    await dialog.getByTestId('appt-patient-option').first().click();
    await fillWhen(dialog, page, start, 15);
    await dialog
      .getByRole('button', { name: /^guardar$|^save$/i })
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  }

  await createAppt(0, 0);
  await createAppt(0, 15);

  // Open the patient's detail page directly via the patients search
  // (visible link only — the mobile card is hidden on desktop viewports).
  await page.goto(`/patients?q=${encodeURIComponent(PATIENT)}`);
  const href = await page
    .locator('a:visible')
    .filter({ hasText: PATIENT })
    .first()
    .getAttribute('href');
  await page.goto(href!);
  await page.waitForURL(/\/patients\/[a-f0-9-]{36}$/, { timeout: 15_000 });

  // Switch to the new appointments tab.
  // Visible rows only: mobile cards and the desktop table both render the
  // same testid, and earlier runs may have added more appointments.
  await page.getByRole('tab', { name: /^turnos$|^appointments$/i }).click();
  const rows = page.locator('[data-testid="patient-appt-row"]:visible');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  expect(await rows.count()).toBeGreaterThanOrEqual(2);

  // Each row is a clickable element that opens the existing edit dialog.
  await rows.first().click();
  const editDialog = page.getByRole('dialog');
  await expect(
    editDialog.getByRole('heading', { name: /editar turno|edit appointment/i }),
  ).toBeVisible();
  // The patient's name is visible inside the dialog header / link.
  await expect(editDialog.getByText(PATIENT)).toBeVisible();
  // Close without changes.
  await page.keyboard.press('Escape');
});
