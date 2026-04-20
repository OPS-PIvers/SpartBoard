import { defineConfig, mergeConfig, configDefaults } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
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
