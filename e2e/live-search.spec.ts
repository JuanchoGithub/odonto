import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('patients page shows suggestions while typing and opens the patient', async ({
  page,
}) => {
  await login(page);
  await page.goto('/patients');

  const input = page.locator('input[name="q"]');
  await input.fill('García');

  const option = page
    .getByTestId('patient-suggest-option')
    .filter({ hasText: /García/i })
    .first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();

  await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
});

test('appointment patient picker searches the server (phone match)', async ({
  page,
}) => {
  await login(page);

  // Create a patient with a unique phone number via the API.
  const stamp = String(Date.now()).slice(-6);
  const lastName = `PhoneFind${stamp}`;
  const phone = `555${stamp}`;
  const res = await page.request.post('/api/patients', {
    data: { first_name: 'Ana', last_name: lastName, phone },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto('/appointments');
  await page
    .getByRole('button', { name: /nuevo turno|new appointment/i })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Open the picker and search by PHONE — impossible with the old
  // client-side name-only filter.
  await dialog.getByRole('button', { name: /buscar|search/i }).first().click();
  await dialog.getByPlaceholder(/buscar|search/i).first().fill(stamp);

  const option = dialog
    .locator('button')
    .filter({ hasText: new RegExp(lastName) })
    .first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();

  // Selection sticks and unlocks Save.
  await expect(
    dialog.getByRole('button', { name: /^guardar|^save$/i }),
  ).toBeEnabled();
});

test('insurers page shows suggestions while typing and opens the insurer', async ({
  page,
}) => {
  await login(page);

  const name = `SeguroFind ${String(Date.now()).slice(-6)}`;
  const res = await page.request.post('/api/insurers', {
    data: { name, plan: 'Plan X' },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto('/insurers');
  await page.locator('input[name="q"]').fill('SeguroFind');

  const option = page
    .getByTestId('insurer-suggest-option')
    .filter({ hasText: new RegExp(name) })
    .first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();

  await page.waitForURL(/\/insurers\/[0-9a-f-]{36}$/, { timeout: 15_000 });
});
