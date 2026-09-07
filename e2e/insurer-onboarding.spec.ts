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

  // The new-patient sub-dialog opens with the FULL form
  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();
  // Full form must include all the important fields
  await expect(newPatientDialog.locator('input[name="first_name"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="last_name"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="birth_date"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="phone"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="email"]')).toBeVisible();
  // (TagTextarea renders contentEditable divs with data-field, not <textarea>)
  await expect(newPatientDialog.locator('[data-field="medical_history"]')).toBeVisible();
  await expect(newPatientDialog.locator('[data-field="allergies"]')).toBeVisible();
  // The InsurerPicker is rendered (the trigger button is present)
  await expect(newPatientDialog.locator('#insurer-picker-trigger')).toBeVisible();
});
