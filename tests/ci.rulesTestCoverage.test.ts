/**
 * Regression test: deploy workflows must run the Firestore rules test suite.
 *
 * Bug: `firebase-deploy.yml` (production) and `firebase-dev-deploy.yml` (dev
 * preview) both run `pnpm run test:all` before deploying, but `test:all` does
 * NOT include `pnpm run test:rules` (see package.json — `test:rules` is a
 * separate script that spins up the Firestore emulator via
 * `firebase emulators:exec`, run only by pr-validation.yml's dedicated `rules`
 * job). Neither deploy workflow's "Deploy Firebase Rules, Indexes, Functions,
 * Storage" step is gated on it. A `firestore.rules` regression that PR
 * validation would have caught can still reach production: any push to `main`
 * that skips or bypasses the PR flow (a direct admin push, or a
 * `workflow_dispatch` re-run) deploys the rules file completely unverified
 * against the emulator. Same bug class as the already-fixed
 * ci.functionsTestCoverage.test.ts gap, one CI layer over: that test guards
 * `test:all` reaching deploy; this one guards `test:rules` reaching deploy.
 *
 * Fix: each deploy workflow must run `pnpm run test:rules` (which requires a
 * JDK for the Firestore emulator) before its "Deploy Firebase Rules..." step.
 *
 * This test reads the YAML files as plain text and asserts the presence of
 * the rules-test invocation, providing a fast, hermetic CI-config guard that
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
 * the Firestore rules test suite (`pnpm run test:rules` / `pnpm test:rules`).
 * Lines starting with '#' are skipped to avoid false positives from
 * commented-out commands or descriptive prose.
 */
function includesRulesTests(yaml: string): boolean {
  return yaml.split('\n').some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return false;
    return (
      trimmed.includes('pnpm run test:rules') ||
      trimmed.includes('pnpm test:rules')
    );
  });
}

/** Returns the 0-based line index of the first uncommented match, or -1. */
function firstMatchIndex(
  yaml: string,
  predicate: (line: string) => boolean
): number {
  const lines = yaml.split('\n');
  return lines.findIndex((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return false;
    return predicate(trimmed);
  });
}

/**
 * Returns the `needs:` array entries for a top-level job (2-space-indented
 * `<jobName>:` block), or null if the job or its `needs:` line isn't found.
 * Line-order alone doesn't prove a multi-job workflow's dependency graph —
 * two job blocks can sit in any order and still be wired via `needs:`, so
 * an ordering check on job BLOCK POSITION says nothing about whether one
 * job actually gates the other. This walks the actual `needs:` array.
 */
function jobNeeds(yaml: string, jobName: string): string[] | null {
  const lines = yaml.split('\n');
  const jobStart = lines.findIndex(
    (l) => l.trim() === `${jobName}:` && /^ {2}\S/.test(l)
  );
  if (jobStart === -1) return null;
  const nextJobStart = lines.findIndex(
    (l, i) => i > jobStart && /^ {2}\S.*:\s*$/.test(l)
  );
  const blockEnd = nextJobStart === -1 ? lines.length : nextJobStart;
  const needsLine = lines
    .slice(jobStart, blockEnd)
    .find((l) => /^\s*needs:/.test(l));
  if (!needsLine) return null;
  const match = needsLine.match(/needs:\s*\[(.*)\]/);
  if (!match) return null;
  return match[1].split(',').map((s) => s.trim());
}

describe('CI workflow: Firestore rules tests must run in deploy pipelines', () => {
  it('firebase-deploy.yml (production) runs the Firestore rules test suite before deploying rules', () => {
    const yaml = readWorkflow('firebase-deploy.yml');
    expect(includesRulesTests(yaml)).toBe(true);

    const rulesTestLine = firstMatchIndex(yaml, (l) =>
      l.includes('pnpm run test:rules')
    );
    const deployLine = firstMatchIndex(yaml, (l) =>
      l.includes('Deploy Firebase Rules, Indexes, Functions, Storage')
    );
    expect(deployLine).toBeGreaterThan(-1);
    expect(rulesTestLine).toBeGreaterThan(-1);
    expect(rulesTestLine).toBeLessThan(deployLine);
  });

  it('firebase-dev-deploy.yml (dev preview) runs the Firestore rules test suite before deploying rules', () => {
    const yaml = readWorkflow('firebase-dev-deploy.yml');
    expect(includesRulesTests(yaml)).toBe(true);

    const rulesTestLine = firstMatchIndex(yaml, (l) =>
      l.includes('pnpm run test:rules')
    );
    const deployLine = firstMatchIndex(yaml, (l) =>
      l.includes('Deploy Firebase Rules, Indexes, Functions, Storage')
    );
    expect(deployLine).toBeGreaterThan(-1);
    expect(rulesTestLine).toBeGreaterThan(-1);
    expect(rulesTestLine).toBeLessThan(deployLine);

    // Line order alone doesn't prove dependency for a multi-job workflow — assert the actual needs: wiring.
    expect(jobNeeds(yaml, 'deploy')).toContain('rules');
  });

  it('pr-validation.yml already runs the Firestore rules test suite (baseline)', () => {
    // Reference that was already correct — pin it so a future
    // "simplification" of pr-validation.yml can't silently regress it.
    const yaml = readWorkflow('pr-validation.yml');
    expect(includesRulesTests(yaml)).toBe(true);
  });
});
