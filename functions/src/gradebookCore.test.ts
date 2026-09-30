import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as core from './gradebookCore';

interface CoreCase {
  name: string;
  fn:
    | 'resolveFinalScore'
    | 'computeOverall'
    | 'combineEvidence'
    | 'buildStudentGradeEntry';
  args: unknown[];
  expected: unknown;
}

// Float noise (6.999999999999998) must not fail a parity case.
const rounded = (v: unknown): unknown =>
  typeof v === 'number'
    ? Math.round(v * 1e9) / 1e9
    : Array.isArray(v)
      ? v.map(rounded)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x)]))
        : v;

const cases = JSON.parse(
  readFileSync(resolve(__dirname, 'gradebookCore.cases.json'), 'utf8')
) as CoreCase[];

describe('gradebook core (server mirror)', () => {
  it.each(cases)('$fn: $name', ({ fn, args, expected }) => {
    const call = core[fn] as (...a: unknown[]) => unknown;
    const got = call(...args);
    expect(rounded(got)).toEqual(rounded(expected));
  });
});
