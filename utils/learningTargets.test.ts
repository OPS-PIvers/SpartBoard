import { describe, it, expect } from 'vitest';
import {
  LEARNING_TARGET_LIST_CAP,
  LearningTarget,
  LearningTargetList,
} from '@/types';
import {
  DEFAULT_MASTERY_CUTOFFS,
  addTargets,
  archiveTarget,
  effectiveGrades,
  effectiveSubject,
  parseCsvRecords,
  parsePastedTargets,
  parseTargetsCsv,
  setMasteryCutoffs,
  tagFromBenchmark,
  tagFromStandard,
  tagFromTarget,
  unarchiveTarget,
  upsertTarget,
} from './learningTargets';

const empty: LearningTargetList = { targets: [], updatedAt: 0 };
const mk = (
  id: string,
  extra: Partial<LearningTarget> = {}
): LearningTarget => ({
  id,
  label: `Target ${id}`,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('parsePastedTargets', () => {
  it('splits CODE | description lines and bare descriptions', () => {
    expect(
      parsePastedTargets(
        'LT1 | I can add fractions\n\n  I can subtract  \r\n | only label\nCODE |'
      )
    ).toEqual([
      { code: 'LT1', label: 'I can add fractions' },
      { label: 'I can subtract' },
      { label: 'only label' },
      { label: 'CODE' },
    ]);
  });

  it('returns [] for blank input', () => {
    expect(parsePastedTargets('  \n\n')).toEqual([]);
  });
});

describe('parseCsvRecords', () => {
  it('handles quoted commas, newlines and escaped quotes', () => {
    expect(parseCsvRecords('a,"b, c","say ""hi""\nthere"\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parseTargetsCsv', () => {
  it('parses code/label/standards with a header row', () => {
    const { rows, errors } = parseTargetsCsv(
      'code,label,standards\nLT1,"Add, then simplify",6.1.1.1; 6.1.1.2\n,No code,\n\n'
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        code: 'LT1',
        label: 'Add, then simplify',
        standardCodes: ['6.1.1.1', '6.1.1.2'],
      },
      { label: 'No code', standardCodes: [] },
    ]);
  });

  it('accepts "target" as the label header and is case-insensitive', () => {
    const { rows } = parseTargetsCsv('Target\nOne');
    expect(rows).toEqual([{ label: 'One', standardCodes: [] }]);
  });

  it('errors on a missing label column and on blank labels', () => {
    expect(parseTargetsCsv('code,standards\nA,B').errors[0].message).toMatch(
      /label/
    );
    const { rows, errors } = parseTargetsCsv('code,label\nA,\nB,Ok');
    expect(errors).toEqual([{ line: 2, message: 'Missing label' }]);
    expect(rows).toHaveLength(1);
  });

  it('errors on an empty file', () => {
    expect(parseTargetsCsv('').errors).toHaveLength(1);
  });
});

describe('list mutations', () => {
  it('upsertTarget inserts then replaces by id', () => {
    const a = upsertTarget(empty, mk('a'));
    expect(a.targets).toHaveLength(1);
    const b = upsertTarget(a, mk('a', { label: 'Renamed', updatedAt: 5 }));
    expect(b.targets).toEqual([expect.objectContaining({ label: 'Renamed' })]);
    expect(b.updatedAt).toBe(5);
  });

  it('archiveTarget / unarchiveTarget toggle the flag', () => {
    const list = upsertTarget(empty, mk('a'));
    const archived = archiveTarget(list, 'a', 9);
    expect(archived.targets[0].archived).toBe(true);
    expect(archived.updatedAt).toBe(9);
    expect(archiveTarget(list, 'missing')).toBe(list);
    const back = unarchiveTarget(archived, 'a', 10);
    expect(back.targets[0]).not.toHaveProperty('archived');
  });

  it('addTargets appends cleaned drafts and drops blanks', () => {
    const next = addTargets(
      empty,
      [
        { code: ' C1 ', label: ' L1 ', standardIds: ['s1'] },
        { label: '  ' },
        { label: 'L2' },
      ],
      42
    );
    expect(next.targets).toHaveLength(2);
    expect(next.targets[0]).toMatchObject({
      code: 'C1',
      label: 'L1',
      standardIds: ['s1'],
      createdAt: 42,
    });
    expect(next.targets[1]).not.toHaveProperty('code');
    expect(next.targets[0].id).not.toBe(next.targets[1].id);
    expect(addTargets(empty, [{ label: '' }])).toBe(empty);
  });

  it('enforces the cap', () => {
    const full: LearningTargetList = {
      targets: Array.from({ length: LEARNING_TARGET_LIST_CAP }, (_, i) =>
        mk(String(i))
      ),
      updatedAt: 0,
    };
    expect(() => addTargets(full, [{ label: 'x' }])).toThrow(/1000/);
    expect(() => upsertTarget(full, mk('new'))).toThrow(/1000/);
    expect(() => upsertTarget(full, mk('0'))).not.toThrow();
  });

  it('setMasteryCutoffs validates and writes', () => {
    expect(DEFAULT_MASTERY_CUTOFFS).toEqual({
      proficient: 80,
      approaching: 60,
    });
    expect(
      setMasteryCutoffs(empty, { proficient: 90, approaching: 70 }, 3)
        .masteryCutoffs
    ).toEqual({ proficient: 90, approaching: 70 });
    expect(() =>
      setMasteryCutoffs(empty, { proficient: 50, approaching: 60 })
    ).toThrow(/exceed/);
    expect(() =>
      setMasteryCutoffs(empty, { proficient: 101, approaching: 0 })
    ).toThrow(/0 to 100/);
    expect(() =>
      setMasteryCutoffs(empty, { proficient: 80.5, approaching: 0 })
    ).toThrow(/whole/);
  });
});

describe('tags', () => {
  it('tagFromTarget copies code/standardIds and sets ownerId for plc', () => {
    const t = mk('a', { code: 'C', standardIds: ['s1'] });
    expect(tagFromTarget(t, 'plc', 'plc1')).toEqual({
      id: 'a',
      kind: 'plc',
      ownerId: 'plc1',
      code: 'C',
      label: 'Target a',
      standardIds: ['s1'],
    });
    expect(tagFromTarget(mk('b'), 'personal', 'ignored')).toEqual({
      id: 'b',
      kind: 'personal',
      label: 'Target b',
    });
  });

  it('tagFromBenchmark uses the benchmark text as label', () => {
    expect(
      tagFromBenchmark({
        id: 'mn:6.1.1.1',
        set: 'mn',
        subject: 'ela',
        code: '6.1.1.1',
        grade: '6',
        strand: 'x',
        standard: 'y',
        text: 'Cite evidence',
        searchText: '6.1.1.1 cite evidence',
      })
    ).toEqual({
      id: 'mn:6.1.1.1',
      kind: 'standard',
      code: '6.1.1.1',
      label: 'Cite evidence',
      parentId: 'mn:std:1.1',
      parentLabel: 'y',
    });
  });
});

describe('grades and subject', () => {
  const bench = (
    id: string,
    grade: string,
    subject: 'ela' | 'social-studies' = 'ela'
  ) => ({
    id,
    set: 'mn',
    subject,
    code: id,
    grade,
    strand: 'Reading',
    standard: 'R1 Foundations: Read.',
    text: 'Read.',
    searchText: 'read.',
  });
  const catalog = new Map([
    ['a', bench('a', '6')],
    ['b', bench('b', '9-12', 'social-studies')],
  ]);

  it('parseTargetsCsv reads grades and subject columns', () => {
    const { rows, errors } = parseTargetsCsv(
      [
        'code,description,standardCodes,grades,subject',
        'LT1,Add,6.1.1.1;6.1.1.2,6;7;k,Math',
        'LT2,Sub,,8;8;13,',
      ].join('\n')
    );
    expect(rows).toEqual([
      {
        code: 'LT1',
        label: 'Add',
        standardCodes: ['6.1.1.1', '6.1.1.2'],
        grades: ['K', '6', '7'],
        subject: 'Math',
      },
      { code: 'LT2', label: 'Sub', standardCodes: [], grades: ['8'] },
    ]);
    expect(errors).toEqual([
      { line: 3, message: 'Unknown grade "13" (use K or 1-12)' },
    ]);
  });

  it('addTargets keeps explicit grades and subject', () => {
    const list = addTargets(
      { targets: [], updatedAt: 0 },
      [{ label: 'x', grades: ['7', 'k', 'zz'], subject: ' math ' }],
      5
    );
    expect(list.targets[0].grades).toEqual(['K', '7']);
    expect(list.targets[0].subject).toBe('math');
  });

  it('effectiveGrades: explicit, else union of linked standards, else null', () => {
    expect(
      effectiveGrades({ grades: ['3'], standardIds: ['a'] }, catalog)
    ).toEqual(['3']);
    expect(effectiveGrades({ standardIds: ['a', 'b'] }, catalog)).toEqual([
      '6',
      '9',
      '10',
      '11',
      '12',
    ]);
    expect(effectiveGrades({ standardIds: ['missing'] }, catalog)).toBeNull();
    expect(effectiveGrades({}, catalog)).toBeNull();
  });

  it('effectiveSubject: explicit, else agreeing linked subject, else null', () => {
    expect(
      effectiveSubject({ subject: 'math', standardIds: ['a'] }, catalog)
    ).toBe('math');
    expect(effectiveSubject({ standardIds: ['a'] }, catalog)).toBe('ela');
    expect(effectiveSubject({ standardIds: ['a', 'b'] }, catalog)).toBeNull();
    expect(effectiveSubject({}, catalog)).toBeNull();
  });

  it('tagFromBenchmark carries the parent standard id; tagFromStandard builds the parent', () => {
    const b = bench('mn:6.1.1.1', '6');
    expect(tagFromBenchmark(b).parentId).toBe('mn:std:R1');
    expect(tagFromStandard(b)).toEqual({
      id: 'mn:std:R1',
      kind: 'standard',
      code: 'R1',
      label: 'Foundations',
    });
  });
});
