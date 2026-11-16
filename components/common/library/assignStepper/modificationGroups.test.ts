import { describe, expect, it } from 'vitest';
import type { ClassStudentRow } from '@/utils/studentTargetRef';
import {
  formatModificationGroupsValue,
  hiddenOptionIdsForRule,
  overridesFromGroups,
  rowsInClasses,
  withGroupStudents,
  type ModificationGroup,
} from './modificationGroups';

const mc = (id: string, wrong: number) => ({
  id,
  label: id,
  options: [
    { id: `${id}-correct`, text: 'R', isCorrect: true },
    ...Array.from({ length: wrong }, (_, i) => ({
      id: `${id}-incorrect-${i}`,
      text: `W${i}`,
      isCorrect: false,
    })),
  ],
});
const QUESTIONS = [mc('q1', 3), mc('q2', 1), { id: 'q3', label: 'q3' }];

const row = (key: string, rosterId: string, extra = {}): ClassStudentRow => ({
  key,
  ref: { kind: 'classlink', sourcedId: key },
  studentId: key,
  name: key,
  lastName: key,
  rosterId,
  rosterName: rosterId,
  ...extra,
});

const group = (patch: Partial<ModificationGroup>): ModificationGroup => ({
  id: 'g',
  studentKeys: [],
  answerChoices: 'all',
  time: 'standard',
  readAloud: false,
  ...patch,
});

describe('hiddenOptionIdsForRule', () => {
  it('hides nothing for All', () => {
    expect(hiddenOptionIdsForRule(QUESTIONS, 'all')).toBeUndefined();
  });

  it('drops one wrong answer and never the right one', () => {
    const hidden = hiddenOptionIdsForRule(QUESTIONS, 'drop-one');
    expect(hidden?.q1).toHaveLength(1);
    expect(hidden?.q1[0]).toMatch(/^q1-incorrect-/);
    expect(hidden?.q2).toBeUndefined();
    expect(hidden?.q3).toBeUndefined();
  });

  it('leaves the right answer and one wrong answer for 2 choices', () => {
    const hidden = hiddenOptionIdsForRule(QUESTIONS, 'two');
    expect(hidden?.q1).toHaveLength(2);
    expect(hidden?.q1).not.toContain('q1-correct');
  });

  it('picks the same options every time', () => {
    expect(hiddenOptionIdsForRule(QUESTIONS, 'two')).toEqual(
      hiddenOptionIdsForRule(QUESTIONS, 'two')
    );
  });
});

describe('overridesFromGroups', () => {
  const rows = [
    row('a', 'c1'),
    row('b', 'c1', { defaultOverride: { language: 'es' } }),
    row('c', 'c1'),
  ];

  it('sets grouped students only, keeping standing accommodations', () => {
    const out = overridesFromGroups(
      [group({ studentKeys: ['a', 'b'], time: 1.5, readAloud: true })],
      rows,
      QUESTIONS
    );
    expect(out.a).toEqual({ timeMultiplier: 1.5, readAloud: true });
    expect(out.b).toEqual({
      timeMultiplier: 1.5,
      readAloud: true,
      language: 'es',
    });
    expect(out.c).toBeUndefined();
  });

  it('never shortens standing extra time', () => {
    const standing = [
      row('s', 'c1', { defaultOverride: { timeMultiplier: 2 } }),
      row('u', 'c1', { defaultOverride: { timeMultiplier: 'unlimited' } }),
    ];
    const out = overridesFromGroups(
      [group({ studentKeys: ['s', 'u', 'a'], time: 1.5 })],
      [...rows, ...standing],
      QUESTIONS
    );
    expect(out.s.timeMultiplier).toBe(2);
    expect(out.u.timeMultiplier).toBe('unlimited');
    expect(out.a.timeMultiplier).toBe(1.5);
  });

  it('ignores students no longer in the checked classes', () => {
    expect(
      overridesFromGroups(
        [group({ studentKeys: ['zz'], time: 2 })],
        rows,
        QUESTIONS
      )
    ).toEqual({});
  });
});

describe('withGroupStudents', () => {
  it('moves a student out of their old group', () => {
    const next = withGroupStudents(
      [group({ id: 'g1', studentKeys: ['a', 'b'] }), group({ id: 'g2' })],
      'g2',
      ['b']
    );
    expect(next[0].studentKeys).toEqual(['a']);
    expect(next[1].studentKeys).toEqual(['b']);
  });
});

describe('rowsInClasses', () => {
  it('keeps only students the Classes step sends the quiz to', () => {
    const rows = ['a', 'b', 'c', 'd'].map((id, i) =>
      row(`classlink:${id}`, ['c1', 'c1', 'c2', 'c3'][i])
    );
    const kept = rowsInClasses(rows, {
      classIds: ['c1', 'c2'],
      studentsByClass: { c1: [{ kind: 'classlink', sourcedId: 'a' }] },
    });
    expect(kept.map((r) => r.key)).toEqual(['classlink:a', 'classlink:c']);
  });
});

describe('formatModificationGroupsValue', () => {
  const scope = new Set(['a', 'b', 'c']);
  it('says None with nobody picked', () => {
    expect(formatModificationGroupsValue([group({})], scope)).toBe('None');
  });
  it('lists one group’s rules', () => {
    expect(
      formatModificationGroupsValue(
        [group({ studentKeys: ['a', 'b'], time: 1.5, answerChoices: 'two' })],
        scope
      )
    ).toBe('2 students: 1.5x time, 2 answer choices');
  });
  it('counts several groups', () => {
    expect(
      formatModificationGroupsValue(
        [
          group({ studentKeys: ['a'] }),
          group({ id: 'h', studentKeys: ['b', 'zz'] }),
        ],
        scope
      )
    ).toBe('2 students in 2 groups');
  });
});
