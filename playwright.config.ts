import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4186',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome-blocked',
      testMatch: '**/actions.spec.ts',
      use: { browserName: 'chromium', channel: 'chrome' },
    },
    { name: 'firefox-blocked', testMatch: '**/actions.spec.ts', use: { browserName: 'firefox' } },
    {
      name: 'chrome-allowed',
      testMatch: '**/allowed.spec.ts',
      use: { browserName: 'chromium', channel: 'chrome', launchOptions: { ignoreDefaultArgs: [] } },
    },
    {
      name: 'firefox-allowed',
      testMatch: '**/allowed.spec.ts',
      use: {
        browserName: 'firefox',
        launchOptions: { firefoxUserPrefs: { 'dom.disable_open_during_load': false } },
      },
    },
  ],
  webServer: {
    command: 'node --import tsx tests/browser/server.ts',
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: false,
  },
});
