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
  await expect(page.getByText(`SoftDel${stamp}`)).toBeVisible();
});

test('share button on appointments page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15000 });

  await page.goto('/appointments');
  await page
    .getByRole('button', { name: /share appointment|compartir turno/i })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Generate button disabled until a patient is chosen
  const genBtn = dialog.getByRole('button', { name: /generate|generar/i });
  await expect(genBtn).toBeDisabled();

  // Pick a patient
  await dialog.getByRole('button', { name: /search|buscar/i }).click();
  await dialog.getByPlaceholder(/search|buscar/i).fill('García');
  await dialog.getByText(/García/i).first().click();

  // Generate link
  await expect(genBtn).toBeEnabled();
  await genBtn.click();
  const input = dialog.locator('input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  const url = await input.inputValue();
  expect(url).toContain('/pick-turn/');
});
