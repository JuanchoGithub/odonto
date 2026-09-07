import { test, expect, type Page } from '@playwright/test';

const ADMIN = { email: 'admin@local', password: 'Admin123!' };
const DENTIST = { email: 'doc@local', password: 'Doctor123!' };
const FRONT = { email: 'front@local', password: 'Front123!' };

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel(/contraseñ|password/i).fill(who.password);
  await page
    .getByRole('button', { name: /ingresar|sign in/i })
    .click();
  await page.waitForURL(/\/(es|en)\/dashboard/, { timeout: 15_000 });
}

test('doctor panel: next-hour queue + single add-turn button', async ({ page }) => {
  await login(page, DENTIST);
  await expect(page.getByTestId('doctor-panel')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /próxima hora|next hour/i }),
  ).toBeVisible();
  await expect(page.getByTestId('panel-add-turn')).toBeVisible();
  // "Add turn" opens the unified dialog (patient + duration, then
  // manual-expand or link — heading is the same "Nuevo turno").
  await page.getByTestId('panel-add-turn').click();
  await expect(
    page.getByRole('heading', { name: /nuevo turno|new appointment/i }),
  ).toBeVisible({ timeout: 15_000 });
  // Close it again: an open Radix modal aria-hides the page behind it.
  await page.keyboard.press('Escape');
  // Queue is either rows or the empty state (or a smart empty state that
  // shows both) — any of them proves the panel loaded.
  await expect(
    page
      .locator('[data-testid="panel-appt-row"], [data-testid="panel-empty"]')
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  // Today's full schedule (attended + not-yet-attended turns).
  await expect(
    page.getByRole('heading', { name: /todos los turnos de hoy|all of today/i }),
  ).toBeVisible();
  await expect(page.getByTestId('panel-today')).toBeVisible();
});

test('secretary panel: today, follow-ups, payments', async ({ page }) => {
  await login(page, FRONT);
  await expect(page.getByTestId('secretary-panel')).toBeVisible();
  await expect(page.getByTestId('panel-add-turn')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /^hoy|today$/i }).first(),
  ).toBeVisible();
  await expect(page.getByTestId('panel-followups')).toBeVisible();
  await expect(page.getByTestId('panel-followup-late')).toBeVisible();
  await expect(page.getByTestId('panel-followup-noshow')).toBeVisible();
  await expect(page.getByTestId('panel-followup-incomplete')).toBeVisible();
  await expect(page.getByTestId('panel-payments')).toBeVisible();
});

test('admin panel: KPI cards (unchanged)', async ({ page }) => {
  await login(page, ADMIN);
  await expect(page.getByTestId('admin-panel')).toBeVisible();
  await expect(page.getByText(/pacientes activos|active patients/i)).toBeVisible();
});
