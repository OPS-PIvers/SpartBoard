import { describe, expect, it } from 'vitest';
import type { ClassRoster, QuizQuestion } from '@/types';
import type { ClassStudentRow } from '@/utils/studentTargetRef';
import {
  formatModificationGroupsValue,
  groupRuleLabels,
  hiddenOptionIdsForRule,
  overrideForGroup,
  overridesFromGroups,
  withQuizAnswerChoices,
  rowsInClasses,
  standingDriveFileIds,
  standingGroupsFor,
  withGroupStudents,
  withStandingGroups,
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
  speechToText: false,
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

  it('gives grouped students exactly their group’s rules', () => {
    const out = overridesFromGroups(
      [group({ studentKeys: ['a', 'b'], time: 1.5, readAloud: true })],
      rows,
      QUESTIONS
    );
    expect(out.a).toEqual({ timeMultiplier: 1.5, readAloud: true });
    expect(out.b).toEqual({ timeMultiplier: 1.5, readAloud: true });
    expect(out.c).toBeUndefined();
  });

  it('clears the class preset of a student taken out of every group', () => {
    const out = overridesFromGroups([group({})], rows, QUESTIONS);
    expect(out).toEqual({ b: {} });
  });

  it('turns Speech to text on and never clears a standing one', () => {
    const on = group({ studentKeys: ['a'], speechToText: true });
    expect(overrideForGroup(on, undefined, QUESTIONS)).toEqual({
      speechToText: true,
    });
    expect(
      overrideForGroup(group({}), { speechToText: true }, QUESTIONS)
    ).toEqual({ speechToText: true });
    expect(groupRuleLabels(on)).toEqual(['speech to text']);
  });

  it('lets a group loosen a class preset for this assignment', () => {
    const standing = [
      row('s', 'c1', { defaultOverride: { timeMultiplier: 2 } }),
    ];
    const out = overridesFromGroups(
      [group({ studentKeys: ['s', 'a'], time: 1.5 })],
      [...rows, ...standing],
      QUESTIONS
    );
    expect(out.s.timeMultiplier).toBe(1.5);
    expect(out.a.timeMultiplier).toBe(1.5);
  });

  it('keeps carried focus rules', () => {
    const out = overridesFromGroups(
      [
        group({
          studentKeys: ['a'],
          carried: { blockCopyPaste: false, tabAwayLimit: 30 },
        }),
      ],
      rows,
      QUESTIONS
    );
    expect(out.a).toEqual({ blockCopyPaste: false, tabAwayLimit: 30 });
  });

  it('gives every grouped student the group’s supports', () => {
    const supports = [
      { kind: 'text' as const, title: 'Word bank', text: 'cell, nucleus' },
    ];
    const out = overridesFromGroups(
      [group({ studentKeys: ['a', 'b'], supports })],
      rows,
      QUESTIONS
    );
    expect(out.a.supports).toEqual(supports);
    expect(out.b).toEqual({ supports });
  });

  it('turns on modified questions for grouped students', () => {
    const out = overridesFromGroups(
      [group({ studentKeys: ['a'], modifiedQuestions: true })],
      rows,
      QUESTIONS
    );
    expect(out.a.modifiedQuestions).toBe(true);
  });

  it('marks a printed group’s students as on paper', () => {
    const out = overridesFromGroups(
      [group({ studentKeys: ['a'], printed: true })],
      rows,
      QUESTIONS
    );
    expect(out.a.onPaper).toBe(true);
  });

  it('ignores students no longer in the checked classes', () => {
    expect(
      overridesFromGroups(
        [group({ studentKeys: ['zz'], time: 2 })],
        rows.filter((r) => !r.defaultOverride),
        QUESTIONS
      )
    ).toEqual({});
  });
});

describe('class presets as groups', () => {
  const rows = [
    row('a', 'c1', {
      defaultOverride: { timeMultiplier: 1.5, readAloud: true, language: 'es' },
    }),
    row('b', 'c1'),
    row('c', 'c1', {
      defaultOverride: { language: 'es', readAloud: true, timeMultiplier: 1.5 },
    }),
    row('d', 'c1', {
      defaultOverride: {
        answerChoices: 3,
        blockCopyPaste: false,
        modifiedQuestions: true,
      },
    }),
  ];

  it('makes one group per distinct preset', () => {
    const groups = standingGroupsFor(rows, new Set());
    expect(groups.map((g) => g.studentKeys)).toEqual([['a', 'c'], ['d']]);
    expect(groups[0]).toMatchObject({
      time: 1.5,
      readAloud: true,
      language: 'es',
      answerChoices: 'all',
    });
    expect(groups[1]).toMatchObject({
      answerChoices: 'drop-one',
      modifiedQuestions: true,
      carried: { blockCopyPaste: false },
    });
  });

  it('applies the same rules the preset would', () => {
    const groups = standingGroupsFor(rows, new Set());
    const out = overridesFromGroups(groups, rows, QUESTIONS);
    expect(out.a).toEqual({
      timeMultiplier: 1.5,
      readAloud: true,
      language: 'es',
    });
    expect(out.d).toMatchObject({
      modifiedQuestions: true,
      blockCopyPaste: false,
      hiddenOptionIdsByQuestion: {
        q1: [expect.stringMatching(/^q1-incorrect/)],
      },
    });
    expect(out.b).toBeUndefined();
  });

  it('replaces the blank starting group and skips students already seeded', () => {
    const blank = group({ id: 'blank' });
    const first = withStandingGroups([blank], rows, new Set());
    expect(first.some((g) => g.id === 'blank')).toBe(false);
    expect(withStandingGroups(first, rows, new Set(['a', 'c', 'd']))).toBe(
      first
    );
  });

  it('never deletes a preset’s Drive file', () => {
    const withFile = [
      row('f', 'c1', {
        defaultOverride: {
          supports: [{ kind: 'drive', title: 'Notes', fileId: 'file-1' }],
        },
      }),
    ];
    expect(standingDriveFileIds(withFile)).toEqual(new Set(['file-1']));
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
  const student = (id: string) => ({
    id,
    firstName: id,
    lastName: id,
    pin: id,
    classLinkSourcedId: id,
  });
  const roster = (id: string, ids: string[]): ClassRoster => ({
    id,
    name: id,
    driveFileId: null,
    studentCount: ids.length,
    createdAt: 0,
    students: ids.map(student),
  });
  const rosters = [
    roster('c1', ['a', 'b']),
    roster('c2', ['c', 'b']),
    roster('c3', ['d']),
  ];
  const rows = ['a', 'b', 'c', 'd'].map((id, i) =>
    row(`classlink:${id}`, ['c1', 'c1', 'c2', 'c3'][i])
  );

  it('keeps only students the Classes step sends the quiz to', () => {
    const kept = rowsInClasses(
      rows,
      {
        classIds: ['c1'],
        studentsByClass: { c1: [{ kind: 'classlink', sourcedId: 'a' }] },
      },
      rosters
    );
    expect(kept.map((r) => r.key)).toEqual(['classlink:a']);
  });

  it('keeps a student skipped in one class but sent through another', () => {
    const kept = rowsInClasses(
      rows,
      {
        classIds: ['c1', 'c2'],
        studentsByClass: { c1: [{ kind: 'classlink', sourcedId: 'a' }] },
      },
      rosters
    );
    expect(kept.map((r) => r.key)).toEqual([
      'classlink:a',
      'classlink:b',
      'classlink:c',
    ]);
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
  it('counts supports', () => {
    expect(
      formatModificationGroupsValue(
        [
          group({
            studentKeys: ['a'],
            supports: [
              { kind: 'link', title: 'Notes', url: 'https://example.org' },
              { kind: 'drive', title: 'Map', fileId: '1AbCdEfGhIjK' },
            ],
          }),
        ],
        scope
      )
    ).toBe('1 student: 2 supports');
  });
  it('names modified questions', () => {
    expect(
      formatModificationGroupsValue(
        [group({ studentKeys: ['a'], modifiedQuestions: true })],
        scope
      )
    ).toBe('1 student: modified questions');
  });
  it('names a printed version', () => {
    expect(
      formatModificationGroupsValue(
        [group({ studentKeys: ['a'], printed: true })],
        scope
      )
    ).toBe('1 student: printed version');
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

describe('standing answer choices', () => {
  it('a group left at All keeps the class answer choices', () => {
    const out = overrideForGroup(
      group({ answerChoices: 'all' }),
      { answerChoices: 2 },
      QUESTIONS
    );
    expect(out.hiddenOptionIdsByQuestion?.q1).toHaveLength(2);
    expect(out.hiddenOptionIdsByQuestion?.q2).toBeUndefined();
  });

  it('a group never loosens a class rule, and joins supports', () => {
    const own = { kind: 'text' as const, title: 'Own', text: 'a' };
    const shared = { kind: 'text' as const, title: 'Group', text: 'b' };
    const out = overrideForGroup(
      group({ answerChoices: 'drop-one', supports: [shared] }),
      { answerChoices: 2, supports: [own] },
      QUESTIONS
    );
    expect(out.hiddenOptionIdsByQuestion?.q1).toHaveLength(2);
    expect(out.supports).toEqual([own, shared]);
  });

  it('turns answer choices into hidden option text for the quiz', () => {
    const questions = [
      {
        id: 'q1',
        type: 'MC',
        text: 'Q',
        correctAnswer: 'R',
        incorrectAnswers: ['W0', 'W1', 'W2'],
        timeLimit: 0,
      },
    ] as unknown as QuizQuestion[];
    const out = withQuizAnswerChoices(
      {
        a: { answerChoices: 3 },
        b: { readAloud: true },
        c: { answerChoices: 2, hiddenOptionIdsByQuestion: { q1: ['W0'] } },
      },
      questions
    );
    expect(out.a.hiddenOptionIdsByQuestion?.q1).toHaveLength(1);
    expect(out.a.hiddenOptionIdsByQuestion?.q1[0]).toMatch(/^W\d$/);
    expect(out.b).toEqual({ readAloud: true });
    expect(out.c.hiddenOptionIdsByQuestion).toEqual({ q1: ['W0'] });
  });
});
