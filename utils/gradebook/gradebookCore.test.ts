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

const MARKER = '// ---- shared body ----';
const bodyOf = (path: string): string => {
  const src = readFileSync(resolve(__dirname, path), 'utf8');
  return src.slice(src.indexOf(MARKER));
};

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
  readFileSync(
    resolve(__dirname, '../../functions/src/gradebookCore.cases.json'),
    'utf8'
  )
) as CoreCase[];

describe('gradebook core', () => {
  it('matches the functions mirror byte for byte', () => {
    const client = bodyOf('gradebookCore.ts');
    expect(client.startsWith(MARKER)).toBe(true);
    expect(bodyOf('../../functions/src/gradebookCore.ts')).toBe(client);
  });

  it.each(cases)('$fn: $name', ({ fn, args, expected }) => {
    const call = core[fn] as (...a: unknown[]) => unknown;
    const got = call(...args);
    expect(rounded(got)).toEqual(rounded(expected));
  });

  it('keeps default flag keys unique and never P', () => {
    const keys = core.DEFAULT_GRADEBOOK_FLAGS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('P');
  });

  it('bands a percent on the chosen scale', () => {
    const scale = core.resolveScale(
      { source: 'plc', plcId: 'p' },
      core.DEFAULT_PROFICIENCY_SCALE,
      { proficient: 90, approaching: 70 }
    );
    expect(core.proficiencyLevel(85, scale)).toBe(1);
    expect(core.proficiencyLevel(90, scale)).toBe(0);
    expect(core.proficiencyLevel(null, scale)).toBeNull();
    expect(scale.levelNames).toEqual(core.DEFAULT_PROFICIENCY_SCALE.levelNames);
  });

  it('gives no proficiency evidence for flag-valued or overridden cells beyond column tags', () => {
    const row = {
      kind: 'quiz',
      sessionId: 's',
      studentUid: 'u',
      ownerUid: 't',
      editorUids: [],
      rosterIds: [],
      classIds: [],
      title: 'Q',
      rawPct: 50,
      points: 5,
      max: 10,
      state: 'scored',
      submittedAt: 7,
      dueAt: null,
      openAt: null,
      closeAt: null,
      createdAt: 0,
      attempts: [],
      targetEvidence: [
        { targetId: 't1', kind: 'standard', earned: 1, possible: 2 },
      ],
      published: true,
      assigned: true,
      updatedAt: 7,
    } satisfies core.GradeIndexRow;
    const ctx = {
      flagDefs: core.DEFAULT_GRADEBOOK_FLAGS,
      autoFlags: true,
      now: 10,
    };
    const final = core.resolveFinalScore(row, null, null, ctx);
    expect(core.evidenceForCell(row, final, null)).toEqual([
      { targetId: 't1', pct: 50, at: 7 },
    ]);
    const missing = core.resolveFinalScore(
      {
        ...row,
        state: 'not-attempted',
        points: null,
        submittedAt: null,
        dueAt: 1,
      },
      null,
      null,
      ctx
    );
    expect(missing.source).toBe('flag');
    expect(core.evidenceForCell(row, missing, null)).toEqual([]);
  });
});
