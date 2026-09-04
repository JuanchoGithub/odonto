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

  const tooth = page.locator('[data-tooth-svg="16"]');
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
  const tooth26 = page.locator('[data-tooth-svg="26"]');
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
  const tooth = page.locator('[data-tooth-svg="11"]');
  await tooth.locator('[data-surface="occlusal"]').click();
  await page.getByTestId('condition-chip-caries').click();

  // The surface should NOT turn red (rejected by server)
  await expect(
    tooth.locator('[data-surface="occlusal"]'),
  ).not.toHaveClass(/fill-red-500/);
});
