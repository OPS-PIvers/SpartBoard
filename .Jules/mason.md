# Mason's Journal 🏗️

## 2026-01-20 - [Missing CI for Functions] **Bottleneck:** Backend code (functions) is not validated in PRs, risking broken deployments. **Fix:** Migrated functions to pnpm and added parallel CI job for functions build in `pr-validation.yml`.

## 2026-01-26 - [Broken Production Deploy] **Bottleneck:** Production deployment workflow was only deploying Hosting and missing Functions build/deploy, leading to config drift and potential runtime errors. **Fix:** Updated `firebase-deploy.yml` to install function deps, build functions, and deploy all targets using `firebase-tools` with a service account.

## 2026-01-30 - [Build Scripts & Chunk Optimization] **Bottleneck:** Missing convenience scripts for full-stack build caused friction; large chunk warnings in build output. **Fix:** Added `install:all`, `build:all` scripts and optimized `vite.config.ts` manual chunks.

## 2026-02-05 - [E2E Speed & Deploy Safety] **Bottleneck:** E2E tests were slow due to re-downloading Playwright browsers on every run. **Fix:** Added caching for Playwright binaries in `pr-validation.yml`. **Bottleneck:** Production deploy pipeline lacked tests. **Fix:** Added `pnpm test` step to `firebase-deploy.yml` to prevent broken code from shipping.

## 2026-02-06 - [Strict Backend Validation] **Bottleneck:** Cloud functions were excluded from strict type-checking and linting, allowing `any` types and potential runtime errors to slip through. **Fix:** Updated `eslint.config.js` to enforce strict rules on `functions/`, fixed all resulting type errors in `index.ts`, and patched `vitest.config.ts` to include backend tests.

## 2026-02-10 - [Build Warnings & Optimal Code Splitting] **Bottleneck:** `vite build` produced large chunk size warnings due to grouping all icons into a single `icons` chunk, bundling all Firebase packages together, and exceeding the 500kB warning limit for inherently large dependencies (e.g. `ort-wasm`). **Fix:** Removed the explicit `icons` chunk to let Rollup optimize `lucide-react` dynamically, added granular chunk splitting for Firebase modules (`firebase/firestore`, `firebase/auth`, `firebase/storage`), and increased `chunkSizeWarningLimit` to 1000 in `vite.config.ts`.

## 2026-03-08 - [DRY GitHub Actions] **Bottleneck:** Repeated setup boilerplate across multiple CI jobs (Node.js setup, pnpm install) slowed down workflow authoring and increased maintenance overhead. **Fix:** Consolidated setup steps into a single composite action at `.github/actions/setup/action.yml` to enforce DRY principles.

## 2026-03-09 - [Loose Infrastructure Constraints] **Bottleneck:** The project lacked strict version enforcement for Node/pnpm at the root level, and `.gitignore` missed sensitive certificates (`*.pem`, `*.key`) potentially leading to secret leaks and 'works on my machine' build issues. **Fix:** Added strict `engines` block to `package.json` to enforce Node 20+ and pnpm 10+, and secured `.gitignore` by ignoring all standard certificate and private key formats.

## 2026-03-09 - [Broken Dev Preview Deploy] **Bottleneck:** Dev preview deployment workflow (`firebase-dev-deploy.yml`) was only deploying Hosting and missing Functions build/deploy, leading to config drift and broken backend interactions in preview channels. **Fix:** Updated `firebase-dev-deploy.yml` to deploy all targets (`functions,firestore,storage`) and use the correct service account, matching production deployment standards.

## 2026-03-11 - [ESLint Type Resolution Failure] **Bottleneck:** `typescript-eslint`'s `projectService: true` failed to resolve types for cloud function dependencies (like `google-auth-library`), causing `@typescript-eslint/no-unsafe-*` errors and breaking the validation pipeline. **Fix:** Replaced `projectService: true` with an explicit `project: ['./tsconfig.json', './functions/tsconfig.json']` array in `eslint.config.js` to ensure the linter correctly parses and resolves types for both the frontend root and the `functions/` subdirectory.

## 2026-03-12 - [Strict Versioning and Cleanup] **Bottleneck:** Loose pnpm version constraint in CI led to broken builds, and .gitignore concatenated entries. **Fix:** Centralized pnpm version enforcement via the root `package.json` (engines/packageManager) used by CI, and separated `.gitignore` entries for clarity.

## 2026-03-22 - [Incomplete Validation] **Bottleneck:** The validate script did not type-check the cloud functions directory, allowing potential backend typescript errors to be merged despite passing CI. **Fix:** Updated the `validate` script in `package.json` to use `type-check:all` instead of `type-check`.

## 2026-03-22 - [Docker Monorepo Sub-folder Dependencies] **Bottleneck:** Docker build was failing to install dependencies deterministically because the nested `functions/package.json` was missing from the initial `COPY` block, and the installation command didn't handle the sub-project. **Fix:** Copied `functions/package.json` and `functions/pnpm-lock.yaml` explicitly, and used `pnpm install --frozen-lockfile && pnpm -C functions install --frozen-lockfile` to install dependencies in both contexts while ignoring `functions/node_modules` in `.dockerignore`.
