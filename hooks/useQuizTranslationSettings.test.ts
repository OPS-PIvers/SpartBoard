// The curated-language hook must mirror the server's absent-doc fallback and never strand a teacher with zero languages.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuizTranslationSettings } from './useQuizTranslationSettings';
import {
  DEFAULT_QUIZ_TRANSLATION_SETTINGS,
  QUIZ_TRANSLATION_ALL_CODES,
} from '@/config/quizTranslation';

type SnapshotCb = (snap: {
  exists: () => boolean;
  data: () => unknown;
}) => void;
type ErrorCb = (err: Error) => void;

const { listeners, onSnapshot } = vi.hoisted(() => {
  const listeners: { next: SnapshotCb; error: ErrorCb }[] = [];
  return {
    listeners,
    onSnapshot: vi.fn((_ref: unknown, next: SnapshotCb, error: ErrorCb) => {
      listeners.push({ next, error });
      return vi.fn();
    }),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ __ref: 'admin_settings/quiz_translation' })),
  onSnapshot,
}));
vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));

beforeEach(() => {
  listeners.length = 0;
  onSnapshot.mockClear();
});

describe('useQuizTranslationSettings', () => {
  it('falls back to every curated code when the doc is absent', () => {
    const { result } = renderHook(() => useQuizTranslationSettings());
    act(() => {
      listeners[0].next({ exists: () => false, data: () => undefined });
    });
    expect(result.current.settings.enabledLanguages).toEqual([
      ...QUIZ_TRANSLATION_ALL_CODES,
    ]);
    expect(result.current.languages.map((l) => l.code)).toEqual([
      ...QUIZ_TRANSLATION_ALL_CODES,
    ]);
  });

  it('filters the catalog by the admin-curated list', () => {
    const { result } = renderHook(() => useQuizTranslationSettings());
    act(() => {
      listeners[0].next({
        exists: () => true,
        data: () => ({ enabledLanguages: ['so', 'bogus'] }),
      });
    });
    expect(result.current.languages.map((l) => l.code)).toEqual(['so']);
  });

  it('returns the defaults rather than zero languages when the read fails', () => {
    const { result } = renderHook(() => useQuizTranslationSettings());
    act(() => {
      listeners[0].next({
        exists: () => true,
        data: () => ({ enabledLanguages: ['es'] }),
      });
    });
    expect(result.current.languages.map((l) => l.code)).toEqual(['es']);
    act(() => {
      listeners[0].error(new Error('permission-denied'));
    });
    expect(result.current.settings).toEqual(DEFAULT_QUIZ_TRANSLATION_SETTINGS);
  });

  it('never subscribes when disabled', () => {
    const { result } = renderHook(() => useQuizTranslationSettings(false));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(result.current.settings).toEqual(DEFAULT_QUIZ_TRANSLATION_SETTINGS);
  });
});
