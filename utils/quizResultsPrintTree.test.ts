import { describe, expect, it } from 'vitest';
import type { Course } from '@/utils/course/contract';
import { buildPrintStudentTree, NO_SECTION_NAME } from './quizResultsPrintTree';

const course = (id: string, name: string, rosterIds: string[]) =>
  ({ id, name, rosterIds }) as unknown as Course;

const rows = [
  { key: 'a', period: 'P1' },
  { key: 'b', period: 'P1' },
  { key: 'c', period: 'P2' },
  { key: 'd', period: 'WIN' },
  { key: 'e', period: null },
];
const rosters = [
  { id: 'r1', name: 'P1' },
  { id: 'r2', name: 'P2' },
  { id: 'r3', name: 'WIN' },
];

describe('buildPrintStudentTree', () => {
  it('lists classes at the top level without Courses', () => {
    const tree = buildPrintStudentTree(rows, rosters, []);
    expect(tree.map((n) => n.kind)).toEqual([
      'section',
      'section',
      'section',
      'section',
    ]);
    expect(tree[0]).toEqual({
      kind: 'section',
      section: { id: 'r1', name: 'P1', keys: ['a', 'b'] },
    });
    expect(tree[3]).toEqual({
      kind: 'section',
      section: {
        id: `period:${NO_SECTION_NAME}`,
        name: NO_SECTION_NAME,
        keys: ['e'],
      },
    });
  });

  it('nests a Course with two or more classes and leaves the rest flat', () => {
    const tree = buildPrintStudentTree(rows, rosters, [
      course('k1', 'Math 7', ['r1', 'r2']),
      course('k2', 'WIN', ['r3']),
    ]);
    expect(tree[0]).toMatchObject({
      kind: 'course',
      id: 'k1',
      name: 'Math 7',
      sections: [
        { id: 'r1', keys: ['a', 'b'] },
        { id: 'r2', keys: ['c'] },
      ],
    });
    expect(tree[1]).toMatchObject({ kind: 'section', section: { id: 'r3' } });
    expect(tree).toHaveLength(3);
  });

  it('keeps a period with no matching class as its own row', () => {
    const tree = buildPrintStudentTree(
      [{ key: 'x', period: 'Old period' }],
      rosters,
      [course('k1', 'Math 7', ['r1', 'r2'])]
    );
    expect(tree).toEqual([
      {
        kind: 'section',
        section: { id: 'period:Old period', name: 'Old period', keys: ['x'] },
      },
    ]);
  });
});
