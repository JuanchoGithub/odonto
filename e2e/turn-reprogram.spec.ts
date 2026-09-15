import { test, expect, type Page } from '@playwright/test';
import { login, openManualCreate, fillWhen, pad } from './helpers';

/**
 * WhatsApp reprogram flow: staff issues a single-use link from the
 * Notify/Reprogram menu that MOVES the same turn (no new appointment),
 * tagging it as reprogrammed.
 */

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

async function pickFreeSlot(page: Page, day: Date) {
  const rows = await fetchWeek(page, day);
  const taken = new Set(rows.map((r) => new Date(r.starts_at).getTime()));
  for (const [h, m] of [[9, 0], [9, 30], [10, 0], [11, 0], [14, 0], [15, 0], [16, 0], [17, 0]] as [number, number][]) {
    const d = at(day, h, m);
    if (!taken.has(d.getTime())) return d;
  }
  throw new Error('no free slot among candidates');
}

test('WhatsApp reprogram link moves the turn and tags it reprogrammed', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    (window as any).__openedUrls = [] as string[];
    window.open = (url?: string | URL) => {
      if (url) (window as any).__openedUrls.push(String(url));
      return null as unknown as Window;
    };
  });
  await login(page, 'front@local', 'Front123!');
  await page.goto('/appointments');

  // 1. Create a turn at a provably-free future slot.
  const day = nextWeekday(1);
  const when = await pickFreeSlot(page, day);
  await openManualCreate(page, 'García');
  const dialog = page.getByRole('dialog');
  await fillWhen(dialog, page, when, 30);
  await dialog
    .getByRole('button', { name: /^guardar$|^save$/i })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  const hm = `${pad(when.getHours())}:${pad(when.getMinutes())}`;

  // 2. List view → our (desktop table) row → edit dialog → WhatsApp menu
  //    → Reprogram. (Mobile cards carry their own WhatsApp button; desktop
  //    reaches the same menu through the dialog's PatientContact row.)
  await page.getByTestId('view-list').click();
  const row = page
    .locator('tr[data-testid="appt-list-row"]')
    .filter({ hasText: hm })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog).toBeVisible({ timeout: 10_000 });
  await editDialog.getByTestId(/^patient-contact-whatsapp-/).click();
  await expect(page.getByTestId('whatsapp-menu')).toBeVisible();
  await page.getByTestId(/-reprogram$/).first().click();

  // 3. The staff wa.me URL carries a /pick-turn/ reprogram link. Note the
  //    link rides inside the urlencoded `text=` body, so match the decoded
  //    form (`%2Fpick-turn%2F` on the wire).
  await page.waitForFunction(
    () =>
      ((window as any).__openedUrls as string[]).some((u) =>
        u.includes('pick-turn'),
      ),
    null,
    { timeout: 15_000 },
  );
  const waUrl = (await page.evaluate(
    () =>
      ((window as any).__openedUrls as string[]).find((u) =>
        u.includes('pick-turn'),
      ),
  )) as string;
  expect(waUrl).toBeTruthy();
  expect(waUrl).toMatch(/^https:\/\/wa\.me\/(\d+)?\?text=/);
  const decoded = decodeURIComponent(waUrl);
  expect(decoded).toMatch(/eprogram|eschedul/i);
  const match = decoded.match(/\/pick-turn\/[A-Za-z0-9_-]+/);
  expect(match).toBeTruthy();
  const absLink = new URL(match![0], page.url()).toString();

  // 4. While pending, the row shows the pending-reprogram chip.
  await page.reload();
  await page.getByTestId('view-list').click();
  const pendingRow = page
    .locator('tr[data-testid="appt-list-row"]')
    .filter({ hasText: hm })
    .first();
  await expect(pendingRow).toBeVisible({ timeout: 10_000 });
  await expect(
    pendingRow.getByTestId('pending-reprogram-chip'),
  ).toBeVisible({ timeout: 10_000 });

  // 5. Patient books a DIFFERENT slot via the public link.
  const pub = await context.newPage();
  await pub.goto(absLink);
  await expect(
    pub.getByRole('heading', { name: /reprogramá|reschedule/i }),
  ).toBeVisible();
  await pub
    .getByRole('button', { name: /lun|mar|mié|jue|vie|mon|tue|wed|thu|fri/i })
    .first()
    .click();
  const slotButtons = pub.getByRole('button', { name: /^\d{1,2}:\d{2}/ });
  await expect(slotButtons.first()).toBeVisible({ timeout: 10_000 });
  const n = await slotButtons.count();
  let picked = false;
  for (let i = 0; i < n; i++) {
    const label = ((await slotButtons.nth(i).textContent()) ?? '').trim();
    if (!label.includes(hm)) {
      await slotButtons.nth(i).click();
      picked = true;
      break;
    }
  }
  if (!picked) await slotButtons.first().click();
  const bookRes = pub.waitForResponse('**/api/turn-picker/*/book', {
    timeout: 15_000,
  });
  await pub
    .getByRole('button', { name: /mover turno|move appointment/i })
    .click();
  const res = await bookRes;
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { startsAt: string };
  expect(body.startsAt).toBeTruthy();
  await expect(pub.getByText(/se movió|was moved/i)).toBeVisible({
    timeout: 10_000,
  });

  // 6. Same appointment id, new time, reprogram_count bumped, link consumed.
  const movedAt = new Date(body.startsAt);
  const movedWeek = await fetchWeek(page, movedAt);
  const moved = movedWeek.find(
    (r) => new Date(r.starts_at).getTime() === movedAt.getTime(),
  );
  expect(moved).toBeTruthy();
  expect(moved.reprogram_count).toBeGreaterThanOrEqual(1);
  expect(new Date(moved.starts_at).getTime()).not.toBe(when.getTime());

  await pub.goto(absLink);
  await expect(pub.getByText(/ya fue utilizado|already been used/i)).toBeVisible();
});
