import { test, expect } from '@playwright/test';
import { fillWhen, openManualCreate } from './helpers';

test('appointment dialog is a searchable combobox, not a free-text id field', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  await page.goto('/appointments');
  await expect(page.getByRole('heading', { name: /turnos|appointments/i })).toBeVisible();

  // Open the unified dialog via "+ Nuevo turno" (choice phase).
  await page
    .getByRole('button', { name: /nuevo turno|new appointment/i })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The patient field must NOT be a free-text input anymore.
  const freeTextPatient = dialog.locator('input[name="patient_id"]');
  await expect(freeTextPatient).toHaveCount(0);

  // Both actions unlock only after a patient is selected.
  const manualBtn = dialog.getByTestId('add-appt-manual');
  const linkBtn = dialog.getByTestId('add-appt-link');
  await expect(manualBtn).toBeDisabled();
  await expect(linkBtn).toBeDisabled();

  // Type directly in the single-input patient picker
  await dialog.getByTestId('appt-patient-input').fill('García');

  // Pick the first result
  await dialog.getByTestId('appt-patient-option').first().click();
  await expect(manualBtn).toBeEnabled();

  // Expand the manual form inline
  await manualBtn.click();

  // Pick a far-future time
  await fillWhen(dialog, page, new Date(2030, 3, 12, 9, 0), 30);

  // Save should now be enabled
  const saveBtn = dialog.getByRole('button', { name: /^guardar|^save$/i });
  await expect(saveBtn).toBeEnabled();

  // Click Save
  await saveBtn.click();

  // Dialog should close
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
});

test('inline "create new patient" from appointment dialog', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  await page.goto('/appointments');
  await openManualCreate(page);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Focus the single-input picker to open the dropdown, then
  // click "+ Nuevo paciente" inline link
  await dialog.getByTestId('appt-patient-input').click();
  const newPatientLink = dialog.getByRole('button', { name: /nuevo paciente|new patient/i });
  await newPatientLink.click();

  // The new-patient sub-dialog should appear
  const newPatientDialog = page.getByRole('dialog').last();
  await expect(newPatientDialog).toBeVisible();

  // Fill it
  await newPatientDialog.getByLabel(/nombre|first name/i).fill('Test');
  await newPatientDialog.getByLabel(/apellido|last name/i).fill(`E2E${Date.now()}`);

  // Save the new patient
  await newPatientDialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();

  // The new-patient dialog should close, the appointment dialog stays
  await expect(page.getByRole('dialog')).toHaveCount(1, { timeout: 10_000 });
  await expect(dialog).toBeVisible();

  // Pick a far-future time
  await fillWhen(dialog, page, new Date(2030, 4, 20, 14, 0), 30);

  // Appointment dialog save should be enabled (new patient is auto-selected)
  const appointmentSave = dialog.getByRole('button', { name: /^guardar$|^save$/i });
  await expect(appointmentSave).toBeEnabled();

  // Click and confirm the appointment is created
  await appointmentSave.click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
});
