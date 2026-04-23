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
        // Firestore rules tests need the Firestore emulator. Excluded from
        // the default vitest run (`pnpm test`) so a dev doesn't need Java
        // installed locally; they run via `pnpm test:rules` (which wraps
        // them in `firebase emulators:exec --only firestore`). CI runs
        // them as a dedicated job — see `.github/workflows/pr-validation.yml`
        // (the `rules` job).
        'tests/rules/**',
        'functions/**',
        '.claude/worktrees/**',
      ],
      coverage: { exclude: ['locales/**'] },
    },
  })
);
