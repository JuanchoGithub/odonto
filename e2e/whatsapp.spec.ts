import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Helpers
 *
 * `installWindowOpenSpy` patches `window.open` before any page script runs,
 * so the test can capture the wa.me URL the WhatsApp button would have
 * navigated to (we can't actually open wa.me in tests — it leaves the
 * app and the real WhatsApp site requires network).
 */

async function installWindowOpenSpy(page: Page) {
  await page.addInitScript(() => {
    (window as any).__openedUrls = [] as string[];
    const orig = window.open;
    window.open = (url?: string | URL, _target?: string, _features?: string) => {
      if (url) (window as any).__openedUrls.push(String(url));
      return null as unknown as Window;
    };
    void orig;
  });
}

async function lastOpenedUrl(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const arr = (window as any).__openedUrls as string[] | undefined;
    return arr && arr.length > 0 ? arr[arr.length - 1] : null;
  });
}

test.describe('WhatsApp messaging', () => {
  test('admin can edit WhatsApp settings and the preview updates', async ({
    page,
  }) => {
    await login(page, 'admin@local', 'Admin123!');
    await page.goto('/es/settings');
    await expect(page.getByTestId('whatsapp-settings').first()).toBeVisible();

    // Default country code should be +54 from the seed
    const ccToggle = page.getByTestId('whatsapp-cc-toggle').first();
    await expect(ccToggle).toContainText('+54');

    // The two built-in templates are seeded
    await expect(
      page.getByTestId('whatsapp-tpl-builtin_confirmation').first(),
    ).toBeVisible();
    await expect(
      page.getByTestId('whatsapp-tpl-builtin_no_show').first(),
    ).toBeVisible();

    // Preview shows the confirmation body with sample data
    const preview = page.getByTestId('whatsapp-preview').first();
    await expect(preview).toContainText('Marta López');
    await expect(preview).toContainText('turno');
  });

  test('admin can save a custom template and the preview reflects it', async ({
    page,
  }) => {
    await login(page, 'admin@local', 'Admin123!');
    await page.goto('/es/settings');
    await expect(page.getByTestId('whatsapp-settings').first()).toBeVisible();

    // Edit the built-in confirmation so the preview shows the new copy.
    const noShowBody = page
      .getByTestId('whatsapp-tpl-body-es-builtin_confirmation')
      .first();
    await noShowBody.fill('Hola, {{name}}. Confirmá tu turno de las {{time}}.');

    await page.getByTestId('whatsapp-save').first().click();
    // Preview should reflect the new copy
    await expect(page.getByTestId('whatsapp-preview').first()).toContainText(
      'Confirmá tu turno',
    );
  });

  test('doctor panel WhatsApp icon opens wa.me with the right URL', async ({
    page,
  }) => {
    await installWindowOpenSpy(page);
    await login(page, 'doc@local', 'Doctor123!');
    await page.goto('/es/dashboard');

    // The doctor panel renders a no-appointments empty state when the
    // DB has no future turns. Use the role-specific test from
    // dashboard-roles.spec.ts to see what state the seeded DB is in;
    // here we just verify the WhatsApp icon shape if any row exists.
    const row = page.getByTestId('panel-appt-row').first();
    if (!(await row.count())) {
      test.skip(true, 'No future appointments in seeded DB');
    }
    const waBtn = row.getByTestId(/^panel-whatsapp-/);
    if (!(await waBtn.count())) {
      test.skip(true, 'No phone on the first panel row');
    }
    const href = await waBtn.getAttribute('href');
    expect(href).not.toBeNull();
    expect(href!).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    const decoded = decodeURIComponent(href!.split('text=')[1] ?? '');
    expect(decoded).toMatch(/(turno|appointment)/i);
  });
});
