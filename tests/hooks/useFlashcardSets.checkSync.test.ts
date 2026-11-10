import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { useFlashcardSets } from '@/hooks/useFlashcardSets';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import type { FlashcardCard, FlashcardSet } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  orderBy: vi.fn(),
  query: vi.fn((_coll: unknown, ...clauses: unknown[]) => clauses),
  where: vi.fn((field: string, _op: string, value: unknown) => ({
    field,
    value,
  })),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
}));
const rescore = vi.fn((_data: unknown) => Promise.resolve({ data: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => rescore),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

interface BatchOp {
  op: 'set' | 'update';
  ref: unknown;
  data: Record<string, unknown>;
  options?: unknown;
}

let ops: BatchOp[] = [];

const card = (id: string, term: string, definition: string): FlashcardCard => ({
  id,
  term,
  definition,
});

const fixedSet: FlashcardSet = {
  id: 'set-1',
  title: 'Animales',
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
  cards: [card('a', 'gato', 'cat'), card('c', 'pez', 'fish')],
  folderId: null,
  createdAt: 1,
  updatedAt: 2,
};

const wrapper = (flags: string[]) =>
  function Auth({ children }: { children: ReactNode }) {
    return createElement(
      AuthContext.Provider,
      {
        value: {
          canAccessFeature: (id: string) => flags.includes(id),
        } as unknown as AuthContextType,
      },
      children
    );
  };

const snapshotOf = (prefix: string, docs: Array<Record<string, unknown>>) => ({
  empty: docs.length === 0,
  size: docs.length,
  docs: docs.map((data, i) => ({
    id: `${prefix}-${i}`,
    ref: `flashcard_sessions/${prefix}-${i}`,
    get: (key: string) => data[key],
  })),
});

const sessionsByKind = (
  study: Array<Record<string, unknown>>,
  check: Array<Record<string, unknown>>
) =>
  (getDocs as Mock).mockImplementation(
    (clauses: Array<{ field: string; value: unknown }>) => {
      const kind = clauses.find((c) => c.field === 'kind')?.value;
      return Promise.resolve(
        kind === 'check'
          ? snapshotOf('check', check)
          : snapshotOf('study', study)
      );
    }
  );

const staleCheck = {
  title: 'Animales',
  cards: [card('a', 'gato', 'dog'), card('b', 'perro', 'dog')],
};

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  (writeBatch as Mock).mockImplementation(() => ({
    set: (ref: unknown, data: Record<string, unknown>, options?: unknown) =>
      ops.push({ op: 'set', ref, data, options }),
    update: (ref: unknown, data: Record<string, unknown>) =>
      ops.push({ op: 'update', ref, data }),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }));
});

describe('useFlashcardSets open Check sync', () => {
  it('leaves Checks alone without the flag', async () => {
    sessionsByKind([], [staleCheck]);
    const { result } = renderHook(() => useFlashcardSets('t1'), {
      wrapper: wrapper([]),
    });
    let rewritten = -1;
    await act(async () => {
      rewritten = await result.current.saveSet(fixedSet);
    });
    expect(rewritten).toBe(0);
    expect(ops.some((op) => String(op.ref).includes('check-'))).toBe(false);
  });

  it('fixes cards a Check already has, keeping deleted ones and skipping new ones', async () => {
    sessionsByKind([{ cardsInContent: false }], [staleCheck]);
    const { result } = renderHook(() => useFlashcardSets('t1'), {
      wrapper: wrapper(['flashcards-check-sync']),
    });
    let rewritten = -1;
    await act(async () => {
      rewritten = await result.current.saveSet(fixedSet);
    });
    expect(rewritten).toBe(2);
    expect(rescore).toHaveBeenCalledWith({ assignmentId: 'check-0' });
    expect(
      ops.find((op) => op.ref === 'flashcard_sessions/check-0')?.data
    ).toEqual({
      cards: [card('a', 'gato', 'cat'), card('b', 'perro', 'dog')],
    });
  });

  it('writes a per-period Check’s cards into its content doc', async () => {
    sessionsByKind([], [{ title: 'Old', cardsInContent: true, cards: [] }]);
    (getDoc as Mock).mockResolvedValue({
      get: (key: string) => (key === 'cards' ? staleCheck.cards : undefined),
    });
    const { result } = renderHook(() => useFlashcardSets('t1'), {
      wrapper: wrapper(['flashcards-check-sync']),
    });
    await act(async () => {
      await result.current.saveSet(fixedSet);
    });
    expect(
      ops.find((op) => op.ref === 'flashcard_sessions/check-0')?.data
    ).toEqual({ title: 'Animales' });
    const content = ops.find(
      (op) => op.ref === 'flashcard_sessions/check-0/content/cards'
    );
    expect(content?.data).toEqual({
      cards: [card('a', 'gato', 'cat'), card('b', 'perro', 'dog')],
    });
    expect(content?.options).toEqual({ merge: true });
    expect(rescore).toHaveBeenCalledWith({ assignmentId: 'check-0' });
  });

  it('writes nothing for a Check that is already current', async () => {
    sessionsByKind(
      [],
      [{ title: 'Animales', cards: [card('a', 'gato', 'cat')] }]
    );
    const { result } = renderHook(() => useFlashcardSets('t1'), {
      wrapper: wrapper(['flashcards-check-sync']),
    });
    let rewritten = -1;
    await act(async () => {
      rewritten = await result.current.saveSet(fixedSet);
    });
    expect(rewritten).toBe(0);
    expect(ops.some((op) => String(op.ref).includes('check-'))).toBe(false);
    expect(rescore).not.toHaveBeenCalled();
  });

  it('only re-titles, without a re-score, when the cards already match', async () => {
    sessionsByKind([], [{ title: 'Old', cards: [card('a', 'gato', 'cat')] }]);
    const { result } = renderHook(() => useFlashcardSets('t1'), {
      wrapper: wrapper(['flashcards-check-sync']),
    });
    await act(async () => {
      await result.current.saveSet(fixedSet);
    });
    expect(
      ops.find((op) => op.ref === 'flashcard_sessions/check-0')?.data
    ).toEqual({ title: 'Animales' });
    expect(rescore).not.toHaveBeenCalled();
  });
});
