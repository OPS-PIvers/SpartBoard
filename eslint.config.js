import { fileURLToPath } from 'url';
import { dirname } from 'path';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      'dist',
      // SSR prerender build output (gitignored, same as `dist`). Generated
      // by the prerender step; never linted as source.
      'dist-ssr',
      'node_modules',
      '**/*.config.js',
      '**/*.config.ts',
      'scripts',
      // `functions/` is linted by its own pass (functions/eslint.config.mjs,
      // run via `pnpm run lint:functions`). Keeping it OUT of this root pass
      // is deliberate: a single type-aware ESLint run that loads BOTH the root
      // and functions TS programs into one process needed a 6GB Node heap to
      // avoid OOM in CI. Splitting into two processes (root here, functions in
      // its own config) means peak heap is bounded by the larger single
      // program, not the sum of both. Rule coverage is unchanged — see
      // functions/eslint.config.mjs, which reapplies the same base rule sets
      // (js.configs.recommended + tseslint recommendedTypeChecked + the
      // functions-specific overrides) that previously applied to these files.
      'functions',
      // `remotion/` is an optional self-contained sub-package (own
      // tsconfig + package.json) for rendering demo videos. Not part of
      // the main app's TypeScript project.
      'remotion',
      'coverage',
      '.agents',
      '.gemini',
      // .claude is gitignored but ESLint scans the filesystem regardless;
      // stale Claude Code worktrees inside .claude/worktrees/ trip the
      // typescript-eslint parser ("file not found in any provided project")
      // because their files aren't in tsconfig. Ignore the whole tree.
      '.claude',
      // pnpm's content-addressed store contains hardlinks to project files
      // (e.g. .pnpm-store/v10/projects/<hash>/src/) which both ESLint and
      // Vitest will otherwise discover and double-process.
      '.pnpm-store',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
      prettier: prettierPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // React rules
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      'react/prop-types': 'off', // TypeScript handles prop validation
      'react/react-in-jsx-scope': 'off', // Not needed in React 19
      'react/jsx-no-target-blank': 'error',

      // React Hooks rules
      ...reactHooksPlugin.configs.recommended.rules,

      // React Refresh rules
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // TypeScript strict rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'warn',
        {
          allowNumber: true,
          allowBoolean: true,
          allowNullish: true,
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',

      // General code quality
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      // expect.objectContaining / expect.stringContaining return `any`;
      // nesting them inside matchers is standard Vitest/Jest practice.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // D4 (Import Path Convention) enforcement: a file under a
    // components/plc/<subdir>/ directory must not reach across into a
    // SIBLING plc subdirectory (or the shared `plc/sections` module) via a
    // relative import — use the `@/components/plc/<dir>/...` alias instead.
    // This exact bug class recurred across many nightly unifier runs (see
    // docs/routines/unifier.md D4 section — runs 6, 7, 17, 18, 26, 28).
    // Root-level `components/plc/*.tsx` files (e.g. importing
    // '../PlcAssignmentImportModal' from `plc/bodies/` or `plc/tabs/`) are
    // an intentionally-preserved gray zone (D4-E2) and are NOT matched by
    // this pattern, since it only fires when the segment immediately after
    // the last '../' is itself a plc subdirectory name (or `sections`, the
    // module at the center of the recurring bug).
    files: ['components/plc/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(\\.\\./)+(activity|assignments|authoring|bodies|comments|docs|home|meeting|members|presence|resources|search|sections|settings|sharedBoards|sharedData|sync|tabs|versions|viewer)(/.*)?$',
              caseSensitive: true,
              message:
                "Cross-subdirectory plc import — use '@/components/plc/<dir>/...' instead of a relative path that escapes this subdirectory (see D4 in docs/routines/unifier.md).",
            },
          ],
        },
      ],
    },
  },
  {
    // D4 (Import Path Convention) enforcement: a file under any
    // components/widgets/<WidgetDir>/ directory must not reach across into
    // the SIBLING `components/widgets/math-tools/` shared tool-implementation
    // directory via a relative import — use the
    // `@/components/widgets/math-tools/...` alias instead. This is the same
    // recurring cross-subdirectory-relative-import bug class already guarded
    // for `components/plc/**` above; found here in `MathToolInstance/` (which
    // used '../math-tools/...') while its sibling `MathTools/` already used
    // the canonical alias for the identical module. `'../WidgetLayout'` from
    // inside a widget subfolder (a root-level shared file, not a sibling
    // feature directory) is an intentionally-preserved gray zone (D4-E2) and
    // is NOT matched by this pattern.
    files: ['components/widgets/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+math-tools(/.*)?$',
              caseSensitive: true,
              message:
                "Cross-subdirectory widgets import — use '@/components/widgets/math-tools/...' instead of a relative path that escapes this widget's own directory (see D4 in docs/routines/unifier.md).",
            },
          ],
        },
      ],
    },
  },
  {
    // D4 (Import Path Convention) enforcement: a file under
    // components/admin/Organization/views/ must not reach across into a
    // SIBLING Organization-level directory/module (`components/`, `lib/`,
    // or `types.ts`) via a relative import — use the
    // `@/components/admin/Organization/...` alias instead. This is the same
    // recurring cross-subdirectory-relative-import bug class already
    // guarded for `components/plc/**` and `components/widgets/**` above;
    // found here as 7 files in `views/` still using '../types' even though
    // a prior fix (#2169) already converted their sibling
    // `components/primitives` import to the `@/` alias in the same files.
    files: ['components/admin/Organization/views/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+(components|lib|types)(/.*)?$',
              caseSensitive: true,
              message:
                "Cross-subdirectory Organization import — use '@/components/admin/Organization/...' instead of a relative path that escapes this view's own directory (see D4 in docs/routines/unifier.md).",
            },
          ],
        },
      ],
    },
  },
  prettierConfig
);
