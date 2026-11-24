// Firestore rules test config — runs only the tests/rules/** suite against a
// running Firestore emulator. Invoked by `pnpm run test:rules` which wraps
// this in `firebase emulators:exec --only firestore`.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const RULES_DIR = fileURLToPath(new URL('./tests/rules', import.meta.url));

// Storage emulator rules are global, so suites that load them run one file at a time.
const storageSuites = readdirSync(RULES_DIR)
  .filter((name) => name.endsWith('.test.ts'))
  .filter((name) =>
    /storage:\s*\{/.test(readFileSync(`${RULES_DIR}/${name}`, 'utf8'))
  )
  .map((name) => `tests/rules/${name}`);

export default defineConfig({
  // Lets a rules test import the pure transition modules it checks the rules against.
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    // No jsdom / React setup — these tests talk directly to the Firestore
    // emulator using @firebase/rules-unit-testing.
    projects: [
      {
        extends: true,
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          exclude: storageSuites,
        },
      },
      {
        extends: true,
        test: {
          name: 'rules-storage',
          include: storageSuites,
          fileParallelism: false,
        },
      },
    ],
  },
});
