import { test, expect } from '@playwright/test';

test('soft delete patient with confirmation and undo', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15000 });

  // Create a throwaway patient
  await page.goto('/patients/new');
  const stamp = Date.now();
  await page.getByLabel(/first name|nombre/i).fill('ForDelete');
  await page.getByLabel(/last name|apellido/i).fill(`SoftDel${stamp}`);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 15_000 });

  // Click Delete → confirm dialog appears
  await page.getByTestId('delete-patient').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /delete patient|eliminar paciente/i })).toBeVisible();

  // Confirm
  await dialog.getByRole('button', { name: /^delete$|^eliminar$/i }).click();
  await page.waitForURL(/\/patients$/, { timeout: 15_000 });

  // Toast with Undo appears
  const undoBtn = page.getByRole('button', { name: /undo|deshacer/i });
  await expect(undoBtn).toBeVisible({ timeout: 5_000 });

  // Undo restores the patient and keeps us on the list
  await undoBtn.click();
  await page.waitForTimeout(500);
  await page.goto(`/patients?q=SoftDel${stamp}`);
  await expect(page.getByRole('link', { name: new RegExp(`SoftDel${stamp}`) }).getByText(`SoftDel${stamp}`)).toBeVisible();
});

test('share button on appointments page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15000 });

  await page.goto('/appointments');
  // Unified entry: "+ Nuevo turno" opens the single add-turn dialog.
  await page
    .getByRole('button', { name: /nuevo turno|new appointment/i })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Pick a patient first (single-input combobox: focus opens the full
  // patient list; typing narrows it).
  await dialog.getByTestId('appt-patient-input').click();
  const list = dialog.getByTestId('appt-patient-list');
  await expect(list).toBeVisible();
  const options = dialog.getByTestId('appt-patient-option');
  // The list is server-driven (debounced fetch) — wait for it to populate.
  await expect(options.first()).toBeVisible({ timeout: 10_000 });
  const fullCount = await options.count();
  expect(fullCount).toBeGreaterThan(1);
  await dialog.getByTestId('appt-patient-input').fill('García');
  await expect(options).toHaveCount(1);
  await options.first().click();

  // Generate-link action is disabled until a patient is chosen;
  // picking one enables it.
  const linkBtn = dialog.getByTestId('add-appt-link');
  await expect(linkBtn).toBeEnabled();
  await linkBtn.click();
  const input = dialog.locator('#add-appt-url');
  await expect(input).toBeVisible({ timeout: 10_000 });
  const url = await input.inputValue();
  expect(url).toContain('/pick-turn/');
});
