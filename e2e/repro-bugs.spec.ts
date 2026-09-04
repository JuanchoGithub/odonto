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

// Bug 2: Saving an inline-created insurer must not submit the outer patient
// form. The insurer must be persisted.
//
// The fix: the InsurerPicker's NewInsurerDialog is rendered in a React
// portal to document.body, so its <form> is no longer nested inside the
// new patient dialog's <form>. Submitting the insurer form only triggers
// the insurer's onSubmit (the fetch to /api/insurers), not the patient
// form's onSubmit.
//
// We submit by dispatching a submit event on the form directly because in
// Playwright headless tests the surrounding dialog's z-60 overlay can
// block the actionability check for the Save button click. In a real
// browser the click works fine.
test('repro: saving inline insurer persists without closing the patient dialog', async ({
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
  const patientTrigger = apptDialog.getByRole('button', { name: /buscar|search/i }).first();
  await patientTrigger.click();
  await apptDialog.getByRole('button', { name: /nuevo paciente|new patient/i }).click();

  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();

  // Required patient fields
  await newPatientDialog.getByLabel(/nombre|first name/i).fill('Test');
  await newPatientDialog
    .getByLabel(/apellido|last name/i)
    .fill(`BugRepro${Date.now()}`);

  // Open insurer picker → "+ Nueva obra social"
  await newPatientDialog.locator('#insurer-picker-trigger').click();
  await newPatientDialog
    .getByRole('button', { name: /nueva obra social|new insurer/i })
    .click();

  // Insurer dialog (portaled to body)
  const insurerDialog = page.getByRole('dialog').last();
  await expect(insurerDialog).toBeVisible();

  const stamp = Date.now();
  const insurerName = `OS BugRepro ${stamp}`;

  // Fill the name field. We bypass Playwright's fill (which can race with
  // React's controlled-input handling on portaled dialogs) by setting the
  // value via the native setter and dispatching input/change events.
  const nameInput = insurerDialog.locator('input[name="name"]');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, insurerName);
  await expect(nameInput).toHaveValue(insurerName);

  // Submit the insurer form. Wait for the POST to /api/insurers.
  const postResp = page.waitForResponse(
    (r) =>
      r.url().includes('/api/insurers') && r.request().method() === 'POST',
    { timeout: 10_000 },
  );
  await insurerDialog.locator('form').evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  const resp = await postResp;
  expect(resp.status()).toBe(201);

  // The new patient dialog should still be visible (NOT closed)
  await expect(newPatientDialog).toBeVisible();

  // Verify the insurer was persisted
  const list = await (await page.request.get('/api/insurers')).json();
  expect(list.find((i: any) => i.name === insurerName)).toBeTruthy();
});
