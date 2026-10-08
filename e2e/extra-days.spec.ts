import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

const pad = (n: number) => String(n).padStart(2, '0');
function ymdPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The tab content can transiently mount twice around RSC refreshes, and the
 * post-save client refresh paint is laggy in CI. Both are handled the same
 * way: wait until exactly one live tree is present before acting, wait for
 * the form's LOCAL reset signal (independent of refresh paint) before
 * navigating, and read back via full reload (deterministic SSR).
 */
async function settledCard(page: Page) {
  await expect(page.getByTestId('extra-days')).toHaveCount(1, {
    timeout: 15_000,
  });
  const card = page.getByTestId('extra-days').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

async function deleteExtraRow(page: Page, iso: string) {
  // Loop: several windows may share the date (one row each).
  for (let guard = 0; guard < 10; guard++) {
    const card = await settledCard(page);
    const rows = card.getByTestId('extra-day-row').filter({ hasText: iso });
    if (!(await rows.count())) break;
    // One listitem groups every window of the date — delete one per pass.
    await rows
      .first()
      .getByRole('button', { name: /eliminar|delete/i })
      .first()
      .click();
    await page.reload();
    await expect(page.getByTestId('extra-days').first()).toBeVisible({
      timeout: 15_000,
    });
  }
  await expect(
    page
      .getByTestId('extra-days')
      .first()
      .getByTestId('extra-day-row')
      .filter({ hasText: iso }),
  ).not.toBeVisible({ timeout: 15_000 });
}

test('extra day beyond the horizon offers the extend opt-in and saves both', async ({
  page,
}) => {
  await login(page);
  // Triple-confirm dialogs for the far-window extension.
  page.on('dialog', (d) => void d.accept());

  // Unique per run, always beyond the 14-day base and any automatic
  // month-end anchor (<= ~30d), inside the +62d cap.
  const iso = ymdPlusDays(40 + (Date.now() % 10));
  await page.goto('/profile?tab=times');
  await settledCard(page);
  // Pre-clean leftovers from crashed runs (unique dates make collisions
  // unlikely, but a stale anchor could still cover this date).
  await deleteExtraRow(page, iso);
  const preClear = page.getByTestId('agenda-open-clear').first();
  if (await preClear.count()) {
    await preClear.click();
    await page.reload();
    await settledCard(page);
  }

  const card = await settledCard(page);
  try {
    await card.getByTestId('extra-day-date').fill(iso);
    await card.getByTestId('extra-day-start').fill('09:00');
    await card.getByTestId('extra-day-end').fill('13:00');

    const extend = card.getByTestId('extra-day-extend-agenda');
    await expect(extend).toBeVisible({ timeout: 15_000 });
    await expect(extend).toBeChecked();

    await card.getByTestId('extra-day-add').click();
    // Wait for the submit to FULLY resolve (both sequential writes)
    // via the form's local reset signal — never navigate mid-submit.
    await expect
      .poll(
        async () =>
          (await card.getByTestId('extra-day-date').inputValue()) === '' ||
          (await card.getByTestId('extra-day-error').count()) > 0,
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(card.getByTestId('extra-day-error')).not.toBeVisible({
      timeout: 5_000,
    });

    await page.reload();
    const fresh = await settledCard(page);
    await expect(
      fresh.getByTestId('extra-day-row').filter({ hasText: iso }),
    ).toBeVisible({ timeout: 15_000 });

    // The opt-in extended the agenda anchor to the new date.
    await expect(page.getByTestId('agenda-open-current').first()).toContainText(
      iso,
      { timeout: 15_000 },
    );
  } finally {
    // Rerun-safe cleanup even on failure.
    await deleteExtraRow(page, iso);
    const clear = page.getByTestId('agenda-open-clear').first();
    if (await clear.count()) {
      await clear.click();
      await page.reload();
      await expect(page.getByTestId('extra-days').first()).toBeVisible({
        timeout: 15_000,
      });
    }
    await expect(
      page.getByTestId('agenda-open-current'),
    ).not.toBeVisible({ timeout: 15_000 });
  }
});

test('extra day on a normally-open day offers replace-or-add and stacks windows', async ({
  page,
}) => {
  await login(page);
  // Next Monday (+1..7d): always inside the base horizon, so no
  // extension opt-in interferes.
  const now = new Date();
  const delta = ((8 - now.getDay()) % 7) || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() + delta);
  const iso = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;

  await page.goto('/profile?tab=times');
  await settledCard(page);
  // Pre-clean windows left by a crashed run (next Monday is deterministic).
  await deleteExtraRow(page, iso);
  const card = await settledCard(page);
  try {
    await card.getByTestId('extra-day-date').fill(iso);
    await card.getByTestId('extra-day-start').fill('15:00');
    await card.getByTestId('extra-day-end').fill('16:00');

    // Normally-open day (clinic fallback Mon–Fri covers Monday) → the
    // replace/add choice appears, defaulting to add.
    const mode = card.getByTestId('extra-day-mode');
    await expect(mode).toBeVisible({ timeout: 15_000 });

    for (const [s, e] of [
      ['15:00', '16:00'],
      ['16:00', '17:00'],
    ] as const) {
      await card.getByTestId('extra-day-date').fill(iso);
      await card.getByTestId('extra-day-start').fill(s);
      await card.getByTestId('extra-day-end').fill(e);
      await card.getByTestId('extra-day-add').click();
      await expect
        .poll(
          async () =>
            (await card.getByTestId('extra-day-date').inputValue()) === '' ||
            (await card.getByTestId('extra-day-error').count()) > 0,
          { timeout: 20_000 },
        )
        .toBe(true);
      await expect(card.getByTestId('extra-day-error')).not.toBeVisible({
        timeout: 5_000,
      });
    }

    await page.reload();
    const fresh = await settledCard(page);
    const rows = fresh.getByTestId('extra-day-row').filter({ hasText: iso });
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    // Both windows listed, both marked as added on top of weekly hours.
    await expect(rows.getByText(/15:00–16:00/)).toBeVisible();
    await expect(rows.getByText(/16:00–17:00/)).toBeVisible();
    await expect(rows.getByText(/sumar|add on top/i).first()).toBeVisible();
  } finally {
    await deleteExtraRow(page, iso);
  }
});

test('extra day on an absent date warns and replaces only on confirm', async ({
  page,
}) => {
  await login(page);
  const iso = ymdPlusDays(20 + (Date.now() % 5));
  await page.goto('/profile?tab=times');
  await settledCard(page);

  // Mark the date absent via the untouched Ausencias flow; wait for its
  // local reset signal, then read back via reload.
  await page.getByTestId('absence-date').first().fill(iso);
  await page.getByTestId('absence-add').first().click();
  await expect
    .poll(
      async () =>
        (await page.getByTestId('absence-date').first().inputValue()) === '',
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.reload();
  await settledCard(page);
  await expect(
    page.getByTestId('absence-row').filter({ hasText: iso }),
  ).toBeVisible({ timeout: 15_000 });

  try {
    const card = await settledCard(page);
    await card.getByTestId('extra-day-date').fill(iso);
    await card.getByTestId('extra-day-start').fill('09:00');
    await card.getByTestId('extra-day-end').fill('12:00');

    // Never extend the agenda in this test — keep the anchor untouched.
    const extend = card.getByTestId('extra-day-extend-agenda');
    if (await extend.count()) await extend.uncheck();

    // First click only arms the explicit replace confirm — nothing written.
    await expect(card.getByTestId('extra-day-absence-warning')).toBeVisible();
    await card.getByTestId('extra-day-add').click();
    await expect(card.getByTestId('extra-day-add')).toContainText(
      /reemplazar|replace/i,
    );
    await expect(
      card.getByTestId('extra-day-row').filter({ hasText: iso }),
    ).not.toBeVisible();

    // Second click replaces the absence with the opening.
    await card.getByTestId('extra-day-add').click();
    await expect
      .poll(
        async () =>
          (await card.getByTestId('extra-day-date').inputValue()) === '' ||
          (await card.getByTestId('extra-day-error').count()) > 0,
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(card.getByTestId('extra-day-error')).not.toBeVisible({
      timeout: 5_000,
    });

    await page.reload();
    const fresh = await settledCard(page);
    await expect(
      fresh.getByTestId('extra-day-row').filter({ hasText: iso }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      fresh.getByTestId('extra-day-absence-warning'),
    ).not.toBeVisible();
  } finally {
    await deleteExtraRow(page, iso);
    // Remove a leftover absence for the same date, if the replace never ran.
    const absence = page.getByTestId('absence-row').filter({ hasText: iso });
    if (await absence.count()) {
      await absence
        .first()
        .getByRole('button', { name: /eliminar|delete/i })
        .first()
        .click();
      await page.reload();
      await expect(page.getByTestId('extra-days').first()).toBeVisible({
        timeout: 15_000,
      });
    }
    await expect(
      page.getByTestId('absence-row').filter({ hasText: iso }),
    ).not.toBeVisible({ timeout: 15_000 });
  }
});
