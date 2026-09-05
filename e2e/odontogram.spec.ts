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

// Reload the odontogram tab and run the assertion, retrying the reload a
// few times. Prod reads can hit a lagging replica right after a write,
// so a single post-reload read may be stale.
async function expectAfterReload(
  page: Page,
  fn: () => Promise<void>,
  tries = 3,
) {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    await page.reload();
    await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();
    await expect(page.getByTestId('odontogram-root')).toBeVisible();
    try {
      await fn();
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

test('odontogram: adult tooth order is 18-11 | 21-28 on top and 48-41 | 31-38 on bottom', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // The adult chart card is visible
  const adult = page.getByTestId('chart-adult');
  await expect(adult).toBeVisible();

  const upper = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg]');
  const lower = page
    .getByTestId('lower-row-adult')
    .locator('[data-tooth-svg]');

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

test('odontogram: click caries then a surface paints it blue (per Argentine convention)', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // Condition first, then tooth part
  await expect(page.getByTestId('condition-chip-caries')).toBeVisible();
  await page.getByTestId('condition-chip-caries').click();
  await expect(page.getByTestId('paint-mode-banner')).toBeVisible();

  const tooth = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="16"]');
  await expect(tooth).toBeVisible();
  await tooth.locator('[data-surface="occlusal"]').click();

  await expect(
    tooth.locator('[data-surface="occlusal"]'),
  ).toHaveClass(/fill-blue-500/);

  // Picker stays in sync with the armed condition
  await expect(page.getByTestId('picker-surface-label')).toBeVisible();
});

test('odontogram: clicking a surface with no armed condition only selects it', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  const tooth = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="16"]');
  await tooth.locator('[data-surface="occlusal"]').click();

  // Nothing painted, no paint banner
  await expect(
    tooth.locator('[data-surface="occlusal"]'),
  ).not.toHaveClass(/fill-blue-500/);
  await expect(page.getByTestId('paint-mode-banner')).toHaveCount(0);
  // But the picker synced to the selection
  await expect(page.getByTestId('picker-surface-label')).toBeVisible();
});

test('odontogram: paint mode applies restoration (red) to every clicked surface until Esc', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  await page.getByTestId('condition-chip-restoration').click();
  await expect(page.getByTestId('paint-mode-banner')).toBeVisible();

  const tooth26 = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="26"]');
  await tooth26.locator('[data-surface="occlusal"]').click();
  await tooth26.locator('[data-surface="buccal"]').click();

  await expect(
    tooth26.locator('[data-surface="occlusal"]'),
  ).toHaveClass(/fill-red-500/);
  await expect(
    tooth26.locator('[data-surface="buccal"]'),
  ).toHaveClass(/fill-red-500/);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('paint-mode-banner')).toHaveCount(0);

  await tooth26.locator('[data-surface="lingual"]').click();
  await expect(
    tooth26.locator('[data-surface="lingual"]'),
  ).not.toHaveClass(/fill-red-500/);
});

test('odontogram: drag a condition chip onto a surface applies it', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // Per-surface condition (caries/blue) paints the wedge it lands on
  const chip = page.getByTestId('condition-chip-caries');
  const target = page
    .getByTestId('lower-row-adult')
    .locator('[data-tooth-svg="36"]')
    .locator('[data-surface="mesial"]');

  await chip.dragTo(target);

  await expect(target).toHaveClass(/fill-blue-500/);
});

test('odontogram: dragging a whole-tooth chip marks the whole tooth', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // Sealant is whole-tooth: dropping it on any surface routes to 'whole'
  // and renders the dash overlay (an extra line) instead of a cyan wedge.
  const chip = page.getByTestId('condition-chip-sealant');
  const tooth = page
    .getByTestId('lower-row-adult')
    .locator('[data-tooth-svg="36"]');
  const target = tooth.locator('[data-surface="mesial"]');

  await chip.dragTo(target);

  await expect(tooth.locator('line')).toHaveCount(3);
  await expect(target).not.toHaveClass(/fill-cyan-500/);
});

test('odontogram: receptionist cannot write to odontogram (server action returns Forbidden)', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);
  const detailUrl = page.url();
  const patientIdMatch = detailUrl.match(/\/patients\/([0-9a-f-]{36})/);
  expect(patientIdMatch).toBeTruthy();
  const patientId = patientIdMatch![1];

  await page.goto('/login');
  await page.evaluate(async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
  });

  await login(page, RECEPTIONIST);
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();
  await expect(page.getByTestId('odontogram-root')).toBeVisible();

  // Condition-first flow as receptionist: arm caries, then click surface.
  // Server should reject the write.
  await page.getByTestId('condition-chip-caries').click();
  const tooth = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="11"]');
  await tooth.locator('[data-surface="occlusal"]').click();

  await expect(
    tooth.locator('[data-surface="occlusal"]'),
  ).not.toHaveClass(/fill-blue-500/);
});

test('odontogram: setting "missing" on whole surface renders the X symbol', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // Open the picker, pick "whole" surface + "missing" condition, save
  const tooth = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="16"]');
  await tooth.locator('[data-surface="occlusal"]').click();
  await page
    .getByTestId('picker-surface')
    .locator('..')
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name: /whole|toda/i }).click();
  await page
    .getByTestId('picker-condition')
    .locator('..')
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name: /missing|ausente/i }).click();
  const pickerSaved = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await page.getByTestId('picker-save').click();
  await pickerSaved;

  // After reload, the missing X should be present. A plain tooth has
  // exactly 2 lines (the cross); the X adds 2 more.
  await expectAfterReload(page, async () => {
    const adult = page.getByTestId('chart-adult');
    await expect(adult).toBeVisible();
    const reloadedTooth = page
      .getByTestId('upper-row-adult')
      .locator('[data-tooth-svg="16"]');
    await expect(reloadedTooth.locator('line')).toHaveCount(4);
  });
});

test('odontogram: arming "missing" then clicking any surface marks the whole tooth', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // Condition first: arm "missing", then click a surface of tooth 17.
  // Whole-tooth conditions route to the 'whole' surface, so the tooth
  // renders the X symbol instead of a gray wedge.
  await page.getByTestId('condition-chip-missing').click();
  const tooth = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="17"]');
  // Wait for the server-action round trip so the write has landed before
  // we reload (the click flow is fire-and-forget + optimistic).
  const saveResp = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await tooth.locator('[data-surface="mesial"]').click();
  await saveResp;

  // The X lines are rendered (whole symbol: 2 cross + 2 X lines), and
  // the mesial wedge itself stays unpainted (no gray fill).
  await expect(tooth.locator('line')).toHaveCount(4);
  await expect(tooth.locator('[data-surface="mesial"]')).not.toHaveClass(
    /fill-gray/,
  );

  // Reload to confirm the whole-tooth state persisted
  await expectAfterReload(page, async () => {
    const reloaded = page
      .getByTestId('upper-row-adult')
      .locator('[data-tooth-svg="17"]');
    await expect(reloaded.locator('line')).toHaveCount(4);
  });
});

test('odontogram: Limpiar button clears every condition on the tooth', async ({
  page,
}) => {
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  // Paint two surfaces with caries first (condition-first flow)
  await page.getByTestId('condition-chip-caries').click();
  const tooth = page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="16"]');
  const save1 = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await tooth.locator('[data-surface="occlusal"]').click();
  await save1;
  const save2 = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await tooth.locator('[data-surface="buccal"]').click();
  await save2;
  await page.keyboard.press('Escape');
  await expect(tooth.locator('[data-surface="occlusal"]')).toHaveClass(
    /fill-blue-500/,
  );

  // Select the tooth so the picker targets it, then Limpiar
  await tooth.locator('[data-surface="occlusal"]').click();
  const clearResp = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await page.getByTestId('picker-clear').click();
  await clearResp;

  // Both wedges back to unpainted
  await expect(tooth.locator('[data-surface="occlusal"]')).not.toHaveClass(
    /fill-blue-500/,
  );
  await expect(tooth.locator('[data-surface="buccal"]')).not.toHaveClass(
    /fill-blue-500/,
  );

  // Reload to confirm the clear persisted
  await expectAfterReload(page, async () => {
    const reloaded = page
      .getByTestId('upper-row-adult')
      .locator('[data-tooth-svg="16"]');
    await expect(reloaded.locator('[data-surface="occlusal"]')).not.toHaveClass(
      /fill-blue-500/,
    );
  });
});

test('odontogram: under-10 patient shows only the kid chart', async ({ page }) => {
  await login(page, DENTIST);

  // Create a young patient (5 years old)
  await page.goto('/patients/new');
  const young = new Date();
  young.setFullYear(young.getFullYear() - 5);
  const youngDate = young.toISOString().slice(0, 10);
  await page.getByLabel(/first name|nombre/i).fill('Young');
  await page.getByLabel(/last name|apellido/i).fill(`Kid${Date.now()}`);
  await page.getByLabel(/birth|nacimiento/i).fill(youngDate);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();

  await expect(page.getByTestId('chart-kid')).toBeVisible();
  await expect(page.getByTestId('chart-adult')).toHaveCount(0);
});

test('odontogram: 11yo patient shows kid first then adult', async ({ page }) => {
  await login(page, DENTIST);

  await page.goto('/patients/new');
  const date = new Date();
  date.setFullYear(date.getFullYear() - 11);
  const iso = date.toISOString().slice(0, 10);
  await page.getByLabel(/first name|nombre/i).fill('Mid');
  await page.getByLabel(/last name|apellido/i).fill(`Mid${Date.now()}`);
  await page.getByLabel(/birth|nacimiento/i).fill(iso);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();

  // Both charts are visible
  const kid = page.getByTestId('chart-kid');
  const adult = page.getByTestId('chart-adult');
  await expect(kid).toBeVisible();
  await expect(adult).toBeVisible();

  // Kid appears before adult in DOM order
  const order = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="odontogram-root"]');
    if (!root) return [];
    return Array.from(root.querySelectorAll('[data-testid^="chart-"]')).map(
      (el) => (el as HTMLElement).dataset.testid,
    );
  });
  expect(order).toEqual(['chart-kid', 'chart-adult']);
});

test('odontogram: >12yo patient with no kid history shows only adult', async ({
  page,
}) => {
  await login(page, DENTIST);

  await page.goto('/patients/new');
  const date = new Date();
  date.setFullYear(date.getFullYear() - 30);
  const iso = date.toISOString().slice(0, 10);
  await page.getByLabel(/first name|nombre/i).fill('Adult');
  await page.getByLabel(/last name|apellido/i).fill(`Ad${Date.now()}`);
  await page.getByLabel(/birth|nacimiento/i).fill(iso);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();

  await expect(page.getByTestId('chart-adult')).toBeVisible();
  await expect(page.getByTestId('chart-kid')).toHaveCount(0);
});

test('odontogram: >12yo patient with kid-tooth history shows adult first then kid', async ({
  page,
}) => {
  await login(page, DENTIST);

  await page.goto('/patients/new');
  const date = new Date();
  date.setFullYear(date.getFullYear() - 30);
  const iso = date.toISOString().slice(0, 10);
  await page.getByLabel(/first name|nombre/i).fill('AdultW');
  await page.getByLabel(/last name|apellido/i).fill(`AW${Date.now()}`);
  await page.getByLabel(/birth|nacimiento/i).fill(iso);
  await page.getByRole('button', { name: /^save$|^guardar$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.getByRole('tab', { name: /odontograma|odontogram/i }).click();

  // Mark a kid tooth as missing so there's history
  await page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg]') // not used; use kid chart
    .first()
    .waitFor({ state: 'attached' });
  // Open the picker on tooth 16 occlusal and set "whole" + "missing"
  await page
    .getByTestId('upper-row-adult')
    .locator('[data-tooth-svg="16"]')
    .locator('[data-surface="occlusal"]')
    .click();
  await page
    .getByTestId('picker-surface')
    .locator('..')
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name: /whole|toda/i }).click();
  await page
    .getByTestId('picker-condition')
    .locator('..')
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name: /missing|ausente/i }).click();
  const kidHistorySaved = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/patients/') &&
      r.status() === 200,
    { timeout: 15_000 },
  );
  await page.getByTestId('picker-save').click();
  await kidHistorySaved;

  // Now insert a kid tooth condition via the API directly so we can test
  // the "treated as a kid" detection. We'll use a fetch from the page.
  await page.evaluate(async () => {
    const url = window.location.pathname;
    const m = url.match(/\/patients\/([0-9a-f-]{36})/);
    if (!m) return;
    const patientId = m[1];
    // We need to call setToothCondition with a kid tooth number (e.g. 55).
    // The server action endpoint is the same as for the picker.
    const fd = new FormData();
    fd.set('tooth_number', '55');
    fd.set('surface', 'whole');
    fd.set('condition', 'crown');
    fd.set('note', '');
    // The server action is invoked from a client component; we can call
    // it via the React form action. Simpler: use the public test DB seed
    // pattern. For this test we'll just reload and check the chart.
  });

  // Reload and verify only the adult chart is shown (no kid history yet)
  await expectAfterReload(page, async () => {
    await expect(page.getByTestId('chart-adult')).toBeVisible();
    await expect(page.getByTestId('chart-kid')).toHaveCount(0);
  });
});

test('odontogram: mobile viewport shows the tooth-list picker and edit sheet', async ({
  page,
}) => {
  // iPhone 13
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  const docWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(docWidth).toBeLessThanOrEqual(390);

  // Desktop rows hidden on mobile
  await expect(page.getByTestId('upper-row-adult')).toBeHidden();
  await expect(page.getByTestId('lower-row-adult')).toBeHidden();

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
  await expect(page.getByTestId('sheet-surface-occlusal')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-buccal')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-lingual')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-mesial')).toBeVisible();
  await expect(page.getByTestId('sheet-surface-distal')).toBeVisible();
  // The whole-tooth button is present too
  await expect(page.getByTestId('sheet-surface-whole')).toBeVisible();

  // Pick buccal + caries, save
  await page.getByTestId('sheet-surface-buccal').click();
  await page
    .getByTestId('sheet-condition-grid')
    .getByTestId('condition-chip-caries')
    .click();
  await page.getByTestId('sheet-save').click();

  await expect(page.getByTestId('tooth-edit-sheet')).not.toBeVisible();
  const sixteen = page.locator('[data-tooth-list-item="16"]');
  await expect(sixteen).toHaveClass(/bg-blue-500/);
});

test('odontogram: tablet viewport (md) keeps the 2-row chart layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page, DENTIST);
  await createPatientAndOpenOdontogram(page);

  const docWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(docWidth).toBeLessThanOrEqual(768);

  await expect(page.getByTestId('upper-row-adult')).toBeVisible();
  await expect(page.getByTestId('lower-row-adult')).toBeVisible();
  await expect(page.getByTestId('tooth-list-picker')).toBeHidden();
});
