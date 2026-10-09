import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['iPhone 13 Mini'],
    viewport: { width: 375, height: 812 },
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173/batcave-reader/',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.BATCAVE_CHROMIUM
      ? {
          executablePath: process.env.BATCAVE_CHROMIUM,
          args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        }
      : {},
  },
  webServer: {
    command: 'node scripts/qa-server.mjs',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
