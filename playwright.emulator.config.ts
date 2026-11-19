import { defineConfig, devices } from '@playwright/test';

// Browser tests that need a working backend: run through `pnpm run test:e2e:emulator`, which starts the Auth and Firestore emulators.
const PORT = 56330;

export default defineConfig({
  testDir: './tests/e2e-emulator',
  timeout: process.env.CI ? 240000 : 120000,
  expect: { timeout: process.env.CI ? 30000 : 15000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1500, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1500, height: 950 },
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    env: {
      VITE_AUTH_BYPASS: 'true',
      VITE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-spartboard-e2e.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-spartboard-e2e',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-spartboard-e2e.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_APP_ID: 'demo',
      VITE_GOOGLE_CLIENT_ID: 'dummy',
      VITE_OPENWEATHER_API_KEY: 'dummy',
    },
  },
});
