import { describe, expect, it } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import {
  boardRankRows,
  clampGameMinutes,
  countUnscoredQuestions,
  prepareReviewGame,
  prepareReviewQuiz,
  rankOrdinal,
  sectionStartingAt,
} from '@/utils/reviewLaunch';

const q = (id: string, type: QuizQuestion['type'] = 'MC'): QuizQuestion => ({
  id,
  type,
  text: id,
  timeLimit: 0,
  correctAnswer: type === 'free-response' ? '' : 'a',
  incorrectAnswers: type === 'MC' ? ['b'] : [],
});

const quiz = (overrides: Partial<QuizData>): QuizData => ({
  id: 'quiz',
  title: 'Quiz',
  questions: [],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('prepareReviewQuiz', () => {
  it('skips questions that need a teacher grade', () => {
    const prepared = prepareReviewQuiz(
      quiz({ questions: [q('a'), q('b', 'free-response'), q('c')] }),
      null
    );
    expect(prepared.questions.map((x) => x.id)).toEqual(['a', 'c']);
    expect(prepared.skippedCount).toBe(1);
  });

  it('plays every question of a choose-N section', () => {
    const prepared = prepareReviewQuiz(
      quiz({
        questions: [q('a'), q('b')],
        sections: [{ id: 's1', title: 'Part 1', chooseCount: 1 }],
        order: [
          { kind: 'section', id: 's1' },
          { kind: 'question', id: 'a' },
          { kind: 'question', id: 'b' },
        ],
      }),
      null
    );
    expect(prepared.sections).toEqual([{ id: 's1', title: 'Part 1' }]);
    expect(prepared.order?.map((e) => e.id)).toEqual(['s1', 'a', 'b']);
  });

  it('draws one bank set for the whole class, in slot position', () => {
    const bank: BankContent = {
      id: 'bank',
      title: 'Bank',
      questions: [q('p1'), q('p2'), q('p3')],
    };
    const prepared = prepareReviewQuiz(
      quiz({
        questions: [q('a'), q('b')],
        bankSlots: [
          {
            id: 'slot',
            bankId: 'bank',
            bankTitle: 'Bank',
            mode: 'random',
            count: 2,
            points: 3,
          },
        ],
        order: [
          { kind: 'question', id: 'a' },
          { kind: 'slot', id: 'slot' },
          { kind: 'question', id: 'b' },
        ],
      }),
      new Map([['bank', bank]]),
      () => 0
    );
    const ids = prepared.questions.map((x) => x.id);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe('a');
    expect(ids[3]).toBe('b');
    expect(ids.slice(1, 3).every((id) => id.startsWith('p'))).toBe(true);
    expect(prepared.questions[1].points).toBe(3);
    expect(prepared.order?.every((e) => e.kind !== 'slot')).toBe(true);
  });
});

describe('prepareReviewGame', () => {
  it('keeps pools for per-student draws and drops unscorable questions', () => {
    const bank: BankContent = {
      id: 'bank',
      title: 'Bank',
      questions: [q('p1'), q('p2', 'free-response'), q('p3')],
    };
    const prepared = prepareReviewGame(
      quiz({
        questions: [q('a', 'free-response'), q('b')],
        bankSlots: [
          {
            id: 'slot',
            bankId: 'bank',
            bankTitle: 'Bank',
            mode: 'random',
            count: 3,
            points: 2,
          },
        ],
        order: [
          { kind: 'question', id: 'a' },
          { kind: 'question', id: 'b' },
          { kind: 'slot', id: 'slot' },
        ],
      }),
      new Map([['bank', bank]])
    );
    expect(prepared.questions.map((x) => x.id)).toEqual(['b', 'p1', 'p3']);
    expect(prepared.bankSlots).toEqual([
      expect.objectContaining({
        id: 'slot',
        poolQuestionIds: ['p1', 'p3'],
        count: 2,
        position: 1,
      }),
    ]);
    expect(prepared.skippedCount).toBe(1);
  });

  it('leaves a plain quiz alone apart from unscorable questions', () => {
    const prepared = prepareReviewGame(
      quiz({ questions: [q('a'), q('b', 'free-response')] }),
      null
    );
    expect(prepared.questions.map((x) => x.id)).toEqual(['a']);
    expect(prepared.bankSlots).toBeUndefined();
  });

  it('clamps the game length', () => {
    expect(clampGameMinutes(undefined)).toBe(10);
    expect(clampGameMinutes(0)).toBe(1);
    expect(clampGameMinutes(500)).toBe(90);
    expect(clampGameMinutes(7.4)).toBe(7);
  });
});

describe('board ranking helpers', () => {
  it('keeps the legacy top 3 when no limit was chosen', () => {
    expect(boardRankRows(undefined)).toBe(3);
    expect(boardRankRows(10)).toBe(10);
    expect(boardRankRows('all')).toBe(Number.POSITIVE_INFINITY);
  });

  it('writes English ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(rankOrdinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
    ]);
  });
});

describe('sectionStartingAt', () => {
  const session = {
    sections: [{ id: 's1', title: 'Part 1', questionIds: ['a', 'b'] }],
  };
  it('returns the section only at its first question', () => {
    expect(sectionStartingAt(session, 'a')?.title).toBe('Part 1');
    expect(sectionStartingAt(session, 'b')).toBeUndefined();
    expect(sectionStartingAt({}, 'a')).toBeUndefined();
  });
});

describe('countUnscoredQuestions', () => {
  it('counts free-response questions', () => {
    expect(countUnscoredQuestions([q('a'), q('b', 'free-response')])).toBe(1);
  });
});
