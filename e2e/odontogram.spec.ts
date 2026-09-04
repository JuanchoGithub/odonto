import { test, expect, type Page } from '@playwright/test';

const DENTIST = { email: 'doc@local', password: 'Doctor123!' };
const RECEPTIONIST = { email: 'front@local', password: 'Front123!' };

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel(/contraseñ|password/i).fill(who.password);
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

async function createPatientAndOpenOdontogram(page: Page) {
  await page.goto('/patients/new');
  const stamp = Date.now();
  await page.getByLabel(/first name|nombre/i).fill('OdontoTest');
  await page.getByLabel(/last name|apellido/i).fill(`Od${stamp}`);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();
  await expect(page.getByTestId('odontogram-root')).toBeVisible();
  return stamp;
}

test('odontogram: tooth order is 18-11 | 21-28 on top and 48-41 | 31-38 on bottom', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  const upper = page.getByTestId('upper-row').locator('[data-tooth-svg]');
  const lower = page.getByTestId('lower-row').locator('[data-tooth-svg]');

  const upperNumbers = await upper.evaluateAll((els) =>
    els.map((e) => Number(e.getAttribute('data-tooth-svg'))),
  );
  const lowerNumbers = await lower.evaluateAll((els) =>
    els.map((e) => Number(e.getAttribute('data-tooth-svg'))),
  );

  expect(upperNumbers).toEqual([
    18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  ]);
  expect(lowerNumbers).toEqual([
    48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
  ]);
});

test('odontogram: click a surface then a condition chip paints it', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  const tooth = page
    .getByTestId('upper-row')
    .locator('[data-tooth-svg="16"]');
  await expect(tooth).toBeVisible();
  await tooth.locator('[data-surface="occlusal"]').click();

  await expect(page.getByTestId('picker-surface-label')).toBeVisible();
  await expect(page.getByTestId('condition-chip-caries')).toBeVisible();
  await page.getByTestId('condition-chip-caries').click();

  await expect(
    tooth.locator('[data-surface="occlusal"]'),
  ).toHaveClass(/fill-red-500/);
});

test('odontogram: paint mode applies a condition to every clicked surface until Esc', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // Enter paint mode for "filling" (blue)
  await page.getByTestId('condition-chip-filling').click();
  await expect(page.getByTestId('paint-mode-banner')).toBeVisible();

  // Paint two surfaces on tooth 26
  const tooth26 = page
    .getByTestId('upper-row')
    .locator('[data-tooth-svg="26"]');
  await tooth26.locator('[data-surface="occlusal"]').click();
  await tooth26.locator('[data-surface="buccal"]').click();

  await expect(
    tooth26.locator('[data-surface="occlusal"]'),
  ).toHaveClass(/fill-blue-500/);
  await expect(
    tooth26.locator('[data-surface="buccal"]'),
  ).toHaveClass(/fill-blue-500/);

  // Esc exits paint mode
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('paint-mode-banner')).toHaveCount(0);

  // Clicking a surface now does NOT auto-apply a condition
  await tooth26.locator('[data-surface="lingual"]').click();
  await expect(
    tooth26.locator('[data-surface="lingual"]'),
  ).not.toHaveClass(/fill-blue-500/);
});

test('odontogram: drag a condition chip onto a surface applies it', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  const chip = page.getByTestId('condition-chip-sealant');
  const target = page
    .getByTestId('lower-row')
    .locator('[data-tooth-svg="36"]')
    .locator('[data-surface="mesial"]');

  await chip.dragTo(target);

  await expect(target).toHaveClass(/fill-cyan-500/);
});

test('odontogram: receptionist cannot write to odontogram (server action returns Forbidden)', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);
  // Capture the patient id from the URL
  const detailUrl = page.url();
  const patientIdMatch = detailUrl.match(/\/patients\/([0-9a-f-]{36})/);
  expect(patientIdMatch).toBeTruthy();
  const patientId = patientIdMatch![1];

  // Log out, log in as receptionist
  await page.goto('/login');
  await page.evaluate(async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
  });

  await login(page, RECEPTIONIST);
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();
  await expect(page.getByTestId('odontogram-root')).toBeVisible();

  // Try the click-to-pick flow as receptionist: server should reject.
  const tooth = page
    .getByTestId('upper-row')
    .locator('[data-tooth-svg="11"]');
  await tooth.locator('[data-surface="occlusal"]').click();
  await page.getByTestId('condition-chip-caries').click();

  // The surface should NOT turn red (rejected by server)
  await expect(
    tooth.locator('[data-surface="occlusal"]'),
  ).not.toHaveClass(/fill-red-500/);
});

test('odontogram: mobile viewport shows the tooth-list picker and edit sheet', async ({
  page,
}) => {
  // iPhone 13
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // No horizontal overflow
  const docWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(docWidth).toBeLessThanOrEqual(390);

  // Desktop rows hidden on mobile
  await expect(page.getByTestId('upper-row')).toBeHidden();
  await expect(page.getByTestId('lower-row')).toBeHidden();

  // Tooth-list picker visible with all 16 teeth across 4 quadrants
  const list = page.getByTestId('tooth-list-picker');
  await expect(list).toBeVisible();

  const urTeeth = await page
    .getByTestId('list-upper-right')
    .locator('[data-tooth-list-item]')
    .evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute('data-tooth-list-item'))),
    );
  const ulTeeth = await page
    .getByTestId('list-upper-left')
    .locator('[data-tooth-list-item]')
    .evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute('data-tooth-list-item'))),
    );
  const lrTeeth = await page
    .getByTestId('list-lower-right')
    .locator('[data-tooth-list-item]')
    .evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute('data-tooth-list-item'))),
    );
  const llTeeth = await page
    .getByTestId('list-lower-left')
    .locator('[data-tooth-list-item]')
    .evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute('data-tooth-list-item'))),
    );
  expect(urTeeth).toEqual([18, 17, 16, 15, 14, 13, 12, 11]);
  expect(ulTeeth).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
  expect(lrTeeth).toEqual([48, 47, 46, 45, 44, 43, 42, 41]);
  expect(llTeeth).toEqual([31, 32, 33, 34, 35, 36, 37, 38]);

  // Open the edit sheet for tooth 16
  await page.locator('[data-tooth-list-item="16"]').click();
  await expect(page.getByTestId('tooth-edit-sheet')).toBeVisible();
  // The default surface is occlusal and all surfaces are listed
  await expect(page.getByTestId('sheet-surface-occlusal')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-buccal')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-lingual')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-mesial')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-distal')).toBeVisible();

  // Pick buccal + caries, save
  await page.getByTestId('sheet-surface-buccal').click();
  await page.locator('[data-testid="sheet-condition-grid"]')
    .getByTestId('condition-chip-caries')
    .click();
  await page.getByTestId('sheet-save').click();

  // Sheet closes, tooth 16 now shows as having a painted condition
  await expect(page.getByTestId('tooth-edit-sheet')).not.toBeVisible();
  const sixteen = page.locator('[data-tooth-list-item="16"]');
  await expect(sixteen).toHaveClass(/bg-red-500/);

  // Reload to confirm persistence (DB round-trip)
  await page.reload();
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();
  await expect(page.getByTestId('tooth-list-picker')).toBeVisible();
  const sixteenAfter = page.locator('[data-tooth-list-item="16"]');
  await expect(sixteenAfter).toHaveClass(/bg-red-500/);
});

test('odontogram: tablet viewport (md) keeps the 2-row chart layout', async ({
  page,
}) => {
  // Tailwind md = 768px; the 2-row layout needs >= ~768 to fit 16 teeth
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // No horizontal overflow at 768
  const docWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(docWidth).toBeLessThanOrEqual(768);

  // Desktop rows visible, mobile list hidden
  await expect(page.getByTestId('upper-row')).toBeVisible();
  await expect(page.getByTestId('lower-row')).toBeVisible();
  await expect(page.getByTestId('tooth-list-picker')).toBeHidden();
});
