import { describe, it, expect } from 'vitest';
import type { QuizResponse, QuizSessionSection } from '@/types';
import {
  chooseCountChanges,
  countedChoiceSections,
  countedChoicesPatch,
  restorePassedAnswers,
  sectionsWithCounts,
} from '@/utils/quizCountedChoices';
import {
  chosenQuestionIds,
  notChosenQuestionIds,
  overAnsweredResponseSections,
  withNotChosen,
} from '@/utils/quizSections';

const section: QuizSessionSection = {
  id: 's1',
  title: 'Short answer',
  chooseCount: 2,
  questionIds: ['a', 'b', 'c'],
};

const response = (
  extra: Partial<QuizResponse> = {}
): Pick<
  QuizResponse,
  | 'answers'
  | 'servedQuestionIds'
  | 'status'
  | 'countedChoices'
  | 'completedAttempts'
> => ({
  status: 'completed',
  completedAttempts: 1,
  answers: [
    { questionId: 'a', answer: 'one', answeredAt: 1 },
    { questionId: 'b', answer: 'two', answeredAt: 2 },
    { questionId: 'c', answer: 'three', answeredAt: 3 },
  ],
  ...extra,
});

describe('choose-N teacher picks', () => {
  it('counts the first N answered by default', () => {
    expect(notChosenQuestionIds(response(), [section])).toEqual(['c']);
  });

  it('counts the teacher picks on the same attempt', () => {
    const r = response({
      countedChoices: { attempt: 1, bySection: { s1: ['a', 'c'] } },
    });
    expect(notChosenQuestionIds(r, [section])).toEqual(['b']);
    const rows: (typeof r & { _notChosen?: string[] })[] = [r];
    expect(withNotChosen(rows, [section])[0]._notChosen).toEqual(['b']);
  });

  it('ignores picks from an earlier attempt', () => {
    const r = response({
      completedAttempts: 2,
      countedChoices: { attempt: 1, bySection: { s1: ['a', 'c'] } },
    });
    expect(notChosenQuestionIds(r, [section])).toEqual(['c']);
  });

  it('ignores the pick while a retake is in progress', () => {
    const r = response({
      status: 'in-progress',
      countedChoices: { attempt: 1, bySection: { s1: ['a', 'c'] } },
    });
    expect(notChosenQuestionIds(r, [section])).toEqual(['c']);
  });

  it('ignores a pick whose question no longer has an answer', () => {
    const answers = response().answers.filter((x) => x.questionId !== 'c');
    expect(chosenQuestionIds(section, answers, undefined, ['c', 'b'])).toEqual([
      'a',
      'b',
    ]);
  });

  it('never counts more than N, even from a stale pick', () => {
    expect(
      chosenQuestionIds(section, response().answers, undefined, ['a', 'b', 'c'])
    ).toEqual(['a', 'b']);
  });

  it('finds over-answered sections, passed answers with text included', () => {
    const passed = response({
      answers: [
        { questionId: 'a', answer: 'one', answeredAt: 1 },
        {
          questionId: 'b',
          answer: 'N/A',
          answeredAt: 2,
          unresponded: 'passed',
        },
        { questionId: 'c', answer: 'three', answeredAt: 3 },
      ],
    });
    expect(
      overAnsweredResponseSections(passed, [section]).map((o) => o.answeredIds)
    ).toEqual([['a', 'b', 'c']]);
    // The passed one doesn't count by default.
    expect(notChosenQuestionIds(passed, [section])).toEqual(['b']);
  });

  it('skips sections answered within N and unfinished responses', () => {
    const two = response({ answers: response().answers.slice(0, 2) });
    expect(overAnsweredResponseSections(two, [section])).toEqual([]);
    expect(
      overAnsweredResponseSections(response({ status: 'in-progress' }), [
        section,
      ])
    ).toEqual([]);
  });
});

describe('countedChoicesPatch', () => {
  it('saves exactly N picks and brings back a passed answer', () => {
    const r = response({
      answers: [
        { questionId: 'a', answer: 'one', answeredAt: 1 },
        {
          questionId: 'b',
          answer: 'real',
          answeredAt: 2,
          unresponded: 'passed',
        },
        { questionId: 'c', answer: 'three', answeredAt: 3 },
      ],
    });
    const patch = countedChoicesPatch(r, [section], 's1', ['b', 'c']);
    expect(patch?.countedChoices).toEqual({
      attempt: 1,
      bySection: { s1: ['b', 'c'] },
      revived: ['b'],
    });
    expect(patch?.answers[1].unresponded).toBeUndefined();
    expect(
      notChosenQuestionIds(
        { ...r, ...patch, countedChoices: patch?.countedChoices ?? undefined },
        [section]
      )
    ).toEqual(['a']);
  });

  it('sets a revived answer aside again on reset or swap', () => {
    const r = response({
      answers: [
        { questionId: 'a', answer: 'one', answeredAt: 1 },
        {
          questionId: 'b',
          answer: 'real',
          answeredAt: 2,
          unresponded: 'passed',
        },
        { questionId: 'c', answer: 'three', answeredAt: 3 },
      ],
    });
    const picked = countedChoicesPatch(r, [section], 's1', ['b', 'c']);
    expect(picked?.countedChoices?.revived).toEqual(['b']);
    if (!picked) throw new Error('expected a patch');
    const afterPick = {
      ...r,
      answers: picked.answers,
      countedChoices: picked.countedChoices ?? undefined,
    };
    const reset = countedChoicesPatch(afterPick, [section], 's1', null);
    expect(reset?.countedChoices).toBeNull();
    expect(reset?.answers[1].unresponded).toBe('passed');
    const swap = countedChoicesPatch(afterPick, [section], 's1', ['a', 'c']);
    expect(swap?.answers[1].unresponded).toBe('passed');
    expect(swap?.countedChoices).toEqual({
      attempt: 1,
      bySection: { s1: ['a', 'c'] },
    });
  });

  it('refuses a pick of the wrong size or outside the section', () => {
    expect(countedChoicesPatch(response(), [section], 's1', ['a'])).toBeNull();
    expect(
      countedChoicesPatch(response(), [section], 's1', ['a', 'z'])
    ).toBeNull();
    expect(
      countedChoicesPatch(response(), [section], 'nope', ['a', 'b'])
    ).toBeNull();
  });

  it('goes back to the first N on reset', () => {
    const r = response({
      countedChoices: { attempt: 1, bySection: { s1: ['a', 'c'] } },
    });
    expect(countedChoicesPatch(r, [section], 's1', null)?.countedChoices).toBe(
      null
    );
  });

  it('lists each section for the picker', () => {
    const rows = countedChoiceSections(
      response({
        countedChoices: { attempt: 1, bySection: { s1: ['b', 'c'] } },
      }),
      [section],
      [
        { id: 'a', text: 'A?' },
        { id: 'b', text: 'B?' },
        { id: 'c', text: 'C?' },
      ]
    );
    expect(rows).toEqual([
      {
        sectionId: 's1',
        title: 'Short answer',
        count: 2,
        options: [
          { questionId: 'a', number: 1, text: 'A?' },
          { questionId: 'b', number: 2, text: 'B?' },
          { questionId: 'c', number: 3, text: 'C?' },
        ],
        counted: ['b', 'c'],
        teacherPicked: true,
      },
    ]);
  });
});

describe('changing a section count', () => {
  it('finds sections whose count changed', () => {
    const before = {
      sections: [
        { id: 's1', title: 'A', chooseCount: 3 },
        { id: 's2', title: 'B' },
      ],
    };
    const after = {
      sections: [
        { id: 's1', title: 'A', chooseCount: 2 },
        { id: 's2', title: 'B' },
        { id: 's3', title: 'New', chooseCount: 1 },
      ],
    };
    expect([...chooseCountChanges(before, after)]).toEqual([['s1', 2]]);
  });

  it('writes the count onto session sections, or null when nothing changes', () => {
    const next = sectionsWithCounts([section], new Map([['s1', 1]]));
    expect(next?.[0].chooseCount).toBe(1);
    expect(sectionsWithCounts([section], new Map([['s1', 2]]))).toBeNull();
    const cleared = sectionsWithCounts([section], new Map([['s1', undefined]]));
    expect(cleared?.[0]).not.toHaveProperty('chooseCount');
  });
});

describe('restorePassedAnswers', () => {
  it('sets revived answers aside as passed again on reopen', () => {
    const r = response({
      countedChoices: {
        attempt: 1,
        bySection: { s1: ['b', 'c'] },
        revived: ['b'],
      },
    });
    const answers = restorePassedAnswers(r);
    expect(answers?.map((a) => a.unresponded)).toEqual([
      undefined,
      'passed',
      undefined,
    ]);
  });

  it('leaves answers alone with no revived pick or a pick from another attempt', () => {
    expect(restorePassedAnswers(response())).toBeNull();
    expect(
      restorePassedAnswers(
        response({
          countedChoices: { attempt: 1, bySection: { s1: ['a', 'b'] } },
        })
      )
    ).toBeNull();
    expect(
      restorePassedAnswers(
        response({
          countedChoices: {
            attempt: 0,
            bySection: { s1: ['b', 'c'] },
            revived: ['b'],
          },
        })
      )
    ).toBeNull();
  });
});
