import { test, expect, type Page } from '@playwright/test';
import { flushQueueAndOpenPatient } from './helpers';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

async function createPatientAndOpenOdontogram(page: Page) {
  await page.goto('/patients/new');
  const stamp = Date.now();
  await page.getByLabel(/first name|nombre/i).fill('HistTest');
  await page.getByLabel(/last name|apellido/i).fill(`Ht${stamp}`);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await flushQueueAndOpenPatient(page, `Ht${stamp}`);
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();
  await expect(page.getByTestId('overview-odontogram')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId('odontogram-root')).toBeVisible();
}

test('odontogram history: shows an empty state before any change', async ({
  page,
}) => {
  await login(page);
  await createPatientAndOpenOdontogram(page);

  // Fresh patient -> no history
  await page.getByTestId('history-toggle').click();
  await expect(page.getByTestId('odontogram-history-empty')).toBeVisible();
});

test('odontogram history: a painted condition appears in the timeline with user and time', async ({
  page,
}) => {
  await login(page);
  await createPatientAndOpenOdontogram(page);

  // Paint tooth 16 occlusal with caries (blue)
  await page.getByTestId('condition-chip-caries').click();
  const tooth = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="16"]');
  const saveResp = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await tooth.locator('[data-surface="occlusal"]').click();
  await saveResp;

  // Open history: the timeline now has one row for this change
  await page.getByTestId('history-toggle').click();
  await expect(page.getByTestId('odontogram-history')).toBeVisible();
  const rows = page.getByTestId('history-row');
  await expect(rows).toHaveCount(1);

  // The change reflects the painting (condition label + tooth + dentist)
  const row = rows.first();
  await expect(row).toContainText(/caries|Caries/);
  await expect(row).toContainText('16');
  await expect(row).toContainText(/demo|Dr/);
  await expect(row).toContainText(/Oclusal|occlusal/i);

  // Point-in-time select offers this snapshot as an option
  await expect(page.getByTestId('history-asof')).toBeVisible();
});

test('odontogram history: viewing as-of renders a read-only snapshot chart', async ({
  page,
}) => {
  await login(page);
  await createPatientAndOpenOdontogram(page);

  // Paint tooth 26 occlusal with caries, then a second change on tooth 14
  await page.getByTestId('condition-chip-caries').click();
  const tooth26 = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="26"]');
  const save1 = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await tooth26.locator('[data-surface="occlusal"]').click();
  await save1;
  const tooth14 = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="14"]');
  const save2 = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await tooth14.locator('[data-surface="occlusal"]').click();
  await save2;
  await page.keyboard.press('Escape');

  await page.getByTestId('history-toggle').click();

  // Select the OLDER snapshot (last option). At that point only tooth 26
  // had been painted (tooth 14 came later).
  await page.getByTestId('history-asof').locator('..').getByRole('combobox').click();
  const options = page.getByRole('option');
  const count = await options.count();
  await options.nth(count - 1).click();

  await expect(page.getByTestId('history-snapshot-banner')).toBeVisible();
  const occlusal26 = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="26"]')
    .locator('[data-surface="occlusal"]');
  const occlusal14 = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="14"]')
    .locator('[data-surface="occlusal"]');
  await expect(occlusal26).toHaveClass(/fill-blue-500/);
  await expect(occlusal14).not.toHaveClass(/fill-blue-500/);

  // Switch to the NEWER snapshot (second option): tooth 14 must now appear.
  // Regression guard: without remounting on snapshot change, the chart
  // stayed on the previous snapshot until "clear" was pressed.
  await page.getByTestId('history-asof').locator('..').getByRole('combobox').click();
  await options.nth(count - 2).click();
  await expect(occlusal26).toHaveClass(/fill-blue-500/);
  await expect(occlusal14).toHaveClass(/fill-blue-500/);

  // No edit affordances in the read-only snapshot view
  await expect(page.getByTestId('condition-legend')).toHaveCount(0);
});