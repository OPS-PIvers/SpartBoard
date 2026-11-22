import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
  reloadLive?: () => Promise<QuizData | null>;
};

const render = (initial: Props) =>
  renderHook(
    (p: Props) =>
      useLiveSessionQuiz(
        p.loaded,
        p.fileId,
        p.session,
        p.liveFileId,
        p.reloadLive
      ),
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
    // saveDriveSnapshot gives the frozen copy a fresh id; the session keeps the library quiz id.
    const frozen = quiz('frozen-copy-id', 'b1-drawn');
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

  it('reveals with the edited answer key on a frozen-copy session', async () => {
    const frozen = quiz('frozen-copy-id', 'b1');
    const rekeyed: QuizData = {
      ...frozen,
      questions: [{ ...frozen.questions[0], correctAnswer: '3' }],
    };
    const reloadLive = vi.fn(() => Promise.resolve<QuizData | null>(rekeyed));
    const base = { session, liveFileId: 'frozen-b', reloadLive };
    const hook = render({ ...base, loaded: frozen, fileId: 'frozen-b' });
    // Opening the library quiz in the editor is not an edit.
    hook.rerender({ ...base, loaded: live, fileId: 'file-b' });
    expect(hook.result.current).toBe(frozen);
    expect(reloadLive).not.toHaveBeenCalled();
    // An editor save hands back a new object for the same library file.
    hook.rerender({ ...base, loaded: { ...live }, fileId: 'file-b' });
    await waitFor(() => expect(hook.result.current).toBe(rekeyed));
    expect(hook.result.current?.questions[0].correctAnswer).toBe('3');
    expect(reloadLive).toHaveBeenCalledTimes(1);
  });

  it('keeps the newest answer key when two saves land close together', async () => {
    const frozen = quiz('frozen-copy-id', 'b1');
    const first = { ...frozen };
    const second = { ...frozen };
    let finishFirst: (data: QuizData) => void = () => undefined;
    const reloadLive = vi
      .fn<() => Promise<QuizData | null>>()
      .mockReturnValueOnce(
        new Promise<QuizData>((resolve) => {
          finishFirst = resolve;
        })
      )
      .mockResolvedValueOnce(second);
    const base = { session, liveFileId: 'frozen-b', reloadLive };
    const hook = render({ ...base, loaded: frozen, fileId: 'frozen-b' });
    hook.rerender({ ...base, loaded: live, fileId: 'file-b' });
    hook.rerender({ ...base, loaded: { ...live }, fileId: 'file-b' });
    hook.rerender({ ...base, loaded: { ...live }, fileId: 'file-b' });
    await waitFor(() => expect(hook.result.current).toBe(second));
    finishFirst(first);
    await Promise.resolve();
    expect(hook.result.current).toBe(second);
  });

  it('does not reload when the session grades the library file itself', () => {
    const reloadLive = vi.fn(() => Promise.resolve<QuizData | null>(null));
    const base = { session, liveFileId: 'file-b', reloadLive };
    const hook = render({ ...base, loaded: live, fileId: 'file-b' });
    const edited = { ...live };
    hook.rerender({ ...base, loaded: edited, fileId: 'file-b' });
    expect(hook.result.current).toBe(edited);
    expect(reloadLive).not.toHaveBeenCalled();
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
