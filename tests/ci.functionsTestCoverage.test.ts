/**
 * Regression test: deploy workflows must run the functions test suite.
 *
 * Bug: `firebase-deploy.yml` (production) and `firebase-dev-deploy.yml` (dev
 * preview) ran only `pnpm test` (root tests) in their test steps, skipping
 * `pnpm -C functions test` entirely. Because the PR-validation workflow uses
 * `pnpm run test:all` (which covers both root AND functions), broken functions
 * tests could pass PR validation and still be deployed — they just happened
 * not to break on any recently-merged PR. A direct push to `main` or a
 * `workflow_dispatch` (which bypasses the PR flow completely) would deploy
 * functions with broken tests immediately.
 *
 * Fix: each deploy workflow's test step must invoke `pnpm run test:all` (or
 * otherwise ensure `pnpm -C functions run test` is executed) so functions
 * regressions block deployment the same way they block PR merges.
 *
 * This test reads the YAML files as plain text and asserts the presence of the
 * functions test invocation, providing a fast, hermetic CI-config guard that
 * doesn't require running the workflows themselves.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowsDir = resolve(__dirname, '../.github/workflows');

function readWorkflow(name: string): string {
  return readFileSync(resolve(workflowsDir, name), 'utf-8');
}

/**
 * Returns true when the YAML content includes an uncommented step that runs
 * the functions test suite.  Accepts either:
 *   - `pnpm run test:all`   (the canonical combined runner)
 *   - `pnpm test:all`       (shorthand)
 *   - `pnpm -C functions`   (direct functions invocation)
 *
 * Lines starting with '#' are skipped to avoid false positives from
 * commented-out commands or descriptive prose.
 */
function includesFunctionsTests(yaml: string): boolean {
  return yaml.split('\n').some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return false;
    return (
      trimmed.includes('pnpm run test:all') ||
      trimmed.includes('pnpm test:all') ||
      trimmed.includes('pnpm -C functions')
    );
  });
}

describe('CI workflow: functions tests must run in deploy pipelines', () => {
  it('firebase-deploy.yml (production) runs the functions test suite', () => {
    const yaml = readWorkflow('firebase-deploy.yml');
    expect(includesFunctionsTests(yaml)).toBe(true);
  });

  it('firebase-dev-deploy.yml (dev preview) runs the functions test suite', () => {
    const yaml = readWorkflow('firebase-dev-deploy.yml');
    expect(includesFunctionsTests(yaml)).toBe(true);
  });

  it('pr-validation.yml already runs the functions test suite (baseline)', () => {
    // This is the reference that was already correct — pin it so a future
    // "simplification" of pr-validation.yml can't silently regress it.
    const yaml = readWorkflow('pr-validation.yml');
    expect(includesFunctionsTests(yaml)).toBe(true);
  });
});
