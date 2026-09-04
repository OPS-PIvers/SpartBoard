import { describe, it, expect } from 'vitest';
import { mergeReports } from './mergeVitestReports.mjs';

const shard = (files: string[], tests: number, success = true) => ({
  numTotalTestSuites: files.length,
  numTotalTests: tests,
  numPassedTests: tests,
  numFailedTests: 0,
  success,
  startTime: 1000 + files.length,
  testResults: files.map((name) => ({ name, assertionResults: [] })),
});

describe('mergeReports', () => {
  it('concatenates file results and sums counts across shards', () => {
    const merged = mergeReports([
      shard(['a.test.ts', 'b.test.ts'], 5),
      shard(['c.test.ts'], 3),
    ]);
    expect(merged.testResults).toHaveLength(3);
    expect(merged.numTotalTests).toBe(8);
    expect(merged.numTotalTestSuites).toBe(3);
    expect(merged.success).toBe(true);
    expect(merged.startTime).toBe(1001);
  });

  it('marks the merged report failed if any shard failed', () => {
    const merged = mergeReports([
      shard(['a.test.ts'], 1),
      shard(['b.test.ts'], 1, false),
    ]);
    expect(merged.success).toBe(false);
  });

  it('rejects an empty input list', () => {
    expect(() => mergeReports([])).toThrow(/No reports/);
  });
});
