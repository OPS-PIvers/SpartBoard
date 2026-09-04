#!/usr/bin/env node
// Merges Vitest JSON reports from `--shard` runs into one report checkTestCounts.mjs can read.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SUMMED_FIELDS = [
  'numTotalTestSuites',
  'numPassedTestSuites',
  'numFailedTestSuites',
  'numPendingTestSuites',
  'numTotalTests',
  'numPassedTests',
  'numFailedTests',
  'numPendingTests',
  'numTodoTests',
];

/**
 * @param {Record<string, unknown>[]} reports
 * @returns {Record<string, unknown>}
 */
export function mergeReports(reports) {
  if (reports.length === 0) throw new Error('No reports to merge');
  const merged = { ...reports[0] };
  for (const field of SUMMED_FIELDS) {
    merged[field] = reports.reduce(
      (sum, r) => sum + (Number(r[field]) || 0),
      0
    );
  }
  merged.success = reports.every((r) => r.success !== false);
  merged.startTime = Math.min(...reports.map((r) => Number(r.startTime) || 0));
  merged.testResults = reports.flatMap((r) =>
    Array.isArray(r.testResults) ? r.testResults : []
  );
  return merged;
}

function main() {
  const [outPath, ...inputs] = process.argv.slice(2);
  if (!outPath || inputs.length === 0) {
    console.error(
      'usage: node scripts/mergeVitestReports.mjs <out.json> <shard.json>...'
    );
    process.exit(1);
  }
  const reports = inputs.map((p) => JSON.parse(readFileSync(p, 'utf-8')));
  const merged = mergeReports(reports);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(merged));
  console.log(
    `Merged ${inputs.length} report(s) → ${outPath}: ` +
      `${merged.testResults.length} files, ${merged.numTotalTests} tests`
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  main();
}
