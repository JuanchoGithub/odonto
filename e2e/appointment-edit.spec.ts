import { test, expect } from '@playwright/test';
import { fillWhen } from './helpers';

test('clicking an appointment opens the edit dialog (not the patient page)', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });

  // Create an appointment on the next weekday at a stamped quarter-hour slot.
  const stamp = Math.abs(Date.now());
  const quarter = stamp % 16; // 09:00–12:45 quarter-hour slots
  const start = new Date();
  start.setDate(start.getDate() + 1);
  while (start.getDay() === 0 || start.getDay() === 6) {
    start.setDate(start.getDate() + 1);
  }
  start.setHours(9 + Math.floor(quarter / 4), (quarter % 4) * 15, 0, 0);
  const startHm = `${String(start.getHours()).padStart(2, '0')}:${String(
    start.getMinutes(),
  ).padStart(2, '0')}`;


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
  await fillWhen(dialog, page, start, 15);
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  // Click the badge that matches the appointment we just created. If the
  // appointment is in the next week, advance the calendar.
  let apptBtn = page
    .getByTestId('appt-badge')
    .filter({ hasText: startHm })
    .first();
  if (!(await apptBtn.isVisible().catch(() => false))) {
    // Advance one week and try again
    await page.getByTestId('week-next').click();
    apptBtn = page
      .getByTestId('appt-badge')
      .filter({ hasText: startHm })
      .first();
  }
  await expect(apptBtn).toBeVisible({ timeout: 10_000 });
  await apptBtn.click();

  const editDialog = page.getByRole('dialog');
  await expect(editDialog).toBeVisible();
  await expect(
    editDialog.getByRole('heading', { name: /editar turno|edit appointment/i }),
  ).toBeVisible();
  // Still on /appointments
  expect(page.url()).toMatch(/\/appointments/);

  // Change status via the status combobox
  await editDialog.getByTestId('appt-status').click();
  await page
    .getByRole('option', { name: /llegó|arrived/i })
    .click();
  await editDialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(editDialog).not.toBeVisible({ timeout: 10_000 });

  // Reopen and delete
  let sameAppt = page
    .getByTestId('appt-badge')
    .filter({ hasText: startHm })
    .first();
  if (!(await sameAppt.isVisible().catch(() => false))) {
    await page.getByTestId('week-next').click();
    sameAppt = page
      .getByTestId('appt-badge')
      .filter({ hasText: startHm })
      .first();
  }
  await sameAppt.click();
  const editDialog2 = page.getByRole('dialog');
  await expect(editDialog2).toBeVisible();
  await editDialog2
    .getByRole('button', { name: /^eliminar$|^delete$/i })
    .first()
    .click();
  // Confirm by clicking the destructive button that appears
  await editDialog2
    .getByRole('button', { name: /^eliminar$|^delete$/i })
    .last()
    .click();
  await expect(editDialog2).not.toBeVisible({ timeout: 10_000 });
});
