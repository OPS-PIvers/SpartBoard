/**
 * Regression test: type-aware ESLint concurrency must not be combined with a
 * NODE_OPTIONS memory bump that assumes it applies per worker thread.
 *
 * Bug (introduced by #2864): CI enabled `eslint --concurrency=2` for the root
 * app's type-aware lint pass while keeping
 * `NODE_OPTIONS=--max-old-space-size=5120`, reasoning "2 workers fit the
 * 16GB runner" — i.e. assuming each of the 2 worker threads gets its own
 * 5120MB heap. They don't: node_modules/eslint/lib/eslint/eslint.js's
 * `runWorkers()` spawns each lint worker as
 * `new Worker(workerURL, { env: SHARE_ENV, workerData })` — no
 * `resourceLimits` — so every worker gets Node's own default
 * `maxOldGenerationSizeMb`, which the first test below proves is fixed
 * independently of the parent process's `--max-old-space-size`/NODE_OPTIONS
 * setting. eslint.config.js's own comment says the root app's type-aware TS
 * program needs ~4.5GB. Any worker that touches it hits its real, unraised
 * ceiling and gets killed ("Worker terminated due to reaching memory
 * limit"), turning a lint job that reliably finished single-threaded into
 * one that can intermittently OOM under concurrency — a reliability
 * regression, not the speedup the change intended.
 *
 * Fix: don't pass --concurrency to the type-aware root lint pass.
 * NODE_OPTIONS only ever helps the one (main-thread) process that actually
 * holds the TS program; concurrency defeats it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function readWorkflow(name: string): string {
  return readFileSync(resolve(repoRoot, '.github/workflows', name), 'utf-8');
}

// The uncommented `pnpm run lint:app` invocation line (exactly one per workflow).
function lintAppLine(yaml: string): string | undefined {
  return yaml
    .split('\n')
    .map((l) => l.trim())
    .find((l) => !l.startsWith('#') && l.includes('pnpm run lint:app'));
}

describe('Node worker_threads do not inherit the parent --max-old-space-size (empirical)', () => {
  it('a worker spawned the way ESLint spawns lint workers ignores the raised parent heap flag', () => {
    // Mirrors eslint.js's runWorkers(): `new Worker(url, { env: SHARE_ENV })`, no resourceLimits.
    const probe = resolve(__dirname, 'fixtures/eslintWorkerMemoryProbe.mjs');
    const bigHeapMb = 9000; // implausible as an auto-computed default on any CI runner
    const output = execFileSync(
      process.execPath,
      [`--max-old-space-size=${bigHeapMb}`, probe],
      { encoding: 'utf-8' }
    );
    const parsed = JSON.parse(output) as { maxOldGenerationSizeMb: unknown };
    const workerMaxOldGenMb = Number(parsed.maxOldGenerationSizeMb);
    expect(Number.isFinite(workerMaxOldGenMb)).toBe(true);
    // If this ever starts matching bigHeapMb, ESLint (or Node) began
    // forwarding the flag to workers and the assertions below can be relaxed.
    expect(workerMaxOldGenMb).toBeLessThan(bigHeapMb);
  });
});

describe('CI workflow: type-aware ESLint concurrency must not assume NODE_OPTIONS applies per worker', () => {
  const workflows = [
    'pr-validation.yml',
    'firebase-deploy.yml',
    'firebase-dev-deploy.yml',
  ];

  for (const name of workflows) {
    it(`${name}'s lint:app step does not pass --concurrency`, () => {
      const yaml = readWorkflow(name);
      const line = lintAppLine(yaml);
      expect(
        line,
        `expected a 'pnpm run lint:app' step in ${name}`
      ).toBeTruthy();
      expect(line).not.toMatch(/--concurrency/);
    });
  }
});
