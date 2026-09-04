import { test, expect } from '@playwright/test';

test('generate a turn-picker link from the patient page and book via the public URL', async ({
  page,
  context,
}) => {
  // 1. Sign in as dentist
  await page.goto('/login');
  await page.getByLabel('Email').fill('doc@local');
  await page.getByLabel(/contraseñ|password/i).fill('Doctor123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  // 2. Open a patient
  await page.goto('/patients');
  const patientHref = await page
    .getByRole('link', { name: /García, Ana|Ana García/i })
    .first()
    .getAttribute('href');
  await page.goto(patientHref!);

  // 3. Open the share dialog
  await page
    .getByRole('button', { name: /compartir turno|share appointment/i })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // 4. Generate the link
  await dialog
    .getByRole('button', { name: /generar enlace|generate link/i })
    .click();

  // 5. Extract the generated URL
  const urlInput = dialog.locator('input');
  await expect(urlInput).toBeVisible({ timeout: 10_000 });
  const url = await urlInput.inputValue();
  expect(url).toContain('/pick-turn/');

  // 6. Visit the URL in a fresh (unauthenticated) page
  const pub = await context.newPage();
  await pub.goto(url);
  await expect(
    pub.getByRole('heading', {
      name: /reservá tu turno|book your appointment/i,
    }),
  ).toBeVisible();

  // 7. Pick the first available day
  await pub
    .getByRole('button', { name: /lun|mar|mié|jue|vie|mon|tue|wed|thu|fri/i })
    .first()
    .click();

  // 8. Pick a time slot
  const slotButtons = pub.getByRole('button', { name: /^\d{1,2}:\d{2}/ });
  await expect(slotButtons.first()).toBeVisible({ timeout: 10_000 });
  await slotButtons.first().click();

  // 9. Confirm
  await pub
    .getByRole('button', { name: /confirmar turno|confirm appointment/i })
    .click();
  await expect(
    pub.getByText(/quedó reservado|is booked/i),
  ).toBeVisible({ timeout: 10_000 });

  // 10. Re-opening the link shows "consumed"
  await pub.goto(url);
  await expect(
    pub.getByText(/ya fue utilizado|already been used/i),
  ).toBeVisible();
});

test('an expired token shows the expired message', async ({ page }) => {
  // Unknown token → invalid message (public route must not 404/redirect to login)
  await page.goto('/pick-turn/definitely-not-a-real-token');
  await expect(
    page.getByText(/enlace inválido|invalid link/i),
  ).toBeVisible();
});
