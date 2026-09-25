import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizSessionSection } from '@/types';
import {
  chosenQuestionIds,
  effectiveChooseCount,
  isLockedByChooseCount,
  isSectionAnswered,
  sectionProgress,
  sessionSectionsFor,
  shuffleWithinSections,
} from '@/utils/quizSections';
import { quizOrder } from '@/utils/questionBanks';

const q = (id: string): QuizQuestion => ({
  id,
  text: id,
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
  timeLimit: 0,
});

const answer = (questionId: string, text: string) => ({
  questionId,
  answer: text,
});

const pickTwo: QuizSessionSection = {
  id: 's2',
  title: 'Short Answer',
  chooseCount: 2,
  questionIds: ['q17', 'q18', 'q19'],
};

describe('sessionSectionsFor', () => {
  it('gives each section the questions and bank pools after it', () => {
    const sections = sessionSectionsFor(
      {
        questions: ['q1', 'q2', 'p1', 'p2', 'q3'].map(q),
        order: [
          { kind: 'question', id: 'q1' },
          { kind: 'section', id: 'a' },
          { kind: 'question', id: 'q2' },
          { kind: 'slot', id: 'slot-1' },
          { kind: 'section', id: 'b' },
          { kind: 'question', id: 'q3' },
        ],
        sections: [
          { id: 'a', title: ' Part A ', directions: '  ' },
          { id: 'b', title: 'Part B', chooseCount: 1 },
        ],
      },
      [{ id: 'slot-1', poolQuestionIds: ['p1', 'p2'] }]
    );
    expect(sections).toEqual([
      { id: 'a', title: 'Part A', questionIds: ['q2', 'p1', 'p2'] },
      { id: 'b', title: 'Part B', chooseCount: 1, questionIds: ['q3'] },
    ]);
  });

  it('drops an empty section and one with no record', () => {
    expect(
      sessionSectionsFor({
        questions: [q('q1')],
        order: [
          { kind: 'section', id: 'gone' },
          { kind: 'question', id: 'q1' },
          { kind: 'section', id: 'empty' },
        ],
        sections: [{ id: 'empty', title: 'Empty' }],
      })
    ).toEqual([]);
  });
});

describe('quizOrder', () => {
  it('keeps a section entry whose record exists', () => {
    const order = quizOrder({
      questions: [q('q1')],
      order: [
        { kind: 'section', id: 'a' },
        { kind: 'question', id: 'q1' },
        { kind: 'section', id: 'missing' },
      ],
      sections: [{ id: 'a', title: 'A' }],
    });
    expect(order).toEqual([
      { kind: 'section', id: 'a' },
      { kind: 'question', id: 'q1' },
    ]);
  });
});

describe('choose N of M (E13)', () => {
  it('counts only answers with content', () => {
    expect(isSectionAnswered([answer('q17', '<p> </p>')], 'q17')).toBe(false);
    expect(isSectionAnswered([answer('q17', 'yes')], 'q17')).toBe(true);
    expect(
      isSectionAnswered(
        [{ questionId: 'q17', answer: 'x', unresponded: 'passed' }],
        'q17'
      )
    ).toBe(false);
  });

  it('locks the rest once N are answered, and a cleared answer frees one', () => {
    const two = [answer('q17', 'a'), answer('q18', 'b')];
    expect(isLockedByChooseCount([pickTwo], two, 'q19')).toBe(true);
    expect(isLockedByChooseCount([pickTwo], two, 'q18')).toBe(false);
    const cleared = [answer('q17', ''), answer('q18', 'b')];
    expect(isLockedByChooseCount([pickTwo], cleared, 'q19')).toBe(false);
  });

  it('keeps the first N in section order when more were answered', () => {
    const three = [answer('q19', 'c'), answer('q17', 'a'), answer('q18', 'b')];
    expect(chosenQuestionIds(pickTwo, three)).toEqual(['q17', 'q18']);
  });

  it('never asks for more than the student was served', () => {
    expect(effectiveChooseCount(pickTwo, ['q17', 'q18'])).toBeUndefined();
    expect(
      sectionProgress(pickTwo, [answer('q17', 'a')], ['q17', 'q18', 'q19'])
    ).toMatchObject({ total: 3, required: 2, answered: 1 });
  });
});

describe('shuffleWithinSections', () => {
  it('shuffles inside each run and keeps sections together', () => {
    const reverse = <T>(items: T[]) => [...items].reverse();
    const out = shuffleWithinSections(
      ['q1', 'q17', 'q18', 'q19', 'q20'].map((id) => ({ id })),
      [pickTwo],
      reverse
    );
    expect(out.map((x) => x.id)).toEqual(['q1', 'q19', 'q18', 'q17', 'q20']);
  });
});
