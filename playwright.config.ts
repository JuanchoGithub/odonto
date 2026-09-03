import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npx next start -p 3000',
        url: 'http://localhost:3000/login',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: process.env.CI ? 'ignore' : 'pipe',
        stderr: process.env.CI ? 'ignore' : 'pipe',
        env: {
          TURSO_URL: process.env.TURSO_URL ?? 'file:./.e2e.db',
          TURSO_TOKEN: process.env.TURSO_TOKEN ?? '',
          AUTH_SECRET:
            process.env.AUTH_SECRET ??
            'e2e-secret-not-used-for-real-auth-placeholder-32chars',
          AUTH_URL: process.env.AUTH_URL ?? 'http://localhost:3000',
        },
      },
});
