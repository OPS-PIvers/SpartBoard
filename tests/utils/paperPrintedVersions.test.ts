import { describe, expect, it } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import {
  printedGroupForPrint,
  printedGroupQuiz,
  printedGroupRecord,
  printedReprintGroups,
  printedSupports,
  recordPick,
  studentCopyPick,
  unprintedCopyPicks,
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

  it('prints only the questions the group answers, in quiz order', () => {
    const q = quiz([mc('q1'), mc('q2'), mc('q3')]);
    const printed = printedGroupQuiz(q, group({ questionIds: ['q3', 'q1'] }));
    expect(printed.questions.map((x) => x.id)).toEqual(['q1', 'q3']);
  });

  it('keeps the group questions on the saved record, so a reprint matches', () => {
    const record = printedGroupRecord({
      group: group({ printed: true, questionIds: ['q2'] }),
      number: 1,
      students: [],
    });
    expect(record.questionIds).toEqual(['q2']);
    const q = quiz([mc('q1'), mc('q2')]);
    const [reprint] = printedReprintGroups(q, [
      {
        id: 'b',
        quizId: 'quiz-1',
        rosterIds: [],
        questionCount: 1,
        choiceCount: 4,
        seats: {},
        spareSeats: [],
        pagesPerSheet: 1,
        createdAt: 0,
        printedGroup: record,
      },
    ]);
    expect(reprint.quiz.questions.map((x) => x.id)).toEqual(['q2']);
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

  it('prints the modified stimuli only for a group with modified questions', () => {
    const q = quiz([
      mc('q1', { stimulusIds: ['s1'], modifiedStimulusIds: ['s2'] }),
      mc('q2', { stimulusIds: ['s1'] }),
    ]);
    const printed = printedGroupQuiz(q, group({ modifiedQuestions: true }));
    expect(printed.questions[0].stimulusIds).toEqual(['s2']);
    expect(printed.questions[1].stimulusIds).toEqual(['s1']);
    expect(printedGroupQuiz(q, group({})).questions[0].stimulusIds).toEqual([
      's1',
    ]);
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

describe('student copy', () => {
  it("carries one student's hidden choices, wording, supports and language", () => {
    const pick = studentCopyPick(
      { rosterId: 'r1', studentId: 's1' },
      {
        hiddenOptionIdsByQuestion: { q1: ['W2'] },
        modifiedQuestions: true,
        supports: [{ kind: 'text', title: 'Bank', text: 'words' }],
        language: 'es',
      }
    );
    expect(pick).toMatchObject({
      number: 0,
      single: true,
      students: [{ rosterId: 'r1', studentId: 's1' }],
      group: { modifiedQuestions: true, language: 'es' },
    });
    const printed = printedGroupQuiz(
      quiz([mc('q1', { modifiedText: 'Easier 1' }), mc('q2')]),
      pick.group,
      pick
    );
    expect(printed.questions[0].text).toBe('Easier 1');
    expect(printed.questions[0].incorrectAnswers).toEqual(['W1', 'W3']);
    expect(printed.questions[1].incorrectAnswers).toEqual(['W1', 'W2', 'W3']);
    // Spanish with nothing reviewed prints in English, as a group's does.
    expect(printedGroupForPrint(pick).label).toBe('Student copy · English');
    expect(
      printedGroupForPrint(
        studentCopyPick({ rosterId: 'r', studentId: 's' }, {})
      ).label
    ).toBe('Student copy');
  });

  it('prints only the questions the student was given', () => {
    const pick = studentCopyPick(
      { rosterId: 'r1', studentId: 's1' },
      { questionIds: ['q3', 'q1'] }
    );
    expect(pick.questionIds).toEqual(['q3', 'q1']);
    const printed = printedGroupQuiz(
      quiz([mc('q1'), mc('q2'), mc('q3')]),
      pick.group,
      pick
    );
    expect(printed.questions.map((q) => q.id)).toEqual(['q1', 'q3']);
    expect(printedGroupRecord(pick).questionIds).toEqual(['q3', 'q1']);
  });

  it("keeps the last wrong answer and the teacher's own test whole", () => {
    const printed = printedGroupQuiz(
      quiz([
        mc('q1', { incorrectAnswers: ['W1'] }),
        mc('q2', { paperOwnTest: true }),
      ]),
      { answerChoices: 'all' },
      { hiddenChoices: { q1: ['W1'], q2: ['W1'] } }
    );
    expect(printed.questions[0].incorrectAnswers).toEqual(['W1']);
    expect(printed.questions[1].incorrectAnswers).toEqual(['W1', 'W2', 'W3']);
  });

  it('round-trips through the stack record for a reprint', () => {
    const pick = studentCopyPick(
      { rosterId: 'r1', studentId: 's1' },
      { hiddenOptionIdsByQuestion: { q1: ['W3'] } }
    );
    const record = printedGroupRecord(pick);
    expect(record).toMatchObject({
      number: 0,
      single: true,
      hiddenChoices: { q1: ['W3'] },
    });
    expect(recordPick(record)).toMatchObject({
      single: true,
      hiddenChoices: { q1: ['W3'] },
    });
    const [reprint] = printedReprintGroups(quiz([mc('q1')]), [
      { id: 'b', printedGroup: record } as never,
    ]);
    expect(reprint.label).toBe('Student copy');
    expect(reprint.quiz.questions[0].incorrectAnswers).toEqual(['W1', 'W2']);
  });

  it('never counts as a planned group printing', () => {
    const plans = [{ number: 1, answerChoices: 'all' as const, students: [] }];
    expect(
      unprintedCopyPicks(plans, [
        { printedGroup: { number: 1, answerChoices: 'all', single: true } },
      ])
    ).toHaveLength(1);
  });
});
