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
  // :visible — RSC streaming can briefly mount a hidden duplicate of the
  // whole settings card (0×0 twin); strict-mode then sees two testids.
  const tzTrigger = page.locator('[data-testid="clinic-timezone"]:visible');
  await expect(tzTrigger).toBeVisible();
  await tzTrigger.click();
  await page.getByRole('option', { name: tz, exact: true }).click();
  await page.locator('[data-testid="clinic-save"]:visible').click();
  await page.waitForLoadState('networkidle');
}

test('turn-picker respects the clinic timezone when generating slots', async ({
  page,
  context,
}) => {
  // Force the clinic timezone to a non-UTC zone so any bug that confuses
  // server-local time with clinic-local time would be visible.
  await setClinicTimezone(page, 'America/Argentina/Buenos_Aires');

  // Wipe ALL of the dentist's schedule windows and save. The seed gives
  // dentists no explicit schedule (clinic-hours fallback), so wiping
  // restores the pristine state.
  async function clearSchedule() {
    await page.goto('/settings/schedules');
    const weekly = page.getByTestId('weekly-schedule');
    for (let guard = 0; guard < 30; guard++) {
      const trash = weekly.getByTestId('remove-window');
      if ((await trash.count()) === 0) break;
      try {
        await trash.first().click({ timeout: 2_000 });
      } catch {
        /* node disappeared mid-click */
      }
    }
    await weekly
      .getByRole('button', { name: /guardar|save/i })
      .click();
    await page.waitForLoadState('networkidle');
  }

  // This test mutates global state (clinic timezone + the dentist's
  // schedule). Restore both in a finally so a mid-test failure can't
  // poison the rest of the suite (or the next run on a reused DB).
  async function restoreAll() {
    try {
      await page.context().clearCookies();
      await setClinicTimezone(page, 'UTC');
      await page.context().clearCookies();
      await loginAs(page, 'doc@local', 'Doctor123!');
      await clearSchedule();
    } catch {
      /* best-effort: the suite must not fail twice */
    }
  }

  try {
  // Force the clinic timezone to a non-UTC zone so any bug that confuses
  // server-local time with clinic-local time would be visible.
  await setClinicTimezone(page, 'America/Argentina/Buenos_Aires');

  // Log in as the dentist and set Mon 09:00–13:00 (clinic-local) only.
  await page.context().clearCookies();
  await loginAs(page, 'doc@local', 'Doctor123!');

  await clearSchedule();

  const weekly = page.getByTestId('weekly-schedule');

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
  const urlInput = dialog.locator('#tp-url');
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

  // The e2e DB is shared across specs: other tests may have booked part of
  // this Monday (e.g. turn-picker.spec books the dentist's first free slot).
  // Subtract genuinely-occupied slots so we only assert on free ones.
  const artDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const dayBefore = new Date(`${mondayDate}T12:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const apptsRes = await page.request.get(
    `/api/appointments?start=${encodeURIComponent(dayBefore.toISOString())}`,
  );
  const occupied = new Set<string>();
  if (apptsRes.ok()) {
    const appts = (await apptsRes.json()) as {
      starts_at: string;
      ends_at: string;
      status: string;
    }[];
    for (const a of appts) {
      if (a.status === 'cancelled' || a.status === 'no_show') continue;
      if (artDay.format(new Date(a.starts_at)) !== mondayDate) continue;
      const sMin = toMin(dtf.format(new Date(a.starts_at)));
      const eMin = toMin(dtf.format(new Date(a.ends_at)));
      for (let m = 9 * 60; m + 15 <= 13 * 60; m += 15) {
        if (m < eMin && m + 15 > sMin) {
          occupied.add(
            `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
          );
        }
      }
    }
  }

  // Expected slots: 09:00, 09:15, ..., 12:45 (16 slots at 15-min granularity).
  const expected: string[] = [];
  for (let m = 9 * 60; m + 15 <= 13 * 60; m += 15) {
    expected.push(
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    );
  }
  for (const e of expected) {
    if (occupied.has(e)) continue; // booked by another spec, not our window
    expect(slotMinutes, `missing slot ${e} ART`).toContain(e);
  }
  // Guard against a vacuous pass: most of the window must actually be free.
  expect(expected.length - occupied.size).toBeGreaterThanOrEqual(8);
  // No slot outside the 09:00–13:00 window.
  for (const got of slotMinutes) {
    const [h, m] = got.split(':').map(Number);
    expect(h * 60 + m, `unexpected slot ${got} ART`).toBeGreaterThanOrEqual(
      9 * 60,
    );
    expect(h * 60 + m, `unexpected slot ${got} ART`).toBeLessThan(13 * 60);
  }

  } finally {
    await restoreAll();
  }
});
