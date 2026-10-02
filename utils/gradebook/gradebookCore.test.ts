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
    expect(scale.levels.map((l) => l.name)).toEqual(
      core.DEFAULT_PROFICIENCY_SCALE.levels.map((l) => l.name)
    );
  });

  it('reads the older three-level fields and writes them back', () => {
    const scale = core.parseScale({
      proficient: 85,
      approaching: 65,
      levelNames: ['Meets', 'Near', 'Below'],
    });
    expect(scale?.levels.map((l) => [l.name, l.min, l.color])).toEqual([
      ['Meets', 85, 'emerald'],
      ['Near', 65, 'amber'],
      ['Below', 0, 'rose'],
    ]);
    const stored = core.storedScale(scale as core.ProficiencyScale);
    expect(stored).toMatchObject({
      proficient: 85,
      approaching: 65,
      levelNames: ['Meets', 'Near', 'Below'],
    });
  });

  it('bands four levels top first', () => {
    const scale = core.normalizeScale({
      levels: [
        { name: 'Exceeds', min: 90, color: 'blue' },
        { name: 'Meets', min: 75, color: 'emerald' },
        { name: 'Near', min: 50, color: 'amber' },
        { name: 'Below', min: 20, color: 'rose' },
      ],
    });
    expect(scale.levels[3].min).toBe(0);
    expect(
      [95, 80, 60, 10].map((p) => core.proficiencyLevel(p, scale))
    ).toEqual([0, 1, 2, 3]);
    expect(core.storedScale(scale)).toMatchObject({
      proficient: 90,
      approaching: 75,
      levelNames: ['Exceeds', 'Meets', 'Below'],
    });
  });

  it('applies PLC cutoffs to the top two levels and keeps the rest below', () => {
    const district = core.normalizeScale({
      levels: [
        { name: 'A', min: 90, color: 'blue' },
        { name: 'B', min: 80, color: 'emerald' },
        { name: 'C', min: 70, color: 'amber' },
        { name: 'D', min: 0, color: 'rose' },
      ],
    });
    const scale = core.resolveScale({ source: 'plc', plcId: 'p' }, district, {
      proficient: 70,
      approaching: 60,
    });
    expect(scale.levels.map((l) => l.min)).toEqual([70, 60, 59, 0]);
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

describe('work kind', () => {
  it.each([
    ['quiz', {}, 'work'],
    ['video-activity', {}, 'work'],
    ['projects', {}, 'work'],
    ['guided-learning', {}, 'resource'],
    ['mini-app', {}, 'resource'],
    ['activity-wall', {}, 'resource'],
    ['flashcards', { kind: 'check' }, 'work'],
    ['flashcards', { kind: 'study' }, 'resource'],
    ['flashcards', {}, 'work'],
  ] as const)('%s %j defaults to %s', (kind, session, expected) => {
    expect(core.resolveWorkKind(kind, session)).toBe(expected);
  });

  it('lets the session field win over the kind default', () => {
    expect(core.resolveWorkKind('quiz', { workKind: 'resource' })).toBe(
      'resource'
    );
    expect(core.resolveWorkKind('mini-app', { workKind: 'work' })).toBe('work');
    expect(
      core.resolveWorkKind('flashcards', { kind: 'study', workKind: 'work' })
    ).toBe('work');
  });

  it('ignores an unrecognised value', () => {
    expect(core.resolveWorkKind('quiz', { workKind: 'both' })).toBe('work');
    expect(core.isResourceSession('guided-learning', null)).toBe(true);
  });
});
