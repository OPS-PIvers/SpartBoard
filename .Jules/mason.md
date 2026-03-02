# Mason's Journal 🏗️

## 2026-01-20 - [Missing CI for Functions] **Bottleneck:** Backend code (functions) is not validated in PRs, risking broken deployments. **Fix:** Migrated functions to pnpm and added parallel CI job for functions build in `pr-validation.yml`.

## 2026-01-26 - [Broken Production Deploy] **Bottleneck:** Production deployment workflow was only deploying Hosting and missing Functions build/deploy, leading to config drift and potential runtime errors. **Fix:** Updated `firebase-deploy.yml` to install function deps, build functions, and deploy all targets using `firebase-tools` with a service account.

## 2026-01-30 - [Build Scripts & Chunk Optimization] **Bottleneck:** Missing convenience scripts for full-stack build caused friction; large chunk warnings in build output. **Fix:** Added `install:all`, `build:all` scripts and optimized `vite.config.ts` manual chunks.

## 2026-02-05 - [E2E Speed & Deploy Safety] **Bottleneck:** E2E tests were slow due to re-downloading Playwright browsers on every run. **Fix:** Added caching for Playwright binaries in `pr-validation.yml`. **Bottleneck:** Production deploy pipeline lacked tests. **Fix:** Added `pnpm test` step to `firebase-deploy.yml` to prevent broken code from shipping.
