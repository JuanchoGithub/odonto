import { test, expect } from '@playwright/test';
import { openManualCreate } from './helpers';

const ADMIN = { email: 'admin@local', password: 'Admin123!' };

async function login(page: any, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel(/contraseñ|password/i).fill(who.password);
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

test('medical tab: full clinical form, save, cross-tab preservation, risk banner', async ({ page }) => {
  await login(page, ADMIN);

  // 1. Create a basic patient via the general form
  await page.goto('/patients/new');
  const stamp = Date.now();
  const lastName = `Clinical${stamp}`;
  await page.getByLabel(/nombre|first name/i).fill('Clin');
  await page.getByLabel(/apellido|last name/i).fill(lastName);
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await page.waitForURL(/\/patients\/[a-f0-9-]{36}$/);

  // 2. Open the medical tab and fill clinical fields
  // (TagTextarea fields are contentEditable divs — getByLabel doesn't match
  // contenteditable, so target them via data-field; plain Inputs below still
  // use getByLabel.)
  await page.getByRole('tab', { name: /médico|medical/i }).click();
  const allergiesMed = page.locator('[data-field="allergies_medication"]');
  const contagious = page.locator('[data-field="contagious_diseases"]');
  await expect(allergiesMed).toBeVisible();
  await allergiesMed.fill('Penicilina');
  await contagious.fill('Hepatitis B');
  await page.getByLabel(/diabetes/i).fill('Tipo 2');
  await page.getByLabel(/grupo sanguíneo|blood type/i).fill('A+');
  await page.getByLabel(/tensión arterial|blood pressure/i).fill('120/80');
  await page.locator('[data-field="chronic_conditions"]').fill('Hipertensión');
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await page.waitForTimeout(1500);

  // 3. Back to the general tab: risk banner should be up, general data preserved
  await page.getByRole('tab', { name: /general/i }).click();
  const generalPanel = page.getByRole('tabpanel', { name: /general/i });
  await expect(generalPanel.getByRole('alert')).toBeVisible();
  await expect(
    generalPanel.getByText(/alerta clínica|clinical alert/i),
  ).toBeVisible();
  await expect(
    generalPanel.getByText(/alergia a medicamento|medication allergy/i),
  ).toBeVisible();
  await expect(
    generalPanel.getByText(/enfermedad transmisible|contagious disease/i),
  ).toBeVisible();
  await expect(page.getByLabel(/nombre|first name/i)).toHaveValue('Clin');
  await expect(page.getByLabel(/apellido|last name/i)).toHaveValue(lastName);
});

test('medical tab: save preserves general fields (no cross-tab data loss)', async ({ page }) => {
  await login(page, ADMIN);

  // Create a patient with general data
  await page.goto('/patients/new');
  const stamp = Date.now();
  const lastName = `CrossMode${stamp}`;
  await page.getByLabel(/nombre|first name/i).fill('Cross');
  await page.getByLabel(/apellido|last name/i).fill(lastName);
  await page.getByLabel(/documento|id document/i).fill(`DOC${stamp}`);
  await page.getByLabel(/tel[eé]fono|phone/i).fill('+54 11 5555-9999');
  await page.getByLabel(/email|email/i).fill('cross@example.com');
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await page.waitForURL(/\/patients\/[a-f0-9-]{36}$/);

  // Edit only medical tab
  await page.getByRole('tab', { name: /médico|medical/i }).click();
  await page.getByLabel(/diabetes/i).fill('Tipo 2 controlada');
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await page.waitForTimeout(1000);

  // Verify general fields still intact
  await page.getByRole('tab', { name: /general/i }).click();
  await expect(page.getByLabel(/nombre|first name/i)).toHaveValue('Cross');
  await expect(page.getByLabel(/apellido|last name/i)).toHaveValue(lastName);
  await expect(page.getByLabel(/documento|id document/i)).toHaveValue(`DOC${stamp}`);
  await expect(page.getByLabel(/tel[eé]fono|phone/i)).toHaveValue('+54 11 5555-9999');

  // And the medical field got saved
  await page.getByRole('tab', { name: /médico|medical/i }).click();
  await expect(page.getByLabel(/diabetes/i)).toHaveValue('Tipo 2 controlada');
});

test('inline new-patient dialog (from appointment) shows the quick intake', async ({ page }) => {
  await login(page, ADMIN);

  await page.goto('/appointments');
  await openManualCreate(page);

  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  await apptDialog.getByTestId('appt-patient-input').click();
  await apptDialog.getByRole('button', { name: /nuevo paciente|new patient/i }).click();

  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();

  // The quick form (bare minimum) must be present: names + phone + age +
  // email + insurance, in call order
  await expect(newPatientDialog.locator('input[name="first_name"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="last_name"]')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="phone"]')).toBeVisible();
  await expect(newPatientDialog.getByTestId('patient-age')).toBeVisible();
  await expect(newPatientDialog.locator('input[name="email"]')).toBeVisible();
  await expect(newPatientDialog.locator('#insurer-picker-trigger')).toBeVisible();
  // Member number hides collapsed in the insurance-details section
  await expect(newPatientDialog.locator('input[name="insurance_number"]')).not.toBeVisible();
  // Exact birth date hides in the collapsed "more details" section…
  await expect(newPatientDialog.locator('#birth_date_exact')).toHaveCount(1);
  await expect(newPatientDialog.locator('#birth_date_exact')).not.toBeVisible();
  // …and clinical fields hide collapsed too (TagTextarea renders a
  // contentEditable div with data-field, not a <textarea>)
  await expect(newPatientDialog.locator('[data-field="medical_history"]')).toHaveCount(1);
  await expect(newPatientDialog.locator('[data-field="medical_history"]')).not.toBeVisible();
  await expect(newPatientDialog.locator('[data-field="contagious_diseases"]')).toHaveCount(1);
  await expect(newPatientDialog.locator('[data-field="allergies_medication"]')).toHaveCount(1);

  // Fill required fields + age shorthand (→ 01/01 birth_date), create inline
  await newPatientDialog.getByLabel(/nombre|first name/i).fill('Inline');
  const newPatLastName = `Quick${Date.now()}`;
  await newPatientDialog.getByLabel(/apellido|last name/i).fill(newPatLastName);
  await newPatientDialog.getByTestId('patient-age').fill('40');
  const expectedDob = `${new Date().getFullYear() - 40}-01-01`;
  await expect
    .poll(() => newPatientDialog.locator('input[name="birth_date"]').inputValue())
    .toBe(expectedDob);

  // The form should use the inline create action (no redirect, no full-page nav)
  // Hitting Save should close the dialog and return to the appointment form
  await newPatientDialog.getByRole('button', { name: /^guardar$|^save$/i }).click();

  // Wait for the new-patient dialog to close
  await expect(page.getByRole('dialog')).toHaveCount(1, { timeout: 10_000 });

  // The appointment dialog is open and the patient picker now shows the new patient
  // (single-input combobox: the name is the input's value, not text content)
  await expect(apptDialog).toBeVisible();
  await expect(apptDialog.getByTestId('appt-patient-input')).toHaveValue(
    new RegExp(newPatLastName),
  );
});
