import { describe, expect, it, vi } from 'vitest';
import type { QuestionBankData, QuizData, QuizQuestion } from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import {
  buildSharedQuizContent,
  restoreSharedQuizContent,
} from '@/utils/quizShareContent';

const q = (id: string): QuizQuestion =>
  ({
    id,
    type: 'MC',
    text: `Question ${id}`,
    correctAnswer: 'a',
    incorrectAnswers: ['b'],
    timeLimit: 0,
  }) as QuizQuestion;

const bankOnlyQuiz: QuizData = {
  id: 'quiz-1',
  title: 'Unit 3 check',
  questions: [],
  bankSlots: [
    {
      id: 'slot-1',
      bankId: 'bank-a',
      bankTitle: 'Fractions',
      mode: 'random',
      count: 2,
    },
    {
      id: 'slot-2',
      bankId: 'bank-b',
      syncGroupId: 'group-b',
      bankTitle: 'Decimals',
      mode: 'random',
      count: 1,
    },
  ],
  order: [
    { kind: 'section', id: 'sec-1' },
    { kind: 'slot', id: 'slot-1' },
    { kind: 'slot', id: 'slot-2' },
  ],
  sections: [{ id: 'sec-1', title: 'Part A' }],
  createdAt: 1,
  updatedAt: 1,
};

const banks = new Map<string, BankContent>([
  [
    'bank-a',
    { id: 'bank-a', title: 'Fractions', questions: [q('a1'), q('a2')] },
  ],
  ['group-b', { id: 'bank-b', title: 'Decimals', questions: [q('b1')] }],
]);

describe('buildSharedQuizContent', () => {
  it('carries bank draws, their banks, order and sections', async () => {
    const content = await buildSharedQuizContent(bankOnlyQuiz, () =>
      Promise.resolve(banks)
    );
    expect(content.questions).toEqual([]);
    expect(content.bankSlots).toHaveLength(2);
    expect(content.banks?.map((b) => b.key)).toEqual(['bank-a', 'group-b']);
    expect(content.banks?.[0].questions.map((x) => x.id)).toEqual(['a1', 'a2']);
    expect(content.order).toEqual(bankOnlyQuiz.order);
    expect(content.sections).toEqual(bankOnlyQuiz.sections);
    expect(content).not.toHaveProperty('id');
  });

  it('refuses to share when a bank cannot be loaded', async () => {
    await expect(
      buildSharedQuizContent(bankOnlyQuiz, () =>
        Promise.resolve(new Map([...banks].slice(0, 1)))
      )
    ).rejects.toThrow('"Decimals" could not be loaded');
  });

  it('leaves plain quizzes as they were', async () => {
    const plain: QuizData = {
      id: 'p',
      title: 'Plain',
      questions: [q('x')],
      createdAt: 1,
      updatedAt: 1,
    };
    const load = vi.fn();
    expect(await buildSharedQuizContent(plain, load)).toEqual({
      title: 'Plain',
      questions: [q('x')],
    });
    expect(load).not.toHaveBeenCalled();
  });
});

describe('restoreSharedQuizContent', () => {
  it('saves each bank to the importer and points the slots at it', async () => {
    const shared = await buildSharedQuizContent(bankOnlyQuiz, () =>
      Promise.resolve(banks)
    );
    const saved: QuestionBankData[] = [];
    let n = 0;
    const { content, banks: restoredBanks } = await restoreSharedQuizContent(
      shared,
      (bank) => {
        saved.push(bank);
        return Promise.resolve();
      },
      () => `new-${++n}`,
      99
    );
    expect(saved.map((b) => [b.id, b.title, b.questions.length])).toEqual([
      ['new-1', 'Fractions', 2],
      ['new-2', 'Decimals', 1],
    ]);
    expect(content.bankSlots).toEqual([
      {
        id: 'slot-1',
        bankId: 'new-1',
        bankTitle: 'Fractions',
        mode: 'random',
        count: 2,
      },
      {
        id: 'slot-2',
        bankId: 'new-2',
        bankTitle: 'Decimals',
        mode: 'random',
        count: 1,
      },
    ]);
    expect([...restoredBanks.keys()]).toEqual(['new-1', 'new-2']);
    expect(content.sections).toEqual(bankOnlyQuiz.sections);
    expect(content.order).toEqual(bankOnlyQuiz.order);
    expect(content).not.toHaveProperty('banks');
  });

  it('keeps slots from older links that carried no banks', async () => {
    const saveBank = vi.fn();
    const { content } = await restoreSharedQuizContent(
      {
        title: bankOnlyQuiz.title,
        questions: [],
        bankSlots: bankOnlyQuiz.bankSlots,
      },
      saveBank
    );
    expect(saveBank).not.toHaveBeenCalled();
    expect(content.bankSlots).toEqual(bankOnlyQuiz.bankSlots);
  });
});
