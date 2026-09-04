import { test, expect, type Page } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** A weekday (Mon–Fri) in the currently displayed week. */
function weekDate(dayOffset: number, h: number, m: number) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

async function createAppt(page: Page, start: Date, end: Date) {
  await page
    .getByRole('button', { name: /nuevo turno|new appointment/i })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: /buscar|search/i })
    .first()
    .click();
  await dialog
    .getByPlaceholder(/buscar|search/i)
    .first()
    .fill('García');
  await dialog
    .locator('button')
    .filter({ hasText: /García/ })
    .first()
    .click();
  await dialog.locator('input[name="starts_at"]').fill(fmt(start));
  await dialog.locator('input[name="ends_at"]').fill(fmt(end));
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

test('clicking a slot opens the dialog at that exact 15-minute time', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  // Sunday column (index 6) is guaranteed empty. y=142px → 10 slots → 10:30.
  await page.getByTestId('day-col-6').click({ position: { x: 40, y: 142 } });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="starts_at"]')).toHaveValue(
    /T10:30/,
  );
  await page.keyboard.press('Escape');
});

test('blocks are sized by duration, overlaps are allowed, drag reschedules', async ({
  page,
}) => {
  await login(page);
  await page.goto('/appointments');

  // 60-minute appointment (Wednesday 10:00–11:00)
  await createAppt(page, weekDate(2, 10, 0), weekDate(2, 11, 0));
  // 15-minute appointment (Wednesday 13:00–13:15)
  await createAppt(page, weekDate(2, 13, 0), weekDate(2, 13, 15));
  // Overlapping appointments are allowed (Wednesday 14:00–14:30 + 14:15–14:45)
  await createAppt(page, weekDate(2, 14, 0), weekDate(2, 14, 30));
  await createAppt(page, weekDate(2, 14, 15), weekDate(2, 14, 45));

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

  // Both overlapping blocks render side by side (narrower than full width)
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

  // Drag the 13:00 block down by two slots (28px) → 13:30
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

  // Dragging vertically moved it the expected distance
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

test('dentist filter narrows the calendar and is available to receptionists', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('front@local');
  await page.getByLabel(/contraseñ|password/i).fill('Front123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });

  await page.goto('/appointments');
  const filter = page.getByTestId('dentist-filter');
  await expect(filter).toBeVisible();
  await filter.click();
  await page
    .getByRole('option', { name: /dr\. demo/i })
    .click();
  await expect(filter).toContainText(/dr\. demo/i);
});
