import { test, expect } from '@playwright/test';

// Bug 1: Gender picker works from /patients/new but NOT from the appointment
// dialog's inline new-patient form.
test('repro: gender picker must work in the inline new-patient form', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  // Path A: /patients/new (working baseline)
  await page.goto('/patients/new');
  const baselineGender = page.getByRole('combobox');
  await baselineGender.click();
  await page.getByRole('option', { name: /^masculino$|^male$/i }).click();
  await expect(baselineGender).toContainText(/masculino|male/i);

  // Path B: inline new-patient from appointment dialog
  await page.goto('/appointments');
  await page.getByRole('button', { name: /nuevo turno|new appointment/i }).click();
  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  const patientTrigger = apptDialog.getByRole('button', { name: /buscar|search/i }).first();
  await patientTrigger.click();
  await apptDialog.getByRole('button', { name: /nuevo paciente|new patient/i }).click();
  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();

  const inlineGender = newPatientDialog.getByRole('combobox');
  await inlineGender.click();
  await page.getByRole('option', { name: /^masculino$|^male$/i }).click();
  await expect(inlineGender).toContainText(/masculino|male/i);
});

// Bug 2: The insurance onboarding form must receive clicks. With the old
// implementation, the surrounding patient dialog's overlay/content at z-60
// sat above the portaled insurer dialog's z-100, so all clicks on the
// insurer form were intercepted by the patient form.
//
// Fix: use Radix Dialog (which handles nested dialog stacking correctly)
// for the insurer sub-dialog instead of a custom div, and prevent the
// parent dialog from closing when interacting with the insurer dialog.
test('repro: insurance onboarding form receives clicks (not the patient form)', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  await page.goto('/appointments');
  await page.getByRole('button', { name: /nuevo turno|new appointment/i }).click();
  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  // Open patient picker → "+ Nuevo paciente"
  const patientTrigger = apptDialog
    .getByRole('button', { name: /buscar|search/i })
    .first();
  await patientTrigger.click();
  await apptDialog
    .getByRole('button', { name: /nuevo paciente|new patient/i })
    .click();

  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();

  // Required patient fields
  await newPatientDialog
    .getByLabel(/nombre|first name/i)
    .fill('Test');
  await newPatientDialog
    .getByLabel(/apellido|last name/i)
    .fill(`ClickTest${Date.now()}`);

  // Open insurer picker → "+ Nueva obra social"
  await newPatientDialog.locator('#insurer-picker-trigger').click();
  await newPatientDialog
    .getByRole('button', { name: /nueva obra social|new insurer/i })
    .click();

  // Insurer dialog is now open. The form inputs must be interactive.
  const insurerDialog = page.getByRole('dialog').last();
  await expect(insurerDialog).toBeVisible();
  const stamp = Date.now();
  const insurerName = `OS BugRepro ${stamp}`;

  // Type into the name field via the keyboard (no force, no dispatchEvent)
  const nameInput = insurerDialog.locator('input[name="name"]');
  await nameInput.click();
  await nameInput.fill(insurerName);
  await expect(nameInput).toHaveValue(insurerName);

  // Save the insurer — the patient dialog should remain open.
  const postResp = page.waitForResponse(
    (r) =>
      r.url().includes('/api/insurers') && r.request().method() === 'POST',
    { timeout: 10_000 },
  );
  await insurerDialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  const resp = await postResp;
  expect(resp.status()).toBe(201);

  // The new patient dialog should still be visible (not closed)
  await expect(newPatientDialog).toBeVisible();

  // The insurer is persisted
  const list = await (await page.request.get('/api/insurers')).json();
  expect(list.find((i: any) => i.name === insurerName)).toBeTruthy();
});
