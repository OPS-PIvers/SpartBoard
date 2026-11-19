import { describe, expect, it } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import {
  printedGroupForPrint,
  printedGroupQuiz,
  printedGroupRecord,
  printedReprintGroups,
  printedSupports,
} from '@/utils/paperPrintedVersions';
import {
  hiddenOptionIdsForRule,
  printedGroupPicks,
  type ModificationGroup,
} from '@/components/common/library/assignStepper/modificationGroups';
import { toOverrideEditorQuestions } from '@/components/common/library/toOverrideEditorQuestions';
import { buildPaperTestHtml } from '@/utils/paperTestPrint';
import type { ClassStudentRow } from '@/utils/studentTargetRef';

const mc = (id: string, extra: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id,
  type: 'MC',
  text: `Question ${id}`,
  correctAnswer: 'Right',
  incorrectAnswers: ['W1', 'W2', 'W3'],
  timeLimit: 0,
  ...extra,
});

const quiz = (questions: QuizQuestion[]): QuizData => ({
  id: 'quiz-1',
  title: 'Gravity',
  questions,
  createdAt: 0,
  updatedAt: 0,
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

describe('printedGroupQuiz', () => {
  it('leaves the quiz alone with no changes', () => {
    const q = quiz([mc('q1', { modifiedText: 'Easier q1' })]);
    expect(printedGroupQuiz(q, group({})).questions).toEqual(q.questions);
  });

  it('drops the same wrong answers the device hides and keeps the right one', () => {
    const q = quiz([mc('q1', { optionOrder: [0, 1, 2, 3] })]);
    const hidden = hiddenOptionIdsForRule(toOverrideEditorQuestions(q), 'two');
    const printed = printedGroupQuiz(q, group({ answerChoices: 'two' }))
      .questions[0];
    expect(printed.correctAnswer).toBe('Right');
    expect(printed.incorrectAnswers).toHaveLength(1);
    expect(printed.optionOrder).toBeUndefined();
    const dropped = hidden?.q1.map((id) => Number(id.split('-').pop()));
    expect(dropped).not.toContain(
      ['W1', 'W2', 'W3'].indexOf(printed.incorrectAnswers[0])
    );
  });

  it('prints modified wording only for a group with modified questions', () => {
    const q = quiz([mc('q1', { modifiedText: ' Easier q1 ' }), mc('q2')]);
    const printed = printedGroupQuiz(q, group({ modifiedQuestions: true }));
    expect(printed.questions[0].text).toBe('Easier q1');
    expect(printed.questions[1].text).toBe('Question q2');
  });

  it("keeps every option on the teacher's own test paper", () => {
    const q = quiz([mc('q1', { paperOwnTest: true })]);
    const printed = printedGroupQuiz(q, group({ answerChoices: 'two' }));
    expect(printed.questions[0].incorrectAnswers).toHaveLength(3);
  });
});

describe('printed group picks', () => {
  const row = (key: string, rosterId: string): ClassStudentRow => ({
    key,
    ref: { kind: 'classlink', sourcedId: key },
    studentId: `s-${key}`,
    name: key,
    lastName: key,
    rosterId,
    rosterName: rosterId,
  });

  it('keeps printed groups with reachable students, numbered by position', () => {
    const picks = printedGroupPicks(
      [
        group({ id: 'a', studentKeys: ['k1'] }),
        group({ id: 'b', studentKeys: ['k2', 'gone'], printed: true }),
        group({ id: 'c', studentKeys: ['gone'], printed: true }),
      ],
      [row('k1', 'r1'), row('k2', 'r2')]
    );
    expect(picks).toHaveLength(1);
    expect(picks[0].number).toBe(2);
    expect(picks[0].students).toEqual([{ rosterId: 'r2', studentId: 's-k2' }]);
    expect(printedGroupRecord(picks[0])).toEqual({
      number: 2,
      answerChoices: 'all',
    });
    expect(printedGroupForPrint(picks[0])).toMatchObject({
      label: 'Group 2',
      students: { r2: ['s-k2'] },
    });
  });
});

describe('printed supports', () => {
  it('prints text, link and Drive supports after the test', () => {
    const supports = printedSupports([
      { kind: 'text', title: 'Word bank', text: 'mass, force' },
      { kind: 'link', title: 'Notes', url: 'https://example.com/n' },
      { kind: 'drive', title: 'Chart', fileId: 'abc' },
    ]);
    expect(supports[2].body).toBe('https://drive.google.com/file/d/abc/view');
    const html = buildPaperTestHtml({
      quizTitle: 'Gravity',
      questions: [{ row: 1, text: 'Q', choices: ['A', 'B'] }],
      supports,
    });
    expect(html).toContain('<h2>Supports</h2>');
    expect(html).toContain('mass, force');
    expect(html).toContain('https://example.com/n');
  });

  it('prints no supports page without supports', () => {
    expect(
      buildPaperTestHtml({ quizTitle: 'Gravity', questions: [] })
    ).not.toContain('Supports');
  });
});

describe('printedReprintGroups', () => {
  it('orders stacks by group and rebuilds each version', () => {
    const q = quiz([mc('q1', { modifiedText: 'Easier' })]);
    const batch = (id: string, number: number, modified: boolean) =>
      ({
        id,
        printedGroup: {
          number,
          answerChoices: 'two',
          ...(modified ? { modifiedQuestions: true } : {}),
        },
      }) as unknown as import('@/types').PaperBatch;
    const groups = printedReprintGroups(q, [
      batch('b2', 2, false),
      batch('b1', 1, true),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Group 1', 'Group 2']);
    expect(groups[0].quiz.questions[0].text).toBe('Easier');
    expect(groups[1].quiz.questions[0].text).toBe('Question q1');
    expect(groups[1].quiz.questions[0].incorrectAnswers).toHaveLength(1);
  });
});
