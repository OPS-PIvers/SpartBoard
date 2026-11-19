import { describe, expect, it, vi } from 'vitest';
import type { QuizQuestion, QuizTranslation } from '@/types';
import { hashQuestionForTranslation } from './quizTranslationHash';
import { autoTranslateForAssign } from './quizAutoTranslate';

const q = (id: string, text: string) =>
  ({
    id,
    type: 'MC',
    text,
    timeLimit: 0,
    correctAnswer: 'A',
    incorrectAnswers: ['B', 'C'],
  }) as unknown as QuizQuestion;

const QUIZ = {
  id: 'quiz1',
  title: 'Cells',
  questions: [q('q1', 'One'), q('q2', 'Two')],
};

const deps = (saved: QuizTranslation[] = []) => ({
  loadTranslation: vi.fn(),
  saveTranslation: vi.fn((_l: string, p: QuizTranslation) => {
    saved.push(p);
    return Promise.resolve('file-1');
  }),
  translate: vi.fn(async (_locale: string, asked?: string[]) => {
    const ids = asked ?? QUIZ.questions.map((x) => x.id);
    return {
      questions: Object.fromEntries(
        ids.map((id) => [id, { text: `es ${id}` }])
      ),
      sourceHashes: Object.fromEntries(
        await Promise.all(
          ids.map(async (id): Promise<[string, string]> => [
            id,
            await hashQuestionForTranslation(
              QUIZ.questions.find((x) => x.id === id) as QuizQuestion
            ),
          ])
        )
      ),
      model: 'm',
    };
  }),
  writeIndex: vi.fn(() => Promise.resolve()),
  deleteTranslation: vi.fn(() => Promise.resolve()),
});

describe('autoTranslateForAssign', () => {
  it('translates a missing language and approves it so it serves', async () => {
    const saved: QuizTranslation[] = [];
    const d = deps(saved);
    const index = await autoTranslateForAssign(QUIZ, undefined, ['es'], d);
    expect(d.translate).toHaveBeenCalledWith('es', undefined);
    expect(saved[0].reviewedQuestionIds).toEqual(['q1', 'q2']);
    expect(index?.es).toMatchObject({
      driveFileId: 'file-1',
      reviewedCount: 2,
      staleCount: 0,
      questionCount: 2,
    });
    expect(d.writeIndex).toHaveBeenCalledWith('es', index?.es);
  });

  it('leaves a covered language alone', async () => {
    const d = deps();
    const index = {
      es: {
        driveFileId: 'f',
        reviewedCount: 2,
        staleCount: 0,
        questionCount: 2,
        sourceHashes: {},
        updatedAt: 0,
      },
    };
    expect(await autoTranslateForAssign(QUIZ, index, ['es'], d)).toBe(index);
    expect(d.translate).not.toHaveBeenCalled();
  });

  it('deletes a new file when the index write fails', async () => {
    const d = deps();
    d.writeIndex.mockRejectedValueOnce(new Error('offline'));
    await autoTranslateForAssign(QUIZ, undefined, ['es'], d, vi.fn());
    expect(d.deleteTranslation).toHaveBeenCalledWith('file-1');
  });

  it('keeps English when translation fails', async () => {
    const d = deps();
    d.translate.mockRejectedValueOnce(new Error('cap'));
    const onError = vi.fn();
    expect(
      await autoTranslateForAssign(QUIZ, undefined, ['es'], d, onError)
    ).toBeUndefined();
    expect(onError).toHaveBeenCalledWith('es', expect.any(Error));
  });
});
