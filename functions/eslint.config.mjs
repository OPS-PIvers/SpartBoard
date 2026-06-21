import { fileURLToPath } from 'url';
import { dirname } from 'path';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dedicated ESLint pass for the `functions/` Cloud Functions package.
//
// Why a separate config/process? The root `eslint.config.js` previously loaded
// BOTH the root and functions TypeScript programs into a single type-aware
// ESLint run, which needed `NODE_OPTIONS=--max-old-space-size=6144` in CI to
// avoid OOM. Linting `functions/` in its own process (via
// `pnpm run lint:functions`) keeps only the (small) functions TS program in
// memory for this pass and only the root program for the root pass, so peak
// heap is bounded by the larger single program rather than their sum.
//
// Rule coverage is intentionally identical to what these files received under
// the old monolithic config: js.configs.recommended + typescript-eslint's
// recommendedTypeChecked + Node globals + `no-console: off`, with
// eslint-config-prettier applied last to disable stylistic rules. (The old
// config also "turned off" a couple of React rules for functions, but those
// plugins were never registered for functions files, so those entries were
// no-ops and are omitted here.)
export default tseslint.config(
  {
    // Only `src/` is part of the functions TS program (tsconfig `include: ["src"]`).
    // Everything else (compiled `lib/`, this flat config, vitest config, etc.)
    // must stay out of the type-aware pass or the parser errors with
    // "not found in any provided project".
    ignores: [
      '**/lib/**',
      '**/node_modules/**',
      // One-off ops scripts (e.g. run-migrate-plcs.cjs) aren't part of the
      // `src/` TS program, so keep them out of the type-aware pass.
      '**/scripts/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  prettierConfig
);
