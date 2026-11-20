import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { QuizData } from '@/types';
import { useLiveSessionQuiz } from './useLiveSessionQuiz';

const quiz = (id: string, questionId: string): QuizData => ({
  id,
  title: id,
  questions: [
    {
      id: questionId,
      type: 'MC',
      text: 'What is 2 + 2?',
      correctAnswer: '4',
      incorrectAnswers: ['3'],
      timeLimit: 0,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
});

type Props = {
  loaded: QuizData | null;
  fileId: string | null;
  session: { id: string; quizId: string } | null;
  liveFileId: string | undefined;
};

const render = (initial: Props) =>
  renderHook(
    (p: Props) =>
      useLiveSessionQuiz(p.loaded, p.fileId, p.session, p.liveFileId),
    { initialProps: initial }
  );

const live = quiz('quiz-b', 'b1');
const other = quiz('quiz-a', 'a1');
const session = { id: 'assignment-b', quizId: 'quiz-b' };

describe('useLiveSessionQuiz', () => {
  it('keeps the live quiz while another quiz is previewed', () => {
    const hook = render({
      loaded: live,
      fileId: 'file-b',
      session,
      liveFileId: 'file-b',
    });
    expect(hook.result.current).toBe(live);
    hook.rerender({
      loaded: other,
      fileId: 'file-a',
      session,
      liveFileId: 'file-b',
    });
    expect(hook.result.current).toBe(live);
    hook.rerender({
      loaded: null,
      fileId: 'file-a',
      session,
      liveFileId: 'file-b',
    });
    expect(hook.result.current).toBe(live);
  });

  it('is empty when the live quiz was never loaded', () => {
    const hook = render({
      loaded: other,
      fileId: 'file-a',
      session,
      liveFileId: 'file-b',
    });
    expect(hook.result.current).toBeNull();
  });

  it('does not take the library file for a session graded on its frozen copy', () => {
    const hook = render({
      loaded: live,
      fileId: 'file-b',
      session,
      liveFileId: 'frozen-b',
    });
    expect(hook.result.current).toBeNull();
    const frozen = quiz('quiz-b', 'b1-drawn');
    hook.rerender({
      loaded: frozen,
      fileId: 'frozen-b',
      session,
      liveFileId: 'frozen-b',
    });
    expect(hook.result.current).toBe(frozen);
    hook.rerender({
      loaded: live,
      fileId: 'file-b',
      session,
      liveFileId: 'frozen-b',
    });
    expect(hook.result.current).toBe(frozen);
  });

  it('drops the held quiz when a different session goes live', () => {
    const hook = render({
      loaded: live,
      fileId: 'file-b',
      session,
      liveFileId: 'file-b',
    });
    hook.rerender({
      loaded: other,
      fileId: 'file-a',
      session: { id: 'assignment-b2', quizId: 'quiz-b' },
      liveFileId: 'file-b',
    });
    expect(hook.result.current).toBeNull();
  });

  it('has nothing without a live session', () => {
    const hook = render({
      loaded: live,
      fileId: 'file-b',
      session: null,
      liveFileId: undefined,
    });
    expect(hook.result.current).toBeNull();
  });
});
