import { test, expect } from '@playwright/test';

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
  await page.getByRole('button', { name: /guardar|save/i }).click();

  // Redirect to detail
  await page.waitForURL(/\/insurers\/[a-f0-9-]{36}$/);
  const detailUrl = page.url();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // 2. Edit via the same detail page
  const nameInput = page.locator('input[name="name"]');
  await nameInput.fill(`${name} v2`);
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  // 3. Verify via list
  await page.goto('/insurers');
  await expect(page.getByText(`${name} v2`).first()).toBeVisible();

  // 4. Delete via detail (navigate directly to avoid link-click flakiness)
  await page.goto(detailUrl);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /eliminar|delete/i }).click();
  await page.waitForURL(/\/insurers$/);
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
  await page.getByRole('button', { name: /guardar|save/i }).click();
  await page.waitForURL(/\/insurers\/[a-f0-9-]{36}$/);

  // try to create another with the same name
  await page.goto('/insurers/new');
  await page.getByLabel(/nombre|name/i).first().fill(name);
  await page.getByRole('button', { name: /guardar|save/i }).click();
  // should NOT redirect, should show error
  await expect(page).toHaveURL(/\/insurers\/new$/);
  await expect(page.getByText(/ya existe|already exists/i)).toBeVisible();
});
