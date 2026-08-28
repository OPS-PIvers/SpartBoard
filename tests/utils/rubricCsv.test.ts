import { describe, it, expect } from 'vitest';
import { parseRubricCsv, rubricToCsv } from '@/utils/rubricCsv';
import type { Rubric } from '@/types';

type ParsedRubric = NonNullable<ReturnType<typeof parseRubricCsv>['rubric']>;

function assertRubric(rubric: ParsedRubric | null): ParsedRubric {
  if (rubric === null) throw new Error('expected a parsed rubric');
  return rubric;
}

const FOUR_LEVEL_CSV = [
  'Criterion,Description,Level 1 Label,Level 1 Points,Level 1 Description,Level 2 Label,Level 2 Points,Level 2 Description,Level 3 Label,Level 3 Points,Level 3 Description,Level 4 Label,Level 4 Points,Level 4 Description',
  'Thesis,Clarity of thesis,Below,1,No thesis,Approaching,2,Implied thesis,Meets,3,Clear thesis,Exceeds,4,Sophisticated thesis',
  'Evidence,Use of evidence,Below,1,No evidence,Approaching,2,Minimal evidence,Meets,3,Sufficient evidence,Exceeds,4,Rich evidence',
  'Analysis,Depth of reasoning,Below,1,No analysis,Approaching,2,Superficial analysis,Meets,3,Sound analysis,Exceeds,4,Insightful analysis',
].join('\r\n');

function toStorableRubric(parsed: ParsedRubric): Rubric {
  return { id: 'r1', createdAt: 0, updatedAt: 0, ...parsed };
}

function stripRubric(r: ParsedRubric) {
  return r.criteria.map((c) => ({
    name: c.name,
    description: c.description,
    levels: c.levels.map((l) => ({
      label: l.label,
      points: l.points,
      description: l.description,
    })),
  }));
}

describe('parseRubricCsv', () => {
  it('parses a 3-criterion, 4-level CSV and round-trips losslessly', () => {
    const result = parseRubricCsv(FOUR_LEVEL_CSV);
    expect(result.errors).toEqual([]);
    const rubric = assertRubric(result.rubric);
    expect(rubric.criteria).toHaveLength(3);
    expect(rubric.criteria[0].levels).toHaveLength(4);

    const csv = rubricToCsv(toStorableRubric(rubric));
    const reparsed = parseRubricCsv(csv);
    expect(reparsed.errors).toEqual([]);
    expect(stripRubric(assertRubric(reparsed.rubric))).toEqual(
      stripRubric(rubric)
    );
  });

  it('returns a whole-file error when the Criterion column is missing', () => {
    const csv = 'Name,Level 1 Label,Level 1 Points\nFoo,Below,1';
    const result = parseRubricCsv(csv);
    expect(result.rubric).toBeNull();
    expect(result.errors).toEqual([
      { line: 1, reason: expect.stringContaining('Criterion') },
    ]);
  });

  it('skips a row with a blank Criterion cell but keeps others', () => {
    const csv = [
      'Criterion,Level 1 Label,Level 1 Points,Level 2 Label,Level 2 Points',
      ',Below,1,Meets,2',
      'Evidence,Below,1,Meets,2',
    ].join('\n');
    const result = parseRubricCsv(csv);
    const rubric = assertRubric(result.rubric);
    expect(rubric.criteria).toHaveLength(1);
    expect(rubric.criteria[0].name).toBe('Evidence');
    expect(result.errors).toEqual([
      { line: 2, reason: expect.stringContaining('Missing Criterion') },
    ]);
  });

  it('skips a level with a non-numeric Points cell but keeps the criterion if enough levels remain', () => {
    const csv = [
      'Criterion,Level 1 Label,Level 1 Points,Level 2 Label,Level 2 Points,Level 3 Label,Level 3 Points',
      'Thesis,Below,abc,Approaching,2,Meets,3',
    ].join('\n');
    const result = parseRubricCsv(csv);
    const rubric = assertRubric(result.rubric);
    expect(rubric.criteria[0].levels).toHaveLength(2);
    expect(rubric.criteria[0].levels.map((l) => l.label)).toEqual([
      'Approaching',
      'Meets',
    ]);
    expect(result.errors).toEqual([
      { line: 2, reason: expect.stringContaining('Level 1 Points') },
    ]);
  });

  it('skips a criterion with only 1 valid level', () => {
    const csv = [
      'Criterion,Level 1 Label,Level 1 Points,Level 2 Label,Level 2 Points',
      'Thesis,Below,1,,',
    ].join('\n');
    const result = parseRubricCsv(csv);
    expect(result.rubric).toBeNull();
    expect(result.errors).toEqual([
      { line: 2, reason: expect.stringContaining('at least 2 valid levels') },
    ]);
  });

  it('parses a 5-level rubric correctly', () => {
    const csv = [
      'Criterion,Level 1 Label,Level 1 Points,Level 2 Label,Level 2 Points,Level 3 Label,Level 3 Points,Level 4 Label,Level 4 Points,Level 5 Label,Level 5 Points',
      'Thesis,A,1,B,2,C,3,D,4,E,5',
    ].join('\n');
    const result = parseRubricCsv(csv);
    expect(result.errors).toEqual([]);
    expect(assertRubric(result.rubric).criteria[0].levels).toHaveLength(5);
  });

  it('parses a 6-level rubric correctly', () => {
    const csv = [
      'Criterion,Level 1 Label,Level 1 Points,Level 2 Label,Level 2 Points,Level 3 Label,Level 3 Points,Level 4 Label,Level 4 Points,Level 5 Label,Level 5 Points,Level 6 Label,Level 6 Points',
      'Thesis,A,1,B,2,C,3,D,4,E,5,F,6',
    ].join('\n');
    const result = parseRubricCsv(csv);
    expect(result.errors).toEqual([]);
    expect(assertRubric(result.rubric).criteria[0].levels).toHaveLength(6);
  });

  it('warns and drops extra columns for an 8-level CSV, keeping 6 levels', () => {
    const csv = [
      'Criterion,Level 1 Label,Level 1 Points,Level 2 Label,Level 2 Points,Level 3 Label,Level 3 Points,Level 4 Label,Level 4 Points,Level 5 Label,Level 5 Points,Level 6 Label,Level 6 Points,Level 7 Label,Level 7 Points,Level 8 Label,Level 8 Points',
      'Thesis,A,1,B,2,C,3,D,4,E,5,F,6,G,7,H,8',
    ].join('\n');
    const result = parseRubricCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        line: 1,
        reason:
          'Extra columns beyond the supported count are ignored (max 6 levels).',
      },
    ]);
    expect(assertRubric(result.rubric).criteria[0].levels).toHaveLength(6);
  });

  it('round-trips cells containing commas and quotes through the serializer', () => {
    const rubric: Rubric = {
      id: 'r1',
      title: 'Test',
      createdAt: 0,
      updatedAt: 0,
      criteria: [
        {
          id: 'c1',
          name: 'Thesis, Argument',
          description: 'Has "nuance"',
          levels: [
            { id: 'l1', label: 'Below', points: 1, description: 'no, thesis' },
            { id: 'l2', label: 'Meets "quality" bar', points: 2 },
          ],
        },
      ],
    };
    const csv = rubricToCsv(rubric);
    const reparsed = parseRubricCsv(csv);
    expect(reparsed.errors).toEqual([]);
    const parsed = assertRubric(reparsed.rubric);
    expect(parsed.criteria[0].name).toBe('Thesis, Argument');
    expect(parsed.criteria[0].description).toBe('Has "nuance"');
    expect(parsed.criteria[0].levels[0].description).toBe('no, thesis');
    expect(parsed.criteria[0].levels[1].label).toBe('Meets "quality" bar');
  });

  it('returns a null rubric and a file-level error for an empty CSV', () => {
    const result = parseRubricCsv('');
    expect(result.rubric).toBeNull();
    expect(result.errors).toEqual([
      { line: 0, reason: expect.stringContaining('empty') },
    ]);
  });
});
