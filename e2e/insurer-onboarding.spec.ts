import { test, expect } from '@playwright/test';

test('inline new-patient from appointment dialog opens the full form', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  await page.goto('/appointments');
  await page.getByRole('button', { name: /nuevo turno|new appointment/i }).click();

  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  // Open the patient picker and click "+ Nuevo paciente"
  const patientTrigger = apptDialog.getByRole('button', { name: /buscar|search/i }).first();
  await patientTrigger.click();
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
  await expect(newPatientDialog.locator('textarea[name="medical_history"]')).toBeVisible();
  await expect(newPatientDialog.locator('textarea[name="allergies"]')).toBeVisible();
  // The InsurerPicker is rendered (the trigger button is present)
  await expect(newPatientDialog.locator('#insurer-picker-trigger')).toBeVisible();
});
