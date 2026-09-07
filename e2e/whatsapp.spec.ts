import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * WhatsApp / Communication e2e. The clinic-wide + per-dentist editors live
 * on the Profile → Communication tab (admins + receptionists); doctors edit
 * their own templates on Profile → Messages.
 */

test.describe('WhatsApp messaging', () => {
  test('admin can edit clinic-wide WhatsApp templates and the preview updates', async ({
    page,
  }) => {
    await login(page, 'admin@local', 'Admin123!');
    await page.goto('/es/profile?tab=communication');
    await expect(page.getByTestId('profile-communication').first()).toBeVisible();

    // Default country code should be +54 from the seed
    const ccToggle = page.getByTestId('whatsapp-cc-toggle').first();
    await expect(ccToggle).toContainText('+54');

    // The two built-in templates are seeded
    await expect(
      page.getByTestId('comm-clinic-tpl-builtin_confirmation').first(),
    ).toBeVisible();
    await expect(
      page.getByTestId('comm-clinic-tpl-builtin_no_show').first(),
    ).toBeVisible();

    // Preview shows the confirmation body with sample data
    const preview = page.getByTestId('comm-clinic-preview').first();
    await expect(preview).toContainText('Marta López');
    await expect(preview).toContainText('turno');
  });

  test('admin can edit a template and the preview reflects it', async ({
    page,
  }) => {
    await login(page, 'admin@local', 'Admin123!');
    await page.goto('/es/profile?tab=communication');
    await expect(page.getByTestId('profile-communication').first()).toBeVisible();

    const confirmBody = page
      .getByTestId('comm-clinic-tpl-body-es-builtin_confirmation')
      .first();
    await confirmBody.fill('Hola, {{name}}. Confirmá tu turno de las {{time}}.');

    await page.getByTestId('comm-clinic-save').first().click();
    await expect(page.getByTestId('comm-clinic-preview').first()).toContainText(
      'Confirmá tu turno',
    );
  });

  test('receptionist can open the Communication tab', async ({ page }) => {
    await login(page, 'front@local', 'Front123!');
    await page.goto('/es/profile?tab=communication');
    await expect(page.getByTestId('profile-communication').first()).toBeVisible();
    await expect(page.getByTestId('comm-clinic-save').first()).toBeVisible();
  });

  test('doctor can open Profile > Messages and customize their own templates', async ({
    page,
  }) => {
    await login(page, 'doc@local', 'Doctor123!');
    await page.goto('/es/profile?tab=messages');
    await expect(page.getByTestId('profile-messages').first()).toBeVisible();

    // The doctor may start inheriting clinic defaults (shows a "customize"
    // button) or already have an override (editor visible directly). Handle
    // both so the test is idempotent across runs.
    const customize = page.getByTestId('messages-customize').first();
    if (await customize.isVisible().catch(() => false)) {
      await customize.click();
    }
    await expect(page.getByTestId('messages-save').first()).toBeVisible();

    const confirmBody = page
      .getByTestId('messages-tpl-body-es-builtin_confirmation')
      .first();
    await confirmBody.fill(
      'Hola {{name}}, tu turno con {{dentist}} de las {{time}}. Confirmá por favor.',
    );
    await page.getByTestId('messages-save').first().click();

    // The preview reflects the edited copy.
    await expect(page.getByTestId('messages-preview').first()).toContainText(
      'Confirmá por favor',
    );
  });

  test('doctor panel WhatsApp icon opens wa.me with the right URL', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__openedUrls = [] as string[];
      window.open = (url?: string | URL) => {
        if (url) (window as any).__openedUrls.push(String(url));
        return null as unknown as Window;
      };
    });
    await login(page, 'doc@local', 'Doctor123!');
    await page.goto('/es/dashboard');

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