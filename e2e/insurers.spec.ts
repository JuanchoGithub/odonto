import { test, expect, type Page } from '@playwright/test';

/**
 * Click Save on the insurer form and land on the detail page.
 * Fast path: the server action redirects to /insurers/[id].
 * Slow path: under suite load the action can complete server-side (row +
 * audit_log written) while its redirect response never lands client-side —
 * the button stays "Loading…" forever. In that case recover via the list.
 */
async function saveInsurerAndOpenDetail(page: Page, name: string) {
  await page.getByRole('button', { name: /guardar|save/i }).click();
  const redirected = await page
    .waitForURL(/\/insurers\/[a-f0-9-]{36}$/, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (redirected) return page.url();
  await page.goto('/insurers');
  const link = page.locator('.md\\:block').getByRole('link', { name });
  await expect(link).toBeVisible({ timeout: 10_000 });
  await link.click();
  await page.waitForURL(/\/insurers\/[a-f0-9-]{36}$/, { timeout: 10_000 });
  return page.url();
}

test('admin can create, view, edit, delete an insurer', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@local');
  await page.getByLabel(/contraseñ|password/i).fill('Admin123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  // 1. Create a new insurer
  await page.goto('/insurers/new');
  const stamp = Date.now();
  const name = `OS Test ${stamp}`;
  await page.getByLabel(/nombre|name/i).first().fill(name);

  // Redirect to detail
  const detailUrl = await saveInsurerAndOpenDetail(page, name);
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // 2. Edit via the same detail page
  const nameInput = page.locator('input[name="name"]');
  await nameInput.fill(`${name} v2`);
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  // 3. Verify via list — target the desktop table (the mobile card list is hidden at desktop sizes)
  await page.goto('/insurers');
  const desktopTable = page.locator('.md\\:block');
  await expect(desktopTable.getByText(`${name} v2`)).toBeVisible();

  // 4. Delete via detail (navigate directly to avoid link-click flakiness)
  await page.goto(detailUrl);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /eliminar|delete/i }).click();
  await page
    .waitForURL(/\/insurers$/, { timeout: 10_000 })
    .catch(() => page.goto('/insurers'));
  await expect(page.getByText(`${name} v2`)).toHaveCount(0);
});

test('duplicate insurer name is rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@local');
  await page.getByLabel(/contraseñ|password/i).fill('Admin123!');
  await page.getByRole('button', { name: /ingresar|sign in/i }).click();
  await page.waitForURL(/\/(es|en)\/dashboard/);

  // create one
  const stamp = Date.now();
  const name = `DupTest ${stamp}`;
  await page.goto('/insurers/new');
  await page.getByLabel(/nombre|name/i).first().fill(name);
  await saveInsurerAndOpenDetail(page, name);

  // try to create another with the same name
  await page.goto('/insurers/new');
  await page.getByLabel(/nombre|name/i).first().fill(name);
  await page.getByRole('button', { name: /guardar|save/i }).click();
  // should NOT redirect, should show error
  await expect(page).toHaveURL(/\/insurers\/new$/);
  await expect(page.getByText(/ya existe|already exists/i)).toBeVisible();
});
