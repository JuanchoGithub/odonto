import { test, expect } from '@playwright/test';
import { openManualCreate } from './helpers';

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
  // The gender field is rendered by Radix Select; trigger click via the labelled element.
  // The hidden input puts name in <input name="gender">; the visible button references it via aria-labelledby.
  const genderTrigger = page.locator('button[aria-labelledby="gender"]').first();
  await genderTrigger.click();
  await page.getByRole('option', { name: /^masculino$|^male$/i }).click();
  await expect(genderTrigger).toContainText(/masculino|male/i);

  // Path B: inline new-patient from appointment dialog
  await page.goto('/appointments');
  await openManualCreate(page);
  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  await apptDialog.getByTestId('appt-patient-input').click();
  await apptDialog.getByRole('button', { name: /nuevo paciente|new patient/i }).click();
  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();

  // Quick intake hides gender in the collapsed "more details" section
  await newPatientDialog.getByText(/más datos|more details/i).click();

  // Same pattern: capture the gender trigger by its accessible name (the
  // hidden input id='gender' is what aria-labelledby points to).
  const inlineGender = newPatientDialog.locator('button[aria-labelledby="gender"]').first();
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
  await openManualCreate(page);
  const apptDialog = page.getByRole('dialog');
  await expect(apptDialog).toBeVisible();

  // Focus patient picker → "+ Nuevo paciente"
  await apptDialog.getByTestId('appt-patient-input').click();
  await apptDialog
    .getByRole('button', { name: /nuevo paciente|new patient/i })
    .click();

  const newPatientDialog = page.getByTestId('new-patient-dialog');
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
  const insurerDialog = page.getByTestId('new-insurer-dialog');
  await expect(insurerDialog).toBeVisible();
  const stamp = Date.now();
  const insurerName = `OS BugRepro ${stamp}`;

  // Type into the name field via the keyboard (no force, no dispatchEvent)
  const nameInput = insurerDialog.locator('input[name="name"]');
  await nameInput.click();
  await nameInput.fill(insurerName);
  await expect(nameInput).toHaveValue(insurerName);

  // Save the insurer (offline-first: queued locally, zero invocations) —
  // the insurer dialog closes, the patient dialog should remain open.
  await insurerDialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(insurerDialog).toBeHidden({ timeout: 10_000 });

  // The new patient dialog should still be visible (not closed)
  await expect(newPatientDialog).toBeVisible();

  // Close the patient dialog (the queued insurer survives in localStorage),
  // then flush the queue via the pending-sync badge and verify server-side.
  // NOTE: closing the topmost dialog reveals the appointment dialog
  // underneath (Radix un-hides it), so scope the cancel click explicitly.
  await newPatientDialog
    .getByRole('button', { name: /cancelar|cancel/i })
    .click();
  await expect(newPatientDialog).toBeHidden({ timeout: 10_000 });
  // The appointment dialog is still open here; close it to reach the badge.
  const apptDialog2 = page.getByTestId('add-appt-dialog');
  if (await apptDialog2.isVisible().catch(() => false)) {
    await apptDialog2.getByRole('button', { name: /cancelar|cancel/i }).first().click().catch(() => {});
  }
  const badge = page.getByTestId('sync-badge');
  await badge.click({ timeout: 15_000 });
  await badge.waitFor({ state: 'hidden', timeout: 30_000 });
  const list = await (await page.request.get('/api/insurers')).json();
  expect(list.find((i: any) => i.name === insurerName)).toBeTruthy();
});
