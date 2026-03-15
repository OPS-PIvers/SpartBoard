import { defineConfig, devices } from '@playwright/test';

const WEBSERVER_TIMEOUT = 120 * 1000;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: process.env.CI ? 120000 : 30000,
  expect: {
    timeout: process.env.CI ? 30000 : 10000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm run build && pnpm run preview' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: WEBSERVER_TIMEOUT,
    env: {
      VITE_FIREBASE_API_KEY: 'dummy',
      VITE_FIREBASE_AUTH_DOMAIN: 'dummy',
      VITE_FIREBASE_PROJECT_ID: 'dummy',
      VITE_FIREBASE_STORAGE_BUCKET: 'dummy',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'dummy',
      VITE_FIREBASE_APP_ID: 'dummy',
      VITE_AUTH_BYPASS: 'true',
    },
  },
});
