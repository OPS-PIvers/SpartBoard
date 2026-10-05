import { defineConfig, devices } from '@playwright/test';

// Widget grader measurer (scripts/widget-grader/measure); separate from the E2E config so that job is untouched.
const PORT = Number(process.env.GRADER_PORT ?? 3100);
const DUMMY_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_OPENWEATHER_API_KEY',
];

export default defineConfig({
  testDir: './scripts/widget-grader/measure',
  testMatch: '**/*.pw.ts',
  timeout: 10 * 60 * 1000,
  fullyParallel: true,
  workers: Number(process.env.GRADER_WORKERS ?? 3),
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    launchOptions: process.env.GRADER_CHROMIUM
      ? { executablePath: process.env.GRADER_CHROMIUM }
      : {},
  },
  webServer: {
    // A built preview serves bundled chunks; the dev server's unbundled modules exhaust the browser under parallel workers.
    command:
      process.env.CI || process.env.GRADER_BUILD
        ? `node scripts/generate-version.js && pnpm exec vite build --outDir dist-grader --manifest && pnpm exec vite preview --outDir dist-grader --port ${PORT} --strictPort`
        : `node scripts/generate-version.js && pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/widget-grader-dev?type=clock`,
    reuseExistingServer: !process.env.CI,
    timeout: 600 * 1000,
    env: {
      ...Object.fromEntries(DUMMY_ENV.map((k) => [k, 'dummy'])),
      VITE_AUTH_BYPASS: 'true',
      GRADER_PROFILE: '1',
    },
  },
});
