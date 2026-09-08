import { test, expect } from '@playwright/test';
import { openManualCreate } from './helpers';

test('inline new-patient from appointment dialog opens the full form', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  await page.goto('/appointments');
  await openManualCreate(page);

  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  // Focus the patient picker and click "+ Nuevo paciente"
  await apptDialog.getByTestId('appt-patient-input').click();
  await apptDialog.getByRole('button', { name: /nuevo paciente|new patient/i }).click();

  // The new-patient sub-dialog opens with the QUICK form (bare minimum)
  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();
  // Quick form must include the bare-minimum fields in call order
  await expect(newPatientDialog.locator('input[name="first_name"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="last_name"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="phone"]')).toBeVisible();
  await expect(newPatientDialog.getByTestId('patient-age')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="email"]')).toBeVisible();
  // The InsurerPicker is rendered (the trigger button is present); the
  // member-number input hides collapsed in the insurance-details section
  await expect(newPatientDialog.locator('#insurer-picker-trigger')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="insurance_number"]')).not.toBeVisible();
  // Exact birth date + clinical fields hide inside collapsed <details>:
  // present in the DOM but not visible until expanded.
  await expect(newPatientDialog.locator('#birth_date_exact')).toHaveCount(1);
  await expect(newPatientDialog.locator('#birth_date_exact')).not.toBeVisible();
  // (TagTextarea renders contentEditable divs with data-field, not <textarea>)
  await expect(newPatientDialog.locator('[data-field="medical_history"]')).toHaveCount(1);
  await expect(newPatientDialog.locator('[data-field="medical_history"]')).not.toBeVisible();
  await expect(newPatientDialog.locator('[data-field="allergies"]')).toHaveCount(1);
  await expect(newPatientDialog.locator('[data-field="allergies"]')).not.toBeVisible();
});
