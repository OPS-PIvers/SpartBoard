import { defineConfig, mergeConfig, configDefaults } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      // setTz.ts pins process.env.TZ = 'UTC' with no imports, so it must run
      // BEFORE setup.ts (whose import statements would otherwise be hoisted
      // above any TZ assignment in the same file).
      setupFiles: ['./tests/setTz.ts', './tests/setup.ts'],
      exclude: [
        ...configDefaults.exclude,
        'tests/e2e/**',
        // Firestore rules tests need the Firestore emulator; they run via
        // the `test:rules` script under `firebase emulators:exec`. Excluded
        // from the default vitest run so `pnpm test` / CI stays green
        // without an emulator.
        'tests/rules/**',
        'functions/**',
        '.claude/worktrees/**',
      ],
      coverage: { exclude: ['locales/**'] },
    },
  })
);
