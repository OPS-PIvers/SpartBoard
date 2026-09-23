// Per-period Flashcards keep cards in content/cards; results stay loading until that read settles.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  listeners: new Map<
    string,
    { next: (snap: unknown) => void; error: (err: unknown) => void }
  >(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segs: string[]) => ({ path: segs.join('/') })),
  onSnapshot: vi.fn(
    (
      ref: string | { path: string },
      next: (snap: unknown) => void,
      error: (err: unknown) => void
    ) => {
      h.listeners.set(typeof ref === 'string' ? ref : ref.path, {
        next,
        error,
      });
      return () => undefined;
    }
  ),
}));

import { useFlashcardResults } from '@/hooks/useFlashcardResults';

const SESSION = 'flashcard_sessions/fc-1';
const CONTENT = 'flashcard_sessions/fc-1/content/cards';
const CARDS = [{ id: 'c1', term: 'uno', definition: 'one' }];

const fire = (path: string, data: Record<string, unknown> | null) =>
  act(() => {
    h.listeners.get(path)?.next({
      exists: () => data !== null,
      id: 'fc-1',
      data: () => data,
    });
  });

beforeEach(() => h.listeners.clear());

describe('useFlashcardResults — per-period content', () => {
  it('stays loading until the content doc arrives, then merges its cards', () => {
    const { result } = renderHook(() => useFlashcardResults('fc-1'));
    fire(SESSION, { title: 'Numbers', cards: [], cardsInContent: true });
    expect(result.current.loading).toBe(true);
    fire(CONTENT, { cards: CARDS });
    expect(result.current.loading).toBe(false);
    expect(result.current.session?.cards).toEqual(CARDS);
  });

  it('stops loading when the content read errors', () => {
    const { result } = renderHook(() => useFlashcardResults('fc-1'));
    fire(SESSION, { title: 'Numbers', cards: [], cardsInContent: true });
    act(() => {
      h.listeners.get(CONTENT)?.error({ code: 'permission-denied' });
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.session?.cards).toEqual([]);
  });

  it('never opens a content listener for a legacy session', () => {
    const { result } = renderHook(() => useFlashcardResults('fc-1'));
    fire(SESSION, { title: 'Numbers', cards: CARDS });
    expect(result.current.loading).toBe(false);
    expect(h.listeners.has(CONTENT)).toBe(false);
    expect(result.current.session?.cards).toEqual(CARDS);
  });
});
