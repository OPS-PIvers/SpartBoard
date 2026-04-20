// Firestore rules test config — runs only the tests/rules/** suite against a
// running Firestore emulator. Invoked by `pnpm run test:rules` which wraps
// this in `firebase emulators:exec --only firestore`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    // No jsdom / React setup — these tests talk directly to the Firestore
    // emulator using @firebase/rules-unit-testing.
  },
});
