import { test, expect, type Page } from '@playwright/test';
import { pad, login, fillWhen, pickPatient } from './helpers';

/** A day in the currently displayed week (0=Mon … 6=Sun) at h:m local time. */
function weekDate(dayOffset: number, h: number, m: number) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

async function createAppt(page: Page, start: Date, durationMin: number) {
  await page
    .getByRole('button', { name: /nuevo turno|new appointment/i })
    .click();
  const dialog = page.getByRole('dialog');
  await pickPatient(dialog);
  await fillWhen(dialog, page, start, durationMin);
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

test('clicking a slot opens the dialog with the exact 15-minute time pre-filled', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  // Sunday column (index 6) is guaranteed empty. y=142 → 10 slots → 10:30.
  await page.getByTestId('day-col-6').click({ position: { x: 40, y: 142 } });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const sunday = weekDate(6, 10, 30);
  const expectedDate = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
  await expect(dialog.locator('input[name="appt_date"]')).toHaveValue(
    expectedDate,
  );
  await expect(dialog.getByTestId('appt-start-time')).toHaveText('10:30');
  await expect(dialog.getByTestId('appt-duration')).toHaveText(/30 min/);
  await page.keyboard.press('Escape');
});

test('blocks are sized by duration, overlaps are allowed, drag reschedules', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  // 60-minute appointment (Wednesday 10:00–11:00)
  await createAppt(page, weekDate(2, 10, 0), 60);
  // 15-minute appointment (Wednesday 13:00–13:15)
  await createAppt(page, weekDate(2, 13, 0), 15);
  // Overlapping appointments are allowed (Wednesday 14:00–14:30 + 14:15–14:45)
  await createAppt(page, weekDate(2, 14, 0), 30);
  await createAppt(page, weekDate(2, 14, 15), 30);

  const block60 = page
    .getByTestId('appt-badge')
    .filter({ hasText: '10:00' })
    .first();
  const block15 = page
    .getByTestId('appt-badge')
    .filter({ hasText: '13:00' })
    .first();
  await expect(block60).toBeVisible();
  await expect(block15).toBeVisible();

  // 60 min = 4 slots, 15 min = 1 slot → height ratio ≈ 4
  const b60 = (await block60.boundingBox())!;
  const b15 = (await block15.boundingBox())!;
  expect(b60.height / b15.height).toBeGreaterThan(3);
  expect(b60.height / b15.height).toBeLessThan(4.6);

  // Overlapping blocks render side-by-side (each narrower than the column)
  const ovl1 = page
    .getByTestId('appt-badge')
    .filter({ hasText: '14:00' })
    .first();
  const ovl2 = page
    .getByTestId('appt-badge')
    .filter({ hasText: '14:15' })
    .first();
  await expect(ovl1).toBeVisible();
  await expect(ovl2).toBeVisible();
  const col = page.getByTestId('day-col-2');
  const colWidth = (await col.boundingBox())!.width;
  const w1 = (await ovl1.boundingBox())!.width;
  expect(w1).toBeLessThan(colWidth * 0.75);

  // Drag the 13:00 block down two slots (28px) → 13:30
  const dragBox = (await block15.boundingBox())!;
  const cx = dragBox.x + dragBox.width / 2;
  const cy = dragBox.y + 4; // near the top, away from the resize handle
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 10, { steps: 3 });
  await page.mouse.move(cx, cy + 28, { steps: 5 });
  await page.mouse.up();
  const moved = page
    .getByTestId('appt-badge')
    .filter({ hasText: '13:30' })
    .first();
  await expect(moved).toBeVisible({ timeout: 10_000 });
  const movedBox = (await moved.boundingBox())!;
  expect(Math.abs(movedBox.y - (dragBox.y + 28))).toBeLessThan(8);

  // List view shows the same appointments
  await page.getByTestId('view-list').click();
  await expect(
    page.getByTestId('appt-list-row').filter({ hasText: '14:00' }).first(),
  ).toBeVisible();
  await page.getByTestId('view-calendar').click();
  await expect(block60).toBeVisible();
});

test('drag-select on empty grid pre-fills a range and records the method', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  const col = page.getByTestId('day-col-2'); // Wednesday
  const box = (await col.boundingBox())!;
  // 11:30 = (11.5*60-480)/15 = 14 slots → y = 14*14 = 196px
  const x = box.x + box.width / 2;
  const y = box.y + 196 + 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 28, { steps: 4 });
  await page.mouse.up();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('appt-start-time')).toHaveText('11:30');
  await expect(dialog.getByTestId('appt-duration')).toHaveText(/30 min/);

  await pickPatient(dialog);
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  // The calendar block exists at 11:30…
  await expect(
    page.getByTestId('appt-badge').filter({ hasText: '11:30' }).first(),
  ).toBeVisible();

  // …and the list view shows who added it and how (drag).
  await page.getByTestId('view-list').click();
  const row = page
    .getByTestId('appt-list-row')
    .filter({ hasText: '11:30' })
    .first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/arrastre|drag/i);
  await expect(row).toContainText('Dr. Demo'); // added by + dentist
});

test('pending (shared, unbooked) links appear in the list view', async ({
  page,
}) => {
  await login(page);

  // Generate a share link from a patient page (left unbooked = pending)
  await page.goto('/patients');
  const patientHref = await page
    .getByRole('link', { name: /García, Ana|Ana García/i })
    .first()
    .getAttribute('href');
  await page.goto(patientHref!);
  await page
    .getByRole('button', { name: /compartir turno|share appointment/i })
    .click();
  const shareDialog = page.getByRole('dialog');
  await shareDialog
    .getByRole('button', { name: /generar enlace|generate link/i })
    .click();
  const urlInput = shareDialog.locator('input');
  await expect(urlInput).toBeVisible({ timeout: 10_000 });
  expect(await urlInput.inputValue()).toContain('/pick-turn/');
  await page.keyboard.press('Escape');

  // The appointments list view shows it as pending
  await page.goto('/appointments');
  await page.getByTestId('view-list').click();
  const pending = page
    .getByTestId('pending-link-row')
    .filter({ hasText: /García/ })
    .first();
  await expect(pending).toBeVisible({ timeout: 10_000 });
  await expect(pending).toContainText(/pendiente|pending/i);
  await expect(pending).toContainText(/compartido|shared/i);
});

test('non-working hours are shaded (weekend fully, outside business hours on weekdays)', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  // Wait for shading info to load
  const sundayShades = page
    .getByTestId('day-col-6')
    .getByTestId('off-hours');
  await expect(sundayShades).toHaveCount(1, { timeout: 10_000 });

  // Sunday = closed → the single shade covers the whole column (8:00–19:00)
  const sunBox = (await sundayShades.first().boundingBox())!;
  const colBox = (await page.getByTestId('day-col-6').boundingBox())!;
  expect(sunBox.height).toBeGreaterThan(colBox.height * 0.95);

  // Wednesday: shaded before 09:00 and after 18:00 (seeded 9–18 business hours)
  const wedShades = page.getByTestId('day-col-2').getByTestId('off-hours');
  await expect(wedShades).toHaveCount(2);
  const first = (await wedShades.first().boundingBox())!;
  // 8:00–9:00 = 56px
  expect(first.height).toBeGreaterThan(40);
  expect(first.height).toBeLessThan(75);
});

test('dentist filter narrows the calendar and is available to receptionists', async ({
  page,
}) => {
  await login(page, 'front@local', 'Front123!');

  await page.goto('/appointments');
  const filter = page.getByTestId('dentist-filter');
  await expect(filter).toBeVisible();
  await filter.click();
  await page
    .getByRole('option', { name: /dr\. demo/i })
    .click();
  await expect(filter).toContainText(/dr\. demo/i);
});
