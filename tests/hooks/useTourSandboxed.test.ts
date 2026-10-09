import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizData, QuizMetadata } from '@/types';
import type { UseQuizResult } from '@/hooks/useQuiz';
import {
  useSandboxedGuidedLearningAssignments,
  useSandboxedMiniAppAssignments,
  useSandboxedQuiz,
  useSandboxedQuizAssignments,
} from '@/hooks/useTourSandboxed';
import type { UseGuidedLearningAssignmentsResult } from '@/hooks/useGuidedLearningAssignments';
import type { UseMiniAppAssignmentsResult } from '@/hooks/useMiniAppAssignments';
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

  it('never imports a shared quiz during a tour', async () => {
    const api = {
      ...makeApi(),
      importSharedQuiz: vi.fn(),
    } as unknown as UseQuizResult;
    act(() => startTourSandbox());
    const { result } = renderHook(() => useSandboxedQuiz(api));
    await result.current.importSharedQuiz('share-1');
    expect(api.importSharedQuiz).not.toHaveBeenCalled();
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

describe('assignment mutators during a tour', () => {
  const quizAssignmentsApi = () =>
    ({
      assignments: [
        { id: 'a-real', quizId: 'real' },
        { id: 'a-picked', quizId: 'picked' },
      ],
      createAssignment: vi.fn().mockResolvedValue({ id: 'a-new', code: 'X' }),
      pauseAssignment: vi.fn().mockResolvedValue(undefined),
      deleteAssignment: vi.fn().mockResolvedValue(undefined),
      shareAssignment: vi.fn().mockResolvedValue('real-url'),
      shareAssignmentWithPlc: vi.fn().mockResolvedValue(undefined),
      publishAssignmentScores: vi.fn(),
    }) as unknown as UseQuizAssignmentsResult;

  it('leaves real assignments alone unless their quiz was picked', async () => {
    const api = quizAssignmentsApi();
    act(() => {
      startTourSandbox();
      setSandboxPassthrough(['picked']);
    });
    const { result } = renderHook(() => useSandboxedQuizAssignments(api));
    await result.current.pauseAssignment('a-real');
    await result.current.deleteAssignment('a-real');
    await result.current.shareAssignmentWithPlc('a-real', {} as never);
    await expect(
      result.current.publishAssignmentScores(
        'a-real',
        quiz('real'),
        'score-only'
      )
    ).resolves.toEqual({ responsesUpdated: 0, paperResponses: 0 });
    await expect(
      result.current.shareAssignment('a-real', quiz('real'))
    ).resolves.not.toBe('real-url');
    expect(api.pauseAssignment).not.toHaveBeenCalled();
    expect(api.deleteAssignment).not.toHaveBeenCalled();
    expect(api.shareAssignmentWithPlc).not.toHaveBeenCalled();
    expect(api.publishAssignmentScores).not.toHaveBeenCalled();
    expect(api.shareAssignment).not.toHaveBeenCalled();
    await result.current.pauseAssignment('a-picked');
    expect(api.pauseAssignment).toHaveBeenCalledWith('a-picked');
  });

  it("writes to an assignment it just made for a picked quiz before it's listed", async () => {
    const api = quizAssignmentsApi();
    act(() => {
      startTourSandbox();
      setSandboxPassthrough(['picked']);
    });
    const { result } = renderHook(() => useSandboxedQuizAssignments(api));
    await result.current.createAssignment(
      { id: 'picked', title: 'P', driveFileId: 'd', questions: [] },
      {} as never
    );
    expect(api.createAssignment).toHaveBeenCalledTimes(1);
    await result.current.pauseAssignment('a-new');
    expect(api.pauseAssignment).toHaveBeenCalledWith('a-new');
  });

  it('guards guided learning and mini app assignment mutators', async () => {
    const gl = {
      assignments: [{ id: 'g1', setId: 'real-set' }],
      archiveAssignment: vi.fn(),
      deleteAssignment: vi.fn(),
    } as unknown as UseGuidedLearningAssignmentsResult;
    const mini = {
      assignments: [{ id: 'm1', appId: 'real-app' }],
      endAssignment: vi.fn(),
      deleteAssignment: vi.fn(),
    } as unknown as UseMiniAppAssignmentsResult;
    act(() => startTourSandbox());
    const glHook = renderHook(() =>
      useSandboxedGuidedLearningAssignments(gl, 'uid')
    );
    const miniHook = renderHook(() => useSandboxedMiniAppAssignments(mini));
    await glHook.result.current.archiveAssignment('g1');
    await glHook.result.current.deleteAssignment('g1');
    await miniHook.result.current.endAssignment('m1');
    await miniHook.result.current.deleteAssignment('m1');
    expect(gl.archiveAssignment).not.toHaveBeenCalled();
    expect(gl.deleteAssignment).not.toHaveBeenCalled();
    expect(mini.endAssignment).not.toHaveBeenCalled();
    expect(mini.deleteAssignment).not.toHaveBeenCalled();
  });
});
