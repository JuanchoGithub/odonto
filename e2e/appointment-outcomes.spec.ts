import { test, expect, type Page } from '@playwright/test';
import { pad, login, fillWhen, pickPatient, openManualCreate } from './helpers';

/** Next weekday (Mon–Fri) — day part only, time is chosen per test. */
function nextWeekday(offsetDays = 1) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function at(day: Date, h: number, m: number) {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/** A past weekday at h:m (yesterday, skipping back over weekends). */
function pastWeekday(h: number, m: number) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Fetch the week's appointments via the JSON API (session cookies ride along). */
async function fetchWeek(page: Page, anyDayInWeek: Date) {
  const monday = new Date(anyDayInWeek);
  monday.setDate(
    anyDayInWeek.getDate() - ((anyDayInWeek.getDay() + 6) % 7),
  );
  monday.setHours(0, 0, 0, 0);
  const res = await page.request.get(
    `/api/appointments?start=${encodeURIComponent(monday.toISOString())}`,
  );
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as any[];
}

/**
 * Pick a start time on `day` with no existing appointment at that instant.
 * Other tests in the shared e2e DB (and stale rows from previous runs) render
 * calendar badges at arbitrary times — including cancelled ones — so time text
 * alone can never identify our appointment. A provably-free instant can.
 */
async function pickFreeSlot(
  page: Page,
  day: Date,
  candidates: [number, number][],
) {
  const rows = await fetchWeek(page, day);
  const taken = new Set(rows.map((r) => new Date(r.starts_at).getTime()));
  for (const [h, m] of candidates) {
    const d = at(day, h, m);
    if (!taken.has(d.getTime())) return d;
  }
  throw new Error('no free slot among candidates');
}

/**
 * The appointment for `when` created most recently. The shared e2e DB keeps
 * stale rows from previous runs at the same slot, so "newest created_at" is
 * the only reliable identity short of exclusive time slots.
 */
async function latestAt(page: Page, when: Date) {
  const rows = await fetchWeek(page, when);
  return rows
    .filter((a) => new Date(a.starts_at).getTime() === when.getTime())
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

async function createAppt(page: Page, start: Date, durationMin = 30) {
  await openManualCreate(page);
  const dialog = page.getByRole('dialog');
  await pickPatient(dialog);
  await fillWhen(dialog, page, start, durationMin);
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

/** Open the calendar badge for a provably-unique instant. */
async function openBadge(page: Page, when: Date) {
  // Jump straight to the right week via the page's `start` query param —
  // clicking week-next repeatedly is stateful and breaks on second calls.
  // Pass the target DAY (server applies startOfWeek); do not pre-round to
  // Monday — new Date('yyyy-MM-dd') parses as UTC midnight and slips a day.
  await page.goto(
    `/appointments?start=${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
  );
  // Scope to the day column: same-time badges can exist on other weeks/days.
  const colIndex = (when.getDay() + 6) % 7;
  const hm = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const badge = page
    .getByTestId(`day-col-${colIndex}`)
    .getByTestId('appt-badge')
    .filter({ hasText: hm })
    .first();
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await badge.click();
}

test('overdue scheduled appointment becomes no_show via the cron sweep', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  const past = pastWeekday(10, 0);
  await createAppt(page, past, 15);
  const mine = await latestAt(page, past);
  expect(mine).toBeTruthy();

  const res = await page.request.get('/api/cron/mark-no-shows');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBeTruthy();
  expect(body.noShows).toBeGreaterThanOrEqual(1);

  const rows = await fetchWeek(page, past);
  const hit = rows.find((a) => a.id === mine.id);
  expect(hit).toBeTruthy();
  expect(hit.patient_name).toContain('García');
  expect(hit.status).toBe('no_show');
  expect(hit.no_show_by).toBe('system');
  expect(hit.no_show_at).toBeTruthy();
});

test('delete flow records a cancellation reason', async ({ page }) => {
  await login(page);
  await page.goto('/appointments');

  const when = await pickFreeSlot(page, nextWeekday(2), [
    [14, 15],
    [13, 45],
    [10, 45],
  ]);
  await createAppt(page, when, 30);

  // Identify the row we just created (newest at that instant).
  const created = await latestAt(page, when);
  expect(created).toBeTruthy();

  await openBadge(page, when);

  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: /^eliminar$|^delete$/i })
    .first()
    .click();
  await dialog.getByTestId('appt-delete-reason').click();
  await page
    .getByRole('option', { name: /duplicado|duplicate/i })
    .click();
  await dialog.getByTestId('appt-delete-confirm').click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  const hit = (await fetchWeek(page, when)).find(
    (a: any) => a.id === created.id,
  );
  expect(hit).toBeTruthy();
  expect(hit.status).toBe('cancelled');
  expect(hit.cancel_reason).toBe('duplicate');
  expect(hit.cancelled_at).toBeTruthy();
  expect(hit.cancelled_by).toBeTruthy();
});

test('moving an appointment tags it as reprogrammed', async ({ page }) => {
  await login(page);
  await page.goto('/appointments');

  const when = await pickFreeSlot(page, nextWeekday(2), [
    [10, 0],
    [10, 15],
    [10, 30],
    [10, 45],
  ]);
  await createAppt(page, when, 30);

  const created = await latestAt(page, when);
  expect(created).toBeTruthy();

  await openBadge(page, when);

  // Move it +60 min via the dialog (same write path as drag-move).
  const dialog = page.getByRole('dialog');
  const moved = new Date(when.getTime() + 60 * 60000);
  const movedHm = `${pad(moved.getHours())}:${pad(moved.getMinutes())}`;
  await fillWhen(dialog, page, moved, 30);
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  const after = await fetchWeek(page, when);
  const movedRow = after.find((a) => a.id === created.id);
  expect(movedRow).toBeTruthy();
  expect(movedRow.reprogram_count).toBe(1);
  expect(movedRow.original_starts_at).toBe(created.starts_at);

  // The marker shows up on the calendar block (scoped: a badge WITH a marker,
  // not any badge at that hour — older runs leave markerless duplicates).
  const marker = page
    .getByTestId('appt-badge')
    .filter({ has: page.getByTestId('reprogram-marker') })
    .filter({ hasText: movedHm })
    .first();
  await expect(marker).toBeVisible({ timeout: 10_000 });
});

test('terminal status cannot silently reopen — needs explicit confirmation', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  // 13:30+30min local stays within the seeded 09:00–18:00 (UTC) hours.
  const when = await pickFreeSlot(page, nextWeekday(2), [
    [13, 30],
    [13, 15],
    [12, 45],
  ]);
  await createAppt(page, when, 30);

  const created = await latestAt(page, when);
  expect(created).toBeTruthy();

  // Mark completed (terminal).
  await openBadge(page, when);
  let dialog = page.getByRole('dialog');
  await dialog.getByTestId('appt-status').click();
  await page.getByRole('option', { name: /completado|completed/i }).click();
  await dialog.getByRole('button', { name: /^guardar$|^save$/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  // Reopen the dialog and try to flip back to scheduled.
  await openBadge(page, when);
  dialog = page.getByRole('dialog');
  await dialog.getByTestId('appt-status').click();
  await page.getByRole('option', { name: /programado|scheduled/i }).click();
  await expect(dialog.getByTestId('reopen-notice')).toBeVisible();
  await dialog.getByRole('button', { name: /^guardar$|^save$/i }).click();
  // Server rejected the silent reopen; the confirm step appears instead.
  await expect(dialog.getByTestId('reopen-confirm')).toBeVisible({
    timeout: 10_000,
  });
  await dialog.getByTestId('reopen-confirm-btn').click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  const hit = (await fetchWeek(page, when)).find(
    (a: any) => a.id === created.id,
  );
  expect(hit).toBeTruthy();
  expect(hit.status).toBe('scheduled');
});
