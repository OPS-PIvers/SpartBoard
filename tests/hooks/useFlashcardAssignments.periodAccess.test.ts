// Per-period Flashcards assignments: the cards move to content/cards in the create batch,
// and a delete removes that doc on its own before the session, since no rule can reach it after.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { readAllDocsPaged } from '@/utils/firestorePaging';
import { useFlashcardAssignments } from '@/hooks/useFlashcardAssignments';
import type { FlashcardSet, PeriodAccess } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/firestorePaging', () => ({ readAllDocsPaged: vi.fn() }));

const TEACHER = 'teacher-1';
const ID = '11111111-1111-4111-8111-111111111111';
const PERIODS: Record<string, PeriodAccess> = {
  A: {
    state: 'closed',
    openAt: null,
    closeAt: null,
    bellPeriodId: null,
    verified: true,
    label: 'P1',
  },
  B: {
    state: 'closed',
    openAt: null,
    closeAt: null,
    bellPeriodId: null,
    verified: true,
    label: 'P3',
  },
};
const set: FlashcardSet = {
  id: 'set-1',
  title: 'Spanish food',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: [{ id: 'c1', term: 'la manzana', definition: 'apple' }],
  createdAt: 1,
  updatedAt: 2,
};

interface Op {
  op: 'set' | 'delete';
  ref: string;
  data?: Record<string, unknown>;
}
let batches: Op[][] = [];
const order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  batches = [];
  order.length = 0;
  (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (onSnapshot as Mock).mockReturnValue(() => undefined);
  (readAllDocsPaged as Mock).mockResolvedValue([]);
  (deleteDoc as Mock).mockImplementation((ref: string) => {
    order.push(`delete:${ref}`);
    return Promise.resolve();
  });
  (writeBatch as Mock).mockImplementation(() => {
    const ops: Op[] = [];
    batches.push(ops);
    return {
      set: (ref: string, data: Record<string, unknown>) =>
        ops.push({ op: 'set', ref, data }),
      delete: (ref: string) => {
        order.push(`batch:${ref}`);
        ops.push({ op: 'delete', ref });
      },
      commit: vi.fn().mockResolvedValue(undefined),
    };
  });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(ID);
});

describe('useFlashcardAssignments — per-period sessions', () => {
  it('writes the cards to the content doc in the same batch, with no shared window', async () => {
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await result.current.createAssignment({
        set,
        kind: 'study',
        classIds: ['A', 'B'],
        periodNames: [],
        rosterIds: ['r1', 'r2'],
        openAt: 1_000,
        closeAt: 2_000,
        dueAt: 3_000,
        periodGate: { accessMode: 'assessment', periodAccess: PERIODS },
      });
    });
    expect(batches).toHaveLength(1);
    const byRef = (ref: string) => batches[0].find((o) => o.ref === ref);
    const session = byRef(`flashcard_sessions/${ID}`);
    const assignment = byRef(`users/${TEACHER}/flashcard_assignments/${ID}`);
    const content = byRef(`flashcard_sessions/${ID}/content/cards`);
    expect(session?.data).toMatchObject({
      cards: [],
      cardsInContent: true,
      accessMode: 'assessment',
      periodAccess: PERIODS,
      dueAt: 3_000,
    });
    expect(session?.data).not.toHaveProperty('openAt');
    expect(session?.data).not.toHaveProperty('closeAt');
    expect(assignment?.data).toMatchObject({
      accessMode: 'assessment',
      periodAccess: PERIODS,
    });
    expect(assignment?.data).not.toHaveProperty('openAt');
    expect(content).toEqual({
      op: 'set',
      ref: `flashcard_sessions/${ID}/content/cards`,
      data: { cards: set.cards },
    });
  });

  it('keeps the cards on a legacy session', async () => {
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await result.current.createAssignment({
        set,
        kind: 'study',
        classIds: ['A'],
        periodNames: [],
        rosterIds: ['r1'],
      });
    });
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].data).toMatchObject({ cards: set.cards });
    expect(batches[0][0].data).not.toHaveProperty('cardsInContent');
  });

  it('deletes progress, then the content doc on its own, then the session', async () => {
    (readAllDocsPaged as Mock).mockResolvedValue([
      { ref: 'flashcard_sessions/a1/progress/s1' },
    ]);
    (getDoc as Mock).mockResolvedValue({
      data: () => ({ cardsInContent: true }),
    });
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await result.current.deleteAssignment('a1');
    });
    expect(order).toEqual([
      'batch:flashcard_sessions/a1/progress/s1',
      'delete:flashcard_sessions/a1/content/cards',
      'batch:flashcard_sessions/a1',
      `batch:users/${TEACHER}/flashcard_assignments/a1`,
    ]);
  });

  it('keeps the session when its content doc fails to delete', async () => {
    (getDoc as Mock).mockResolvedValue({
      data: () => ({ cardsInContent: true }),
    });
    (deleteDoc as Mock).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await expect(result.current.deleteAssignment('a1')).rejects.toThrow(
        'offline'
      );
    });
    expect(order).not.toContain('batch:flashcard_sessions/a1');
  });

  it('skips the content delete on a legacy session', async () => {
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await result.current.deleteAssignment('a1');
    });
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(order).toContain('batch:flashcard_sessions/a1');
  });
});
