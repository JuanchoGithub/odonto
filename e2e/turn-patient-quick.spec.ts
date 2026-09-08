import { test, expect } from '@playwright/test';
import { openManualCreate } from './helpers';

test('inline new-patient from turn shows the bare-minimum quick intake', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  await page.goto('/appointments');
  await openManualCreate(page);

  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  await apptDialog.getByTestId('appt-patient-input').click();
  await apptDialog.getByRole('button', { name: /nuevo paciente|new patient/i }).click();

  const quickDialog = page.getByRole('dialog').last();
  await expect(quickDialog).toBeVisible();

  // Bare minimum visible in call order: name, last name, phone, age, email, insurance
  const order = await quickDialog.evaluate((root) => {
    const els = Array.from(
      root.querySelectorAll('#first_name,#last_name,#phone,#patient_age,#email,#insurer-picker-trigger'),
    );
    return els.map((el) => el.id || 'insurer-picker-trigger');
  });
  expect(order).toEqual([
    'first_name',
    'last_name',
    'phone',
    'patient_age',
    'email',
    'insurer-picker-trigger',
  ]);

  // No VISIBLE member-number field in the quick form (lives collapsed in details)
  await expect(quickDialog.locator('input[name="insurance_number"]')).not.toBeVisible();

  // Everything else hides inside collapsed sections
  await expect(quickDialog.locator('[data-field="medical_history"]')).toHaveCount(1);
  await expect(quickDialog.locator('[data-field="medical_history"]')).not.toBeVisible();

  // Age → 01/01/(currentYear - age) drives the hidden birth_date
  const age = 30;
  await quickDialog.getByTestId('patient-age').fill(String(age));
  const expectedDob = `${new Date().getFullYear() - age}-01-01`;
  await expect
    .poll(() => quickDialog.locator('input[name="birth_date"]').inputValue())
    .toBe(expectedDob);

  // The exact DOB in collapsed details stays in sync
  await quickDialog.getByText(/más datos|more details/i).click();
  await expect(quickDialog.locator('#birth_date_exact')).toHaveValue(expectedDob);

  // Create with the bare minimum: names + age only (phone/email optional)
  const lastName = `Quick${Date.now()}`;
  await quickDialog.getByLabel(/nombre|first name/i).fill('Quick');
  await quickDialog.getByLabel(/apellido|last name/i).fill(lastName);
  await quickDialog.getByRole('button', { name: /^guardar$|^save$/i }).click();

  // Inline create: no redirect — dialog closes, picker shows the new patient
  await expect(page.getByRole('dialog')).toHaveCount(1, { timeout: 10_000 });
  await expect(apptDialog).toBeVisible();
  await expect(apptDialog.getByTestId('appt-patient-input')).toHaveValue(
    new RegExp(lastName),
  );
});
