import { describe, it, expect, vi } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import { resolveQuizAssignContent } from '@/utils/quizAssignBankDraw';

const q = (id: string): QuizQuestion =>
  ({
    id,
    type: 'MC',
    text: id,
    timeLimit: 0,
    correctAnswer: 'a',
    incorrectAnswers: ['b'],
  }) as QuizQuestion;

const baseQuiz = (over: Partial<QuizData> = {}): QuizData =>
  ({
    id: 'quiz-1',
    title: 'Vocab',
    questions: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as QuizData;

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
    } as Partial<QuizData>);
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
