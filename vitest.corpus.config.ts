// Private quiz import corpus (docs/plans/shipped/QUIZ_IMPORT_RELIABILITY.md R27); run by `pnpm run test:import-corpus`, never in CI.
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setTz.ts', './tests/setup.ts'],
      include: ['tests/importCorpus/**/*.test.ts'],
    },
  })
);
