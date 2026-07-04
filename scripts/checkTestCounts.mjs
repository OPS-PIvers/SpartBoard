#!/usr/bin/env node
/**
 * Guard against silently-omitted Vitest test suites.
 *
 * BACKGROUND (see docs/routines/debugger.md, #2047 / backlog "CI guard for
 * crash-at-import test suites"): when a `functions/` test file throws (or
 * fails to resolve an import) *during Vitest's collection step*, the current
 * Vitest version (v4.1.8) already fails loudly for that file — it reports
 * "Test Files N failed" and exits non-zero. That part is NOT the gap.
 *
 * The gap this script closes is different and still live: a test file can
 * become *completely invisible* to Vitest's collector — e.g. a typo'd
 * extension (`foo.test.ts` -> `foo.testx.ts`), a glob/`exclude` pattern that
 * grows too broad, or a whole `describe` block wrapped behind a disabled
 * feature flag — with ZERO error and exit code 0. Vitest has nothing to
 * report because, as far as it's concerned, that file never existed. The
 * suite quietly shrinks and CI stays green.
 *
 * Reproduced empirically (2026-07-04, this repo, real node_modules):
 *   - A file that throws at import time: `vitest run` exits 1, prints
 *     "FAIL ... (0 test)" / "Test Files 1 failed". Already caught today.
 *   - `functions/src/sanitize.test.ts` renamed to `sanitize.testx.ts`:
 *     `vitest run` exits 0, "Test Files 36 passed (36)" / "Tests 696 passed
 *     (696)" — down from the true baseline of 37 files / 703 tests, with NO
 *     failure signal of any kind.
 *
 * This script closes that gap with two checks against the Vitest JSON
 * reporter output (`--reporter=json --outputFile=...`), which both `pnpm
 * test` and `pnpm -C functions test` already produce as a side artifact:
 *
 *   1. Per-file: any collected file with 0 assertionResults is flagged
 *      (defense-in-depth for the crash-at-import class, in case a future
 *      Vitest/pool config change ever makes that silent again).
 *   2. Aggregate floor: total file count and total test count must not drop
 *      below the committed baseline in `scripts/test-count-baseline.json`
 *      (catches the file-goes-invisible class, which has no per-file signal
 *      to check against). Growth is always allowed; a deliberate reduction
 *      requires a conscious edit to the baseline file, mirroring the
 *      existing coverage-threshold ratchet pattern in `vitest.config.ts`.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {{ name: string, assertionResults?: unknown[], status?: string, message?: string }} VitestFileResult
 * @typedef {{ testResults?: VitestFileResult[], numTotalTests?: number }} VitestJsonReport
 * @typedef {{ testFiles: number, tests: number }} CountBaseline
 */

/**
 * Files Vitest reports on but with zero collected test cases — this is the
 * shape produced both by a synchronous throw at import time and by a file
 * containing no `describe`/`it` calls at all ("No test suite found in
 * file"). Confirmed against a synthetic fixture mirroring the exact JSON
 * shape #2047's `mirrorPlcIndex.test.ts` would have produced pre-fix.
 *
 * @param {VitestJsonReport} report
 * @returns {{ name: string, message: string }[]}
 */
export function findEmptyTestFiles(report) {
  const results = report.testResults ?? [];
  return results
    .filter((r) => (r.assertionResults?.length ?? 0) === 0)
    .map((r) => ({
      name: r.name,
      message:
        r.message || '(no tests collected — no failure message reported)',
    }));
}

/**
 * Detects the "file went invisible to the collector" class: no per-file
 * signal exists for this (the file simply never appears in `testResults`),
 * so the only observable signature is the aggregate count dropping below a
 * committed baseline.
 *
 * @param {VitestJsonReport} report
 * @param {CountBaseline} baseline
 * @returns {string[]}
 */
export function checkCountFloor(report, baseline) {
  const issues = [];
  const fileCount = (report.testResults ?? []).length;
  const testCount = report.numTotalTests ?? 0;

  if (fileCount < baseline.testFiles) {
    issues.push(
      `test file count dropped to ${fileCount} (baseline: ${baseline.testFiles}). ` +
        `A test file may have stopped being collected (renamed extension, ` +
        `broadened 'exclude' pattern, or a disabled feature flag hiding a ` +
        `whole describe block).`
    );
  }
  if (testCount < baseline.tests) {
    issues.push(
      `total test count dropped to ${testCount} (baseline: ${baseline.tests}).`
    );
  }
  return issues;
}

/**
 * @param {VitestJsonReport} report
 * @param {CountBaseline} baseline
 * @param {string} label
 * @returns {string[]}
 */
export function validateReport(report, baseline, label) {
  const issues = [];
  for (const f of findEmptyTestFiles(report)) {
    issues.push(`[${label}] ${f.name} collected 0 tests — ${f.message}`);
  }
  for (const issue of checkCountFloor(report, baseline)) {
    issues.push(`[${label}] ${issue}`);
  }
  return issues;
}

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function main() {
  const baselinePath = path.join(__dirname, 'test-count-baseline.json');
  const baselines = readJson(baselinePath);

  const targets = [
    {
      label: 'root',
      reportPath: path.resolve(__dirname, '..', '.vitest-reports/root.json'),
      baseline: baselines.root,
    },
    {
      label: 'functions',
      reportPath: path.resolve(
        __dirname,
        '..',
        '.vitest-reports/functions.json'
      ),
      baseline: baselines.functions,
    },
  ];

  /** @type {string[]} */
  const allIssues = [];

  for (const target of targets) {
    if (!existsSync(target.reportPath)) {
      allIssues.push(
        `[${target.label}] report not found at ${target.reportPath} — run 'pnpm test' / ` +
          `'pnpm -C functions test' first (they write this report as a side artifact).`
      );
      continue;
    }
    const report = readJson(target.reportPath);
    allIssues.push(...validateReport(report, target.baseline, target.label));
  }

  if (allIssues.length > 0) {
    console.error('\n✖ Test count guard failed:\n');
    for (const issue of allIssues) {
      console.error(`  - ${issue}`);
    }
    console.error(
      '\nIf this drop is intentional (tests deliberately removed), update ' +
        'scripts/test-count-baseline.json to reflect the new counts.\n'
    );
    process.exit(1);
  }

  console.log(
    '✓ Test count guard passed — no silently-omitted test suites detected.'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
