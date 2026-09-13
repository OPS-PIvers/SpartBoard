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
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    googleAccessToken: 'token',
  }),
}));
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

beforeEach(() => {
  vi.clearAllMocks();
  saveTranslation.mockResolvedValue('file-es');
});

describe('useQuizTranslations', () => {
  it('loads a sidecar through the index driveFileId', async () => {
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()));
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
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()));
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
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()));
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
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()));
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
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()));
    await act(async () => {
      await result.current.load('es');
    });
    act(() => result.current.setReviewed('es', 'q1', true));
    act(() => result.current.setReviewed('es', 'q1', true));
    expect(result.current.byLocale.es?.reviewedQuestionIds).toEqual(['q1']);
    act(() => result.current.setReviewed('es', 'q1', false));
    expect(result.current.byLocale.es?.reviewedQuestionIds).toEqual([]);
  });

  it('staleIds flags a question whose live hash no longer matches', async () => {
    loadTranslation.mockResolvedValue(translation());
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()));
    await act(async () => {
      await result.current.load('es');
    });
    await waitFor(() => expect(result.current.staleIds('es')).toEqual(['q1']));

    const fresh = await hashQuestionForTranslation(question);
    loadTranslation.mockResolvedValue(
      translation({ sourceHashes: { q1: fresh } })
    );
    const second = renderHook(() => useQuizTranslations(quiz, metadata()));
    await act(async () => {
      await second.result.current.load('es');
    });
    await waitFor(() =>
      expect(second.result.current.staleIds('es')).toEqual([])
    );
  });

  it('surfaces a save failure as an error instead of throwing', async () => {
    loadTranslation.mockResolvedValue(translation());
    saveTranslation.mockRejectedValueOnce(new Error('Drive is unavailable'));
    const { result } = renderHook(() => useQuizTranslations(quiz, metadata()));
    await act(async () => {
      await result.current.load('es');
    });
    await act(async () => {
      await result.current.save('es');
    });
    expect(result.current.error).toBe('Drive is unavailable');
  });
});
