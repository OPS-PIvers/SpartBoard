import { describe, it, expect } from 'vitest';
import {
  findEmptyTestFiles,
  checkCountFloor,
  validateReport,
  evaluateTarget,
  selectTargets,
} from './checkTestCounts.mjs';

/**
 * Regression coverage for the CI guard described in
 * docs/routines/debugger.md ("CI guard for crash-at-import test suites").
 *
 * These fixtures use the EXACT JSON shape Vitest's `--reporter=json` output
 * produces (confirmed empirically against Vitest v4.1.8 in this repo, see
 * scripts/checkTestCounts.mjs header comment) — not a hand-rolled
 * approximation. Two failure classes are covered:
 *
 *   1. A file Vitest DID collect but which crashed at import / registered no
 *      tests (the literal shape #2047's `mirrorPlcIndex.test.ts` would have
 *      produced pre-fix: `assertionResults: []`, `status: "failed"`, a
 *      thrown-error `message`).
 *   2. A file that Vitest never saw at all (renamed extension, over-broad
 *      `exclude`, a feature-flagged-off describe block) — no per-file entry
 *      exists for this class, so it can only be caught via the aggregate
 *      count dropping below a committed baseline.
 */

interface FakeFileResult {
  name: string;
  status?: string;
  assertionResults: { status: string }[];
  message?: string;
}

function makeReport(
  overrides: Partial<{
    numTotalTests: number;
    testResults: FakeFileResult[];
  }> = {}
) {
  return {
    numTotalTests: 5,
    testResults: [
      {
        name: '/repo/functions/src/aggregatePlcAssessment.test.ts',
        status: 'passed',
        assertionResults: [
          { status: 'passed' },
          { status: 'passed' },
          { status: 'passed' },
        ],
      },
      {
        name: '/repo/functions/src/detachPlcSyncLinkage.test.ts',
        status: 'passed',
        assertionResults: [{ status: 'passed' }, { status: 'passed' }],
      },
    ],
    ...overrides,
  };
}

describe('findEmptyTestFiles', () => {
  it('finds nothing in a healthy report', () => {
    expect(findEmptyTestFiles(makeReport())).toEqual([]);
  });

  it('flags the #2047 mirrorPlcIndex.test.ts crash-at-import shape', () => {
    // Reproduces the exact JSON shape a module-level throw produces: the
    // file appears in testResults with a non-empty `message` (the thrown
    // error) and zero assertionResults, because no `describe`/`it` in the
    // file ever registered (the throw happens before they can run).
    const report = makeReport({
      numTotalTests: 5,
      testResults: [
        ...makeReport().testResults,
        {
          name: '/repo/functions/src/mirrorPlcIndex.test.ts',
          status: 'failed',
          assertionResults: [],
          message:
            "ReferenceError: onDocumentWritten is not a module-level mock — Cannot find package 'firebase-functions/v2/firestore'",
        },
      ],
    });

    const flagged = findEmptyTestFiles(report);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].name).toContain('mirrorPlcIndex.test.ts');
    expect(flagged[0].message).toContain('firebase-functions/v2/firestore');
  });

  it('flags a file with no message (the "No test suite found" shape)', () => {
    const report = makeReport({
      testResults: [
        {
          name: '/repo/functions/src/empty.test.ts',
          status: 'failed',
          assertionResults: [],
          message: '',
        },
      ],
    });
    const flagged = findEmptyTestFiles(report);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].message).toContain('no failure message reported');
  });
});

describe('checkCountFloor', () => {
  it('passes when counts meet the baseline', () => {
    const report = makeReport({ numTotalTests: 703 });
    const issues = checkCountFloor(report, { testFiles: 2, tests: 703 });
    expect(issues).toEqual([]);
  });

  it('passes when counts exceed the baseline (growth is always fine)', () => {
    const report = makeReport({ numTotalTests: 800 });
    const issues = checkCountFloor(report, { testFiles: 1, tests: 703 });
    expect(issues).toEqual([]);
  });

  it('flags the "file went invisible" class: file count drops below baseline', () => {
    // Simulates renaming `sanitize.test.ts` -> `sanitize.testx.ts` (verified
    // empirically: `vitest run` exits 0, "Test Files 36 passed (36)" / "Tests
    // 696 passed (696)" — down from the true 37 files / 703 tests, with zero
    // failure signal). The removed file has no entry in testResults at all,
    // so this can only be detected via the aggregate floor.
    const report = makeReport({ numTotalTests: 696 }); // only 2 files present here
    const issues = checkCountFloor(report, { testFiles: 37, tests: 703 });
    expect(issues.some((i) => i.includes('test file count dropped to 2'))).toBe(
      true
    );
    expect(issues.some((i) => i.includes('baseline: 37'))).toBe(true);
  });

  it('flags a total test count drop even when file count matches', () => {
    const report = makeReport({ numTotalTests: 3 });
    const issues = checkCountFloor(report, { testFiles: 2, tests: 703 });
    expect(
      issues.some((i) => i.includes('total test count dropped to 3'))
    ).toBe(true);
  });
});

describe('validateReport', () => {
  it('FAILS before: the pre-#2047 shape (crash-at-import file + a count drop) reports issues', () => {
    // This models the exact incident: mirrorPlcIndex.test.ts is present but
    // crashed (0 assertionResults), AND the aggregate is below the
    // then-current baseline because its 5 real tests never ran.
    const report = makeReport({
      numTotalTests: 2, // the 2 healthy files' tests only — the 5 crashed tests never ran
      testResults: [
        ...makeReport().testResults,
        {
          name: '/repo/functions/src/mirrorPlcIndex.test.ts',
          status: 'failed',
          assertionResults: [],
          message: "Cannot find package 'firebase-functions/v2/firestore'",
        },
      ],
    });
    const issues = validateReport(
      report,
      { testFiles: 3, tests: 7 },
      'functions'
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.includes('mirrorPlcIndex.test.ts'))).toBe(true);
  });

  it('PASSES after: the fixed shape (all files collected, counts at/above baseline) reports no issues', () => {
    const report = makeReport({
      numTotalTests: 7,
      testResults: [
        ...makeReport().testResults,
        {
          name: '/repo/functions/src/mirrorPlcIndex.test.ts',
          status: 'passed',
          assertionResults: [
            { status: 'passed' },
            { status: 'passed' },
            { status: 'passed' },
            { status: 'passed' },
            { status: 'passed' },
          ],
        },
      ],
    });
    const issues = validateReport(
      report,
      { testFiles: 3, tests: 7 },
      'functions'
    );
    expect(issues).toEqual([]);
  });
});

describe('evaluateTarget', () => {
  // Third-surface gap (found 2026-07-13): `tests/rules/**` (run via
  // `pnpm run test:rules` against the Firestore emulator, its own PR-
  // validation CI step) had no count-floor guard at all — only `root` and
  // `functions` were ever checked. `evaluateTarget` is the per-target unit
  // that now backs all three; these cases pin the exact regression the fix
  // closes (a rules test file going invisible is now caught) AND the
  // constraint that made the gap easy to reintroduce (a REQUIRED report
  // path must not silently no-op, but the OPTIONAL `rules` report must not
  // break `validate`/`test:all`, which never run `test:rules`).

  it('PASSES after: a rules-suite regression is caught once "rules" is evaluated as a target', () => {
    const rulesReport = { numTotalTests: 12, testResults: [] };
    const issues = evaluateTarget(
      {
        label: 'rules',
        reportPath: '/repo/.vitest-reports/rules.json',
        baseline: { testFiles: 44, tests: 1112 },
        optional: true,
      },
      () => true, // report file exists this run
      () => rulesReport
    );
    expect(issues.some((i) => i.includes('test file count dropped to 0'))).toBe(
      true
    );
    expect(
      issues.some((i) => i.includes('total test count dropped to 12'))
    ).toBe(true);
  });

  it('an OPTIONAL missing report (rules, when test:rules was not run) produces no issues', () => {
    // This is the constraint that makes the fix safe to ship: `validate`
    // and `test:all` never run `test:rules` (it needs a separate emulator),
    // so `.vitest-reports/rules.json` legitimately does not exist on that
    // path. If this returned an issue, every `pnpm run validate` on a
    // fresh checkout would fail for a report that was never supposed to
    // exist there.
    const issues = evaluateTarget(
      {
        label: 'rules',
        reportPath: '/repo/.vitest-reports/rules.json',
        baseline: { testFiles: 44, tests: 1112 },
        optional: true,
      },
      () => false, // report file does not exist
      () => {
        throw new Error(
          'readReport must not be called when the report is missing'
        );
      }
    );
    expect(issues).toEqual([]);
  });

  it('a REQUIRED missing report (root/functions) still fails loudly', () => {
    const issues = evaluateTarget(
      {
        label: 'root',
        reportPath: '/repo/.vitest-reports/root.json',
        baseline: { testFiles: 1, tests: 1 },
        // optional omitted -> required, matches root/functions today
      },
      () => false,
      () => {
        throw new Error(
          'readReport must not be called when the report is missing'
        );
      }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('report not found');
  });

  it('a missing baseline entry fails regardless of optional', () => {
    const issues = evaluateTarget(
      {
        label: 'rules',
        reportPath: '/repo/.vitest-reports/rules.json',
        baseline: undefined,
        optional: true,
      },
      () => true,
      () => ({ numTotalTests: 0, testResults: [] })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('baseline configuration is missing');
  });
});

describe('selectTargets', () => {
  // FAILS before / PASSES after (found in CI, run 2026-07-13): `test:rules`
  // runs in its own isolated CI job with no `root`/`functions` reports ever
  // produced there. Calling `checkTestCounts.mjs` with no filter evaluated
  // ALL targets unconditionally, so the rules CI job failed on "report not
  // found" for root/functions even though the rules suite itself was green.
  const allTargets = [
    { label: 'root', reportPath: '/x/root.json', baseline: undefined },
    {
      label: 'functions',
      reportPath: '/x/functions.json',
      baseline: undefined,
    },
    {
      label: 'rules',
      reportPath: '/x/rules.json',
      baseline: undefined,
      optional: true,
    },
  ];

  it('FAILS before: no filter means test:rules would still evaluate root/functions', () => {
    const targets = selectTargets(allTargets, undefined);
    expect(targets.map((t) => t.label)).toEqual(['root', 'functions', 'rules']);
  });

  it('PASSES after: requesting "rules" scopes evaluation to just that target', () => {
    const targets = selectTargets(allTargets, 'rules');
    expect(targets.map((t) => t.label)).toEqual(['rules']);
  });

  it('an unknown requested label throws instead of silently selecting nothing', () => {
    // claude[bot] review (#2194): `targets: []` reaches main()'s for-loop,
    // which iterates zero times and prints "guard passed" — a typo'd label
    // would silently no-op the entire guard. Throwing here is the actual
    // fail-loud behavior; the caller (main) lets it propagate and crash.
    expect(() => selectTargets(allTargets, 'typo-d-label')).toThrow(
      /Unknown checkTestCounts.mjs target "typo-d-label"/
    );
  });
});
