// Languages-tab hook (plan §8): Drive service and the callable are stubbed, so
// only the hook's own merge/review/staleness decisions are under test.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const saveTranslation = vi.fn(() => Promise.resolve('file-es'));
const loadTranslation = vi.fn();
const deleteTranslation = vi.fn(() => Promise.resolve());
const setDocMock = vi.fn(() => Promise.resolve());
const callableMock = vi.fn();

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  isAuthBypass: false,
}));
vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => ({ path: args.slice(1).join('/') }),
  setDoc: (...args: unknown[]) => setDocMock(...(args as [])),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callableMock,
}));
vi.mock('@/context/AuthContextValue', async () => {
  const { createContext } = await import('react');
  return { AuthContext: createContext<unknown>(undefined) };
});
vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: class {
    saveTranslation = saveTranslation;
    loadTranslation = loadTranslation;
    deleteTranslation = deleteTranslation;
  },
}));
vi.mock('@/utils/mockQuizDriveService', () => ({
  MockQuizDriveService: class {},
}));

import { createElement, type ReactNode } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { useQuizTranslations } from './useQuizTranslations';
import { hashQuestionForTranslation } from '@/utils/quizTranslationHash';
import type { QuizData, QuizMetadata, QuizTranslation } from '@/types';

const question = {
  id: 'q1',
  type: 'MC' as const,
  text: 'Which is prime?',
  correctAnswer: 'Seven',
  incorrectAnswers: ['Eight'],
  timeLimit: 0,
};

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Numbers',
  questions: [question],
  createdAt: 1,
  updatedAt: 1,
};

const translation = (overrides: Partial<QuizTranslation> = {}) =>
  ({
    locale: 'es',
    title: 'Números',
    questions: { q1: { text: '¿Cuál es primo?', choices: ['Siete', 'Ocho'] } },
    sourceHashes: { q1: 'stale-hash' },
    reviewedQuestionIds: ['q1'],
    model: 'gemini-3.5-flash-lite',
    generatedAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as QuizTranslation;

const metadata = (entryOverrides: Record<string, unknown> = {}): QuizMetadata =>
  ({
    id: 'quiz-1',
    title: 'Numbers',
    driveFileId: 'drive-quiz',
    questionCount: 1,
    createdAt: 1,
    updatedAt: 1,
    translations: {
      es: {
        driveFileId: 'file-es',
        reviewedCount: 1,
        staleCount: 0,
        questionCount: 1,
        sourceHashes: { q1: 'stale-hash' },
        updatedAt: 1,
        ...entryOverrides,
      },
    },
  }) as QuizMetadata;

// The hook reads auth via context, so a provider-less host must not throw.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    AuthContext.Provider,
    {
      value: {
        user: { uid: 'teacher-1' },
        googleAccessToken: 'token',
      } as never,
    },
    children
  );

beforeEach(() => {
  vi.clearAllMocks();
  saveTranslation.mockResolvedValue('file-es');
});

describe('useQuizTranslations', () => {
  it('loads a sidecar through the index driveFileId', async () => {
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    expect(loadTranslation).toHaveBeenCalledWith('file-es');
    expect(result.current.byLocale.es?.title).toBe('Números');
  });

  it('generate merges the callable result, writes the sidecar then the index', async () => {
    callableMock.mockResolvedValue({
      data: {
        title: 'Números',
        questions: {
          q1: { text: '¿Cuál es primo?', choices: ['Siete', 'Ocho'] },
        },
        sourceHashes: { q1: 'fresh-hash' },
        model: 'gemini-3.5-flash-lite',
        outputTokens: 100,
        cap: { remaining: 1999, total: 2000 },
      },
    });
    // No index row yet: the first generation for a locale needs no load.
    const { result } = renderHook(() => useQuizTranslations(quiz, null), {
      wrapper,
    });
    await act(async () => {
      await result.current.generate('es');
    });
    expect(result.current.cap).toEqual({ remaining: 1999, total: 2000 });
    expect(result.current.byLocale.es?.sourceHashes.q1).toBe('fresh-hash');
    expect(saveTranslation).toHaveBeenCalled();
    const indexWrite = setDocMock.mock.calls[0] as unknown as [
      unknown,
      { translations: Record<string, { driveFileId: string }> },
    ];
    expect(indexWrite[1].translations.es.driveFileId).toBe('file-es');
    expect(saveTranslation.mock.invocationCallOrder[0]).toBeLessThan(
      setDocMock.mock.invocationCallOrder[0]
    );
  });

  it('regenerating a question drops it from reviewedQuestionIds', async () => {
    loadTranslation.mockResolvedValue(translation());
    callableMock.mockResolvedValue({
      data: {
        questions: { q1: { text: 'nuevo', choices: ['Siete', 'Ocho'] } },
        sourceHashes: { q1: 'fresh-hash' },
        model: 'm',
        outputTokens: 1,
        cap: { remaining: 1, total: 2 },
      },
    });
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    await act(async () => {
      await result.current.generate('es', ['q1']);
    });
    expect(result.current.byLocale.es?.reviewedQuestionIds).toEqual([]);
  });

  it('editQuestion clears the id from reviewedQuestionIds', async () => {
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    expect(result.current.byLocale.es?.reviewedQuestionIds).toEqual(['q1']);
    act(() => {
      result.current.editQuestion('es', 'q1', { text: 'corregido' });
    });
    expect(result.current.byLocale.es?.questions.q1.text).toBe('corregido');
    expect(result.current.byLocale.es?.reviewedQuestionIds).toEqual([]);
  });

  it('setReviewed toggles without duplicating the id', async () => {
    loadTranslation.mockResolvedValue(translation({ reviewedQuestionIds: [] }));
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    act(() => result.current.setReviewed('es', 'q1', true));
    act(() => result.current.setReviewed('es', 'q1', true));
    expect(result.current.byLocale.es?.reviewedQuestionIds).toEqual(['q1']);
    act(() => result.current.setReviewed('es', 'q1', false));
    expect(result.current.byLocale.es?.reviewedQuestionIds).toEqual([]);
    await waitFor(() => expect(result.current.hasUnsavedChanges).toBe(false));
  });

  it('setReviewed saves the sidecar immediately, without a separate Save', async () => {
    loadTranslation.mockResolvedValue(translation({ reviewedQuestionIds: [] }));
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    act(() => result.current.setReviewed('es', 'q1', true));

    await waitFor(() => expect(saveTranslation).toHaveBeenCalledTimes(1));
    const call = saveTranslation.mock.calls[0] as unknown as [
      string,
      string,
      string,
      QuizTranslation,
      string | undefined,
    ];
    expect(call[3].reviewedQuestionIds).toEqual(['q1']);
    expect(call[4]).toBe('file-es');
    await waitFor(() => expect(result.current.hasUnsavedChanges).toBe(false));
  });

  it('reuses the first new sidecar file for rapid follow-up saves', async () => {
    saveTranslation.mockResolvedValue('file-new');
    callableMock.mockResolvedValue({
      data: {
        questions: {
          q1: { text: '¿Cuál es primo?', choices: ['Siete', 'Ocho'] },
        },
        sourceHashes: { q1: 'fresh-hash' },
        model: 'm',
        outputTokens: 1,
        cap: { remaining: 1, total: 2 },
      },
    });
    // No index row, and the metadata prop never updates during the test.
    const { result } = renderHook(() => useQuizTranslations(quiz, null), {
      wrapper,
    });
    await act(async () => {
      await result.current.generate('es');
    });
    act(() => result.current.setReviewed('es', 'q1', true));
    act(() => result.current.setReviewed('es', 'q1', false));

    await waitFor(() => expect(saveTranslation).toHaveBeenCalledTimes(3));
    const existingIds = saveTranslation.mock.calls.map(
      (c) => (c as unknown as unknown[])[4]
    );
    expect(existingIds).toEqual([undefined, 'file-new', 'file-new']);
    const last = saveTranslation.mock.calls[2] as unknown as [
      string,
      string,
      string,
      QuizTranslation,
    ];
    expect(last[3].reviewedQuestionIds).toEqual([]);
  });

  it('saveAll writes unsaved text edits and clears hasUnsavedChanges', async () => {
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    act(() => {
      result.current.editQuestion('es', 'q1', { text: 'corregido' });
    });
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(saveTranslation).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.saveAll();
    });
    const call = saveTranslation.mock.calls[0] as unknown as [
      string,
      string,
      string,
      QuizTranslation,
    ];
    expect(call[3].questions.q1.text).toBe('corregido');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('saveAll rejects and keeps the changes unsaved when Drive fails', async () => {
    loadTranslation.mockResolvedValue(translation());
    saveTranslation.mockRejectedValueOnce(new Error('Drive is unavailable'));
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    act(() => {
      result.current.editQuestion('es', 'q1', { text: 'corregido' });
    });
    await act(async () => {
      await expect(result.current.saveAll()).rejects.toThrow(
        'Drive is unavailable'
      );
    });
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it('staleIds flags a question whose live hash no longer matches', async () => {
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    await waitFor(() => expect(result.current.staleIds('es')).toEqual(['q1']));

    const fresh = await hashQuestionForTranslation(question);
    loadTranslation.mockResolvedValue(
      translation({ sourceHashes: { q1: fresh } })
    );
    const second = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await second.result.current.load('es');
    });
    await waitFor(() =>
      expect(second.result.current.staleIds('es')).toEqual([])
    );
  });

  it('recomputes staleIds when the quiz body changes after load', async () => {
    const fresh = await hashQuestionForTranslation(question);
    loadTranslation.mockResolvedValue(
      translation({ sourceHashes: { q1: fresh } })
    );
    const { result, rerender } = renderHook(
      ({ q }: { q: QuizData }) => useQuizTranslations(q, metadata()),
      { initialProps: { q: quiz }, wrapper }
    );
    await act(async () => {
      await result.current.load('es');
    });
    await waitFor(() => expect(result.current.staleIds('es')).toEqual([]));

    const edited: QuizData = {
      ...quiz,
      questions: [{ ...question, text: 'Which one is prime?' }],
    };
    rerender({ q: edited });
    await waitFor(() => expect(result.current.staleIds('es')).toEqual(['q1']));
  });

  it('skips hashing entirely when disabled, so staleness is never computed', async () => {
    // The sidecar hash is deliberately wrong: enabled would report q1 stale.
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(
      () => useQuizTranslations(quiz, metadata(), { enabled: false }),
      { wrapper }
    );
    await act(async () => {
      await result.current.load('es');
    });
    expect(result.current.staleIds('es')).toEqual([]);
  });

  it('derives enabled from the context feature gate when no flag is passed', async () => {
    const deniedWrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        AuthContext.Provider,
        {
          value: {
            user: { uid: 'teacher-1' },
            googleAccessToken: 'token',
            canAccessFeature: () => false,
          } as never,
        },
        children
      );
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper: deniedWrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    expect(result.current.staleIds('es')).toEqual([]);
  });

  it('surfaces a save failure as an error instead of throwing', async () => {
    loadTranslation.mockResolvedValue(translation());
    saveTranslation.mockRejectedValueOnce(new Error('Drive is unavailable'));
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    await act(async () => {
      await result.current.save('es');
    });
    expect(result.current.error).toBe('Drive is unavailable');
  });

  it('renders without an AuthProvider instead of throwing', () => {
    expect(() =>
      renderHook(() => useQuizTranslations(quiz, metadata()))
    ).not.toThrow();
  });

  it('refuses to generate while an indexed locale is still unloaded', async () => {
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.generate('es');
    });
    expect(callableMock).not.toHaveBeenCalled();
    expect(saveTranslation).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
      'quizTranslation.editor.error.unloadedLocale'
    );
    expect(result.current.needsLoad('es')).toBe(true);
  });

  it('marks a failed load as retryable and clears the flag on retry', async () => {
    loadTranslation.mockRejectedValueOnce(new Error('Drive is unavailable'));
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()), {
      wrapper,
    });
    await act(async () => {
      await result.current.load('es');
    });
    expect(result.current.error).toBe('Drive is unavailable');
    expect(result.current.loadFailed.es).toBe(true);

    loadTranslation.mockResolvedValueOnce(translation());
    await act(async () => {
      await result.current.load('es');
    });
    expect(result.current.loadFailed.es).toBe(false);
    expect(result.current.byLocale.es?.title).toBe('N\u00fameros');
    expect(result.current.needsLoad('es')).toBe(false);
  });
});
