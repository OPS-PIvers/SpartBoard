import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizData, QuizMetadata } from '@/types';
import type { UseQuizResult } from '@/hooks/useQuiz';
import {
  useSandboxedQuiz,
  useSandboxedQuizAssignments,
} from '@/hooks/useTourSandboxed';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import {
  endTourSandbox,
  setSandboxPassthrough,
  startTourSandbox,
} from '@/utils/tourSandbox';

const meta = (id: string): QuizMetadata => ({
  id,
  title: id,
  driveFileId: `drive-${id}`,
  questionCount: 1,
  createdAt: 1,
  updatedAt: 1,
});
const quiz = (id: string, title = id) =>
  ({ id, title, questions: [] }) as unknown as QuizData;

const makeApi = () =>
  ({
    quizzes: [meta('real')],
    saveQuiz: vi.fn().mockResolvedValue(meta('saved')),
    loadQuizData: vi.fn().mockResolvedValue(quiz('real')),
    deleteQuiz: vi.fn().mockResolvedValue(undefined),
  }) as unknown as UseQuizResult;

afterEach(() => act(() => endTourSandbox()));

describe('useSandboxedQuiz', () => {
  it('passes everything through when no tour sandbox is on', () => {
    const api = makeApi();
    const { result } = renderHook(() => useSandboxedQuiz(api));
    expect(result.current).toBe(api);
  });

  it('keeps saves, loads and deletes in memory during a tour', async () => {
    const api = makeApi();
    act(() => startTourSandbox());
    const { result } = renderHook(() => useSandboxedQuiz(api));
    let saved: QuizMetadata | undefined;
    await act(async () => {
      saved = await result.current.saveQuiz(quiz('new', 'New quiz'));
    });
    expect(api.saveQuiz).not.toHaveBeenCalled();
    expect(result.current.quizzes.map((q) => q.id)).toEqual(['new', 'real']);
    await expect(
      result.current.loadQuizData(saved?.driveFileId ?? '')
    ).resolves.toMatchObject({ title: 'New quiz' });
    await act(async () => {
      await result.current.deleteQuiz('real', 'drive-real');
    });
    expect(api.deleteQuiz).not.toHaveBeenCalled();
    expect(result.current.quizzes.map((q) => q.id)).toEqual(['new']);
  });

  it("writes a teacher's picked quiz for real", async () => {
    const api = makeApi();
    act(() => {
      startTourSandbox();
      setSandboxPassthrough(['real']);
    });
    const { result } = renderHook(() => useSandboxedQuiz(api));
    await act(async () => {
      await result.current.saveQuiz(quiz('real'));
    });
    expect(api.saveQuiz).toHaveBeenCalledTimes(1);
  });
});

describe('useSandboxedQuizAssignments', () => {
  it('fakes an assignment for a sandboxed quiz', async () => {
    const api = {
      createAssignment: vi.fn(),
    } as unknown as UseQuizAssignmentsResult;
    act(() => startTourSandbox());
    const { result } = renderHook(() => useSandboxedQuizAssignments(api));
    const created = await result.current.createAssignment(
      { id: 'q', title: 'Q', driveFileId: 'd', questions: [] },
      {} as never
    );
    expect(api.createAssignment).not.toHaveBeenCalled();
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
  });
});
