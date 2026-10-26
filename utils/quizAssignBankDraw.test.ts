import { describe, it, expect, vi } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import {
  applyCurrentAnswerKeys,
  resolveQuizAssignContent,
  withCurrentAnswerKeys,
} from '@/utils/quizAssignBankDraw';

const q = (id: string): QuizQuestion => ({
  id,
  type: 'MC',
  text: id,
  timeLimit: 0,
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
});

const baseQuiz = (over: Partial<QuizData> = {}): QuizData => ({
  id: 'quiz-1',
  title: 'Vocab',
  questions: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('resolveQuizAssignContent', () => {
  it('passes a plain quiz through untouched', async () => {
    const saveDriveSnapshot = vi.fn();
    const out = await resolveQuizAssignContent(
      baseQuiz({ questions: [q('q1')] }),
      'drive-1',
      { loadBankContentsForQuiz: vi.fn(), saveDriveSnapshot }
    );
    expect(out.questions.map((x) => x.id)).toEqual(['q1']);
    expect(out.driveFileId).toBe('drive-1');
    expect(out.bankSlots).toBeUndefined();
    expect(saveDriveSnapshot).not.toHaveBeenCalled();
  });

  it('resolves an all-bank quiz into its pool and a frozen copy', async () => {
    const quiz = baseQuiz({
      bankSlots: [
        {
          id: 's1',
          bankId: 'bank-1',
          bankTitle: 'Bank',
          mode: 'random',
          count: 2,
        },
      ],
    });
    const bank = {
      questions: [q('b1'), q('b2'), q('b3')],
    } as unknown as BankContent;
    const saveDriveSnapshot = vi.fn().mockResolvedValue('snap-1');
    const out = await resolveQuizAssignContent(quiz, 'drive-1', {
      loadBankContentsForQuiz: vi
        .fn()
        .mockResolvedValue(new Map([['bank-1', bank]])),
      saveDriveSnapshot,
    });
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.bankSlots?.length).toBe(1);
    expect(out.driveFileId).toBe('snap-1');
    expect(out.resolvedDriveFileId).toBe('snap-1');
    expect(saveDriveSnapshot).toHaveBeenCalledOnce();
  });
});

const fib = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'b1',
  type: 'FIB',
  text: 'Studies of identical twins are called ____.',
  timeLimit: 0,
  correctAnswer: 'Twin studies',
  incorrectAnswers: [],
  alternateAnswers: ['Twins'],
  points: 2,
  ...over,
});

const bankOf = (...questions: QuizQuestion[]) =>
  new Map([['bank-1', { questions }]]);

const slot = (id: string, bankId: string) => ({
  id,
  bankId,
  bankTitle: bankId,
  mode: 'random' as const,
});
const lib = (questions: QuizQuestion[] = []) => ({
  questions,
  bankSlots: [slot('s1', 'bank-1')],
});

describe('applyCurrentAnswerKeys', () => {
  it('takes a bank question’s new also-accepted answers but keeps the slot’s points', () => {
    const frozen = baseQuiz({ questions: [fib()] });
    const out = applyCurrentAnswerKeys(
      frozen,
      lib(),
      bankOf(fib({ points: 1, alternateAnswers: ['Twins', 'Twins studies'] }))
    );
    expect(out.questions[0].alternateAnswers).toEqual([
      'Twins',
      'Twins studies',
    ]);
    expect(out.questions[0].points).toBe(2);
    expect(out.questions[0].text).toBe(frozen.questions[0].text);
  });

  it('drops a key field the bank question no longer has', () => {
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [fib()] }),
      lib(),
      bankOf(fib({ alternateAnswers: undefined, correctAnswer: 'Twins' }))
    );
    expect(out.questions[0].alternateAnswers).toBeUndefined();
    expect(out.questions[0].correctAnswer).toBe('Twins');
  });

  it('lets a fixed question’s current key win over a bank copy with the same id', () => {
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [fib()] }),
      lib([fib({ correctAnswer: 'From quiz' })]),
      bankOf(fib({ correctAnswer: 'From bank' }))
    );
    expect(out.questions[0].correctAnswer).toBe('From quiz');
  });

  it('moves the correct choice when the choices themselves are unchanged', () => {
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [q('m1')] }),
      lib(),
      bankOf({ ...q('m1'), correctAnswer: 'b', incorrectAnswers: ['a'] })
    );
    expect(out.questions[0].correctAnswer).toBe('b');
    expect(out.questions[0].incorrectAnswers).toEqual(['a']);
  });

  it('keeps the frozen key when students saw different choices or a different type', () => {
    const frozen = baseQuiz({ questions: [q('m1'), fib()] });
    const out = applyCurrentAnswerKeys(
      frozen,
      lib(),
      bankOf(
        { ...q('m1'), incorrectAnswers: ['c'] },
        fib({ correctAnswer: 'Twin studies\u001FNature' })
      )
    );
    expect(out).toBe(frozen);
  });

  it('grades with the frozen copy when the library quiz cannot load', async () => {
    const frozen = baseQuiz({ questions: [fib()] });
    const out = await withCurrentAnswerKeys(frozen, 'drive-1', {
      loadQuizData: () => Promise.reject(new Error('gone')),
      loadBankContentsForQuiz: vi.fn(),
    });
    expect(out).toBe(frozen);
  });

  it('takes a shared id from the slot first in quiz order, whatever order the banks loaded in', () => {
    const banks = new Map([
      ['bank-2', { questions: [fib({ correctAnswer: 'Second' })] }],
      ['bank-1', { questions: [fib({ correctAnswer: 'First' })] }],
    ]);
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [fib()] }),
      {
        questions: [],
        bankSlots: [slot('s1', 'bank-1'), slot('s2', 'bank-2')],
      },
      banks
    );
    expect(out.questions[0].correctAnswer).toBe('First');
  });
});
