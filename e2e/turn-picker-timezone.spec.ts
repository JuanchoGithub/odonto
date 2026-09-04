import { test, expect, type Page } from '@playwright/test';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/contraseñ|password/i).fill(password);
  await page
    .getByRole('button', { name: /ingresar|sign in/i })
    .click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

async function setClinicTimezone(page: Page, tz: string) {
  await loginAs(page, 'admin@local', 'Admin123!');
  await page.goto('/settings');
  const tzTrigger = page.getByTestId('clinic-timezone');
  await expect(tzTrigger).toBeVisible();
  await tzTrigger.click();
  await page.getByRole('option', { name: tz, exact: true }).click();
  await page.getByTestId('clinic-save').click();
  await page.waitForLoadState('networkidle');
}

test('turn-picker respects the clinic timezone when generating slots', async ({
  page,
  context,
}) => {
  // Force the clinic timezone to a non-UTC zone so any bug that confuses
  // server-local time with clinic-local time would be visible.
  await setClinicTimezone(page, 'America/Argentina/Buenos_Aires');

  // Log in as the dentist and set Mon 09:00–13:00 (clinic-local) only.
  await page.context().clearCookies();
  await loginAs(page, 'doc@local', 'Doctor123!');

  await page.goto('/settings/schedules');
  const weekly = page.getByTestId('weekly-schedule');

  // Wipe any pre-existing windows first.
  for (let guard = 0; guard < 30; guard++) {
    const trash = weekly.getByTestId('remove-window');
    if ((await trash.count()) === 0) break;
    try {
      await trash.first().click({ timeout: 2_000 });
    } catch {
      /* node disappeared mid-click */
    }
  }

  // Add one window on day 1 (Monday) and fill 09:00 / 13:00.
  const monday = weekly.getByTestId('weekly-day-1');
  await monday
    .getByRole('button', { name: /agregar horario|add hours/i })
    .click();
  const timeInputs = monday.locator('input[type="time"]');
  await expect(timeInputs).toHaveCount(2);
  await timeInputs.nth(0).fill('09:00');
  await timeInputs.nth(1).fill('13:00');
  await weekly.getByRole('button', { name: /guardar|save/i }).click();
  await page.waitForLoadState('networkidle');

  // Generate a turn-picker link from a patient page.
  await page.goto('/patients');
  const patientHref = await page
    .getByRole('link', { name: /García, Ana|Ana García/i })
    .first()
    .getAttribute('href');
  await page.goto(patientHref!);
  await page
    .getByRole('button', { name: /compartir turno|share appointment/i })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: /generar enlace|generate link/i })
    .click();
  const urlInput = dialog.locator('input');
  await expect(urlInput).toBeVisible({ timeout: 10_000 });
  const url = await urlInput.inputValue();
  expect(url).toContain('/pick-turn/');

  // Visit the public URL and inspect the available slots via the API.
  const pub = await context.newPage();
  await pub.goto(url);
  await expect(
    pub.getByRole('heading', {
      name: /reservá tu turno|book your appointment/i,
    }),
  ).toBeVisible();

  const token = url.split('/pick-turn/')[1];
  const fromDate = new Date();
  const toDate = new Date(Date.now() + 14 * 86400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const apiRes = await pub.request.get(
    `/api/turn-picker/${encodeURIComponent(token)}/availability?from=${fmt(fromDate)}&to=${fmt(toDate)}`,
  );
  expect(apiRes.ok()).toBeTruthy();
  const data = (await apiRes.json()) as {
    slots: { start: string; end: string; date: string }[];
  };

  // Group slots by date and find a Monday in clinic-local time.
  const byDate = new Map<string, { start: string; end: string }[]>();
  for (const s of data.slots) {
    const list = byDate.get(s.date) ?? [];
    list.push({ start: s.start, end: s.end });
    byDate.set(s.date, list);
  }

  let mondayDate: string | null = null;
  for (const date of byDate.keys()) {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'short',
    }).format(new Date(date + 'T12:00:00'));
    if (wd === 'Mon') {
      mondayDate = date;
      break;
    }
  }
  expect(mondayDate, 'expected at least one Monday in the 14-day window').not.toBeNull();

  const mondaySlots = byDate.get(mondayDate!)!;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const slotMinutes = new Set<string>();
  for (const s of mondaySlots) {
    slotMinutes.add(dtf.format(new Date(s.start)));
  }

  // Expected slots: 09:00, 09:15, ..., 12:45 (16 slots at 15-min granularity).
  const expected: string[] = [];
  for (let m = 9 * 60; m + 15 <= 13 * 60; m += 15) {
    expected.push(
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    );
  }
  for (const e of expected) {
    expect(slotMinutes, `missing slot ${e} ART`).toContain(e);
  }
  // No slot outside the 09:00–13:00 window.
  for (const got of slotMinutes) {
    const [h, m] = got.split(':').map(Number);
    expect(h * 60 + m, `unexpected slot ${got} ART`).toBeGreaterThanOrEqual(
      9 * 60,
    );
    expect(h * 60 + m, `unexpected slot ${got} ART`).toBeLessThan(13 * 60);
  }

  // Restore the clinic timezone to UTC so other tests aren't affected.
  await page.context().clearCookies();
  await setClinicTimezone(page, 'UTC');
});
