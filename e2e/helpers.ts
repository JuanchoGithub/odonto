import { expect, type Page, type Locator } from '@playwright/test';

/** Wait until the streamed page tree has fully settled (Suspense swap done). */
export async function settleCalendar(page: Page) {
  await expect(page.getByTestId('view-calendar')).toHaveCount(1, {
    timeout: 15_000,
  });
}

export const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DDTHH:mm */
export const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export async function login(
  page: Page,
  email = 'doc@local',
  password = 'Doctor123!',
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/contraseñ|password/i).fill(password);
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 30_000 });
}

/** Populate the appointment dialog's date + start-time + duration fields. */
export async function fillWhen(
  dialog: Locator,
  page: Page,
  start: Date,
  durationMin: number,
) {
  await dialog
    .locator('input[name="appt_date"]')
    .fill(
      `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    );
  const hm = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  await dialog.getByTestId('appt-start-time').click();
  await page
    .getByRole('option', { name: new RegExp(`^${hm}$`) })
    .click();
  await dialog.getByTestId('appt-duration').click();
  await page
    .getByRole('option', { name: new RegExp(`^${durationMin} min$`) })
    .click();
}

/**
 * Open the manual appointment form via the unified "add turn" entry:
 * header "Nuevo turno" button → pick patient → "add manually" expands
 * the view inline. (The manual/link actions unlock after a patient is
 * picked, so the helper pre-picks one; callers may re-pick afterwards —
 * typing in the shared picker clears and re-searches.)
 */
export async function openManualCreate(page: Page, name = 'García') {
  await page
    .getByRole('button', { name: /nuevo turno|new appointment/i })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('appt-patient-input').fill(name);
  await dialog.getByTestId('appt-patient-option').first().click();
  await page.getByTestId('add-appt-manual').click();
}

/** Pick the patient matching `name` in the dialog's patient combobox (single input). */
export async function pickPatient(dialog: Locator, name = 'García') {
  await dialog.getByTestId('appt-patient-input').fill(name);
  await dialog.getByTestId('appt-patient-option').first().click();
}

/**
 * Wait until background /api/sync traffic has been quiet for 2s.
 * The offline-first store syncs on page load; interacting with
 * suggestion dropdowns mid-sync can swallow clicks (list re-render),
 * so suggestion tests settle first.
 */
export async function waitForSyncIdle(page: Page, timeout = 30_000) {
  const start = Date.now();
  let lastSync = start;
  const onActivity = (r: { url(): string }) => {
    if (r.url().includes('/api/sync')) lastSync = Date.now();
  };
  page.on('request', onActivity);
  page.on('response', onActivity);
  try {
    while (Date.now() - start < timeout) {
      await page.waitForTimeout(500);
      if (Date.now() - lastSync > 2000) return;
    }
  } finally {
    page.off('request', onActivity);
    page.off('response', onActivity);
  }
}

/**
 * Flush the offline queue via the pending-sync badge, resolve a patient by
 * last name through the API, and navigate to its detail page. Used after
 * saving /patients/new (which queues locally instead of redirecting).
 */
export async function flushQueueAndOpenPatient(
  page: Page,
  lastName: string,
): Promise<string> {
  const badge = page.getByTestId('sync-badge');
  await badge.click({ timeout: 15_000 });
  await badge.waitFor({ state: 'hidden', timeout: 30_000 });
  const res = await page.request.get(
    `/api/patients?q=${encodeURIComponent(lastName)}`,
  );
  expect(res.ok()).toBeTruthy();
  const list = (await res.json()) as { id: string }[];
  expect(list.length).toBeGreaterThan(0);
  await page.goto(`/patients/${list[0].id}`);
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url();
}

/**
 * Save a queued form (medical tab, insurer edit, …), flush via the
 * pending-sync badge, and reload so server-rendered content (risk banners,
 * lists) reflects the write.
 */
export async function saveAndSync(page: Page) {
  await page.getByRole('button', { name: /guardar|save/i }).click();
  const badge = page.getByTestId('sync-badge');
  await badge.click({ timeout: 15_000 });
  await badge.waitFor({ state: 'hidden', timeout: 30_000 });
  await page.reload();
}

/**
 * Create a patient through the offline-first form (/patients/new queues
 * locally), force the sync via the pending badge, and return the
 * server-confirmed detail URL.
 */
export async function createPatientAndGetUrl(
  page: Page,
  opts: { firstName: string; lastName: string; document?: string },
): Promise<string> {
  await page.goto('/patients/new');
  await page.getByLabel(/nombre|first name/i).fill(opts.firstName);
  await page.getByLabel(/apellido|last name/i).fill(opts.lastName);
  if (opts.document) {
    await page.getByLabel(/documento|id document/i).fill(opts.document);
  }
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await page.waitForURL(/\/(es|en)\/patients$/, { timeout: 15_000 });
  const badge = page.getByTestId('sync-badge');
  await badge.click({ timeout: 15_000 });
  await badge.waitFor({ state: 'hidden', timeout: 30_000 });
  // The flushed row is server-side now: resolve its id via the API.
  const res = await page.request.get(
    `/api/patients?q=${encodeURIComponent(opts.lastName)}`,
  );
  expect(res.ok()).toBeTruthy();
  const list = (await res.json()) as { id: string }[];
  expect(list.length).toBeGreaterThan(0);
  const url = `/patients/${list[0].id}`;
  await page.goto(url);
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url();
}

/**
 * Fill the birth-date picker with a `YYYY-MM-DD` value.
 * Desktop (fine pointer) renders Year/Month/Day dropdowns (Radix Select,
 * options in a portal on `page`); touch renders a native date input.
 * Option indexes are locale-independent: years descend from the current
 * year, months are Jan–Dec, days are 1-based.
 */
export async function fillBirthDate(
  page: Page,
  scope: Page | Locator,
  iso: string,
) {
  const yearTrigger = scope.getByTestId('birth-date-year');
  if (await yearTrigger.isVisible().catch(() => false)) {
    const [y, m, d] = iso.split('-');
    const maxYear = Math.max(new Date().getFullYear(), Number(y));
    await yearTrigger.click();
    await page
      .getByRole('option')
      .nth(maxYear - Number(y))
      .click();
    await scope.getByTestId('birth-date-month').click();
    await page
      .getByRole('option')
      .nth(Number(m) - 1)
      .click();
    await scope.getByTestId('birth-date-day').click();
    await page
      .getByRole('option')
      .nth(Number(d) - 1)
      .click();
  } else {
    await scope.locator('input[name="birth_date"]').fill(iso);
  }
}
