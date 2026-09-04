import { test, expect } from '@playwright/test';
test('deleted patient shows banner + restore', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15000 });

  await page.goto('/patients/new');
  const stamp = Date.now();
  await page.getByLabel(/first name|nombre/i).fill('ToRestore');
  await page.getByLabel(/last name|apellido/i).fill(`Restore${stamp}`);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 15_000 });
  const detailUrl = page.url();

  await page.getByTestId('delete-patient').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^delete$|^eliminar$/i }).click();
  await page.waitForURL(/\/patients$/, { timeout: 15_000 });

  // Visit the (deleted) patient detail directly
  await page.goto(detailUrl);
  await expect(page.getByText(/deleted|está eliminado/i)).toBeVisible();
  await expect(page.getByTestId('restore-patient')).toBeVisible();

  // Restore and see normal UI
  await page.getByTestId('restore-patient').click();
  await expect(page.getByTestId('restore-patient')).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('delete-patient')).toBeVisible();
});
