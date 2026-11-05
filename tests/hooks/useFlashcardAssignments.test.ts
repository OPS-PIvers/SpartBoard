import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContextValue';
import { attachSpeakReferences } from '@/components/widgets/Flashcards/speak/lookupSpeakReferences';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { readAllDocsPaged } from '@/utils/firestorePaging';
import { useFlashcardAssignments } from '@/hooks/useFlashcardAssignments';
import type { FlashcardSet } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ data: () => ({}) })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
    ref,
    constraints,
  })),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
vi.mock('@/utils/firestorePaging', () => ({ readAllDocsPaged: vi.fn() }));
vi.mock('@/hooks/useFlashcardSets', () => ({
  speakAdminConfigFor: vi.fn((_set: unknown, canSpeak: boolean) =>
    Promise.resolve(
      canSpeak ? { attempts: 3, unclearConfidence: 0.5, languages: {} } : null
    )
  ),
}));
vi.mock('@/components/widgets/Flashcards/speak/lookupSpeakReferences', () => ({
  attachSpeakReferences: vi.fn(),
}));

interface BatchOp {
  op: 'set' | 'update' | 'delete';
  ref: unknown;
  data?: Record<string, unknown>;
}

let batches: BatchOp[][] = [];

const TEACHER = 'teacher-1';
const ID = '11111111-1111-4111-8111-111111111111';
const NOW = 1700000000000;

const set: FlashcardSet = {
  id: 'set-1',
  title: 'Spanish food',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: [{ id: 'c1', term: 'la manzana', definition: 'apple' }],
  createdAt: 1,
  updatedAt: 2,
};

const baseInput = {
  set,
  classIds: ['class-a', 'class-b'],
  periodNames: ['P1', 'P2'],
  rosterIds: ['r1', 'r2'],
};

beforeEach(() => {
  vi.clearAllMocks();
  batches = [];
  (collection as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (orderBy as Mock).mockImplementation((field: string, dir: string) => ({
    field,
    dir,
  }));
  (onSnapshot as Mock).mockReturnValue(() => undefined);
  (writeBatch as Mock).mockImplementation(() => {
    const ops: BatchOp[] = [];
    batches.push(ops);
    return {
      set: (ref: unknown, data: Record<string, unknown>) =>
        ops.push({ op: 'set', ref, data }),
      update: (ref: unknown, data: Record<string, unknown>) =>
        ops.push({ op: 'update', ref, data }),
      delete: (ref: unknown) => ops.push({ op: 'delete', ref }),
      commit: vi.fn().mockResolvedValue(undefined),
    };
  });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(ID);
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('useFlashcardAssignments', () => {
  it('subscribes to the teacher assignments ordered by createdAt desc', () => {
    const unsub = vi.fn();
    (onSnapshot as Mock).mockImplementation(
      (
        _q: unknown,
        onNext: (snap: { docs: { id: string; data: () => object }[] }) => void
      ) => {
        onNext({
          docs: [{ id: 'a1', data: () => ({ setTitle: 'S', kind: 'study' }) }],
        });
        return unsub;
      }
    );
    const { result, unmount } = renderHook(() =>
      useFlashcardAssignments(TEACHER)
    );
    expect(collection).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      TEACHER,
      'flashcard_assignments'
    );
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(result.current.loading).toBe(false);
    expect(result.current.assignments).toEqual([
      { id: 'a1', setTitle: 'S', kind: 'study' },
    ]);
    unmount();
    expect(unsub).toHaveBeenCalled();
  });

  it('creates a Study session and assignment in one batch without Check-only or undefined fields', async () => {
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    let returned = '';
    await act(async () => {
      returned = await result.current.createAssignment({
        ...baseInput,
        kind: 'study',
        checkMode: 'write',
        scoreVisibility: 'score',
        masteryThreshold: 3,
        openAt: null,
        closeAt: 5000,
      });
    });
    expect(returned).toBe(ID);
    expect(batches).toHaveLength(1);
    const [sessionOp, assignmentOp] = batches[0];
    expect(sessionOp.ref).toBe(`flashcard_sessions/${ID}`);
    expect(assignmentOp.ref).toBe(
      `users/${TEACHER}/flashcard_assignments/${ID}`
    );

    const session = sessionOp.data as Record<string, unknown>;
    expect(session).toMatchObject({
      teacherUid: TEACHER,
      setId: 'set-1',
      title: 'Spanish food',
      kind: 'study',
      termLanguage: 'es-ES',
      definitionLanguage: 'en-US',
      cards: set.cards,
      classIds: ['class-a', 'class-b'],
      classId: 'class-a',
      status: 'active',
      closeAt: 5000,
      createdAt: NOW,
    });
    for (const key of [
      'checkMode',
      'lockedSettings',
      'masteryThreshold',
      'scoreVisibility',
      'openAt',
      'dueAt',
    ]) {
      expect(key in session).toBe(false);
    }
    expect(Object.values(session)).not.toContain(undefined);

    const assignment = assignmentOp.data as Record<string, unknown>;
    expect(assignment).toMatchObject({
      id: ID,
      sessionId: ID,
      setTitle: 'Spanish food',
      status: 'active',
      archivedAt: null,
      rosterIds: ['r1', 'r2'],
      classIds: ['class-a', 'class-b'],
      periodNames: ['P1', 'P2'],
      closeAt: 5000,
    });
    expect('scoreVisibility' in assignment).toBe(false);
    expect('openAt' in assignment).toBe(false);
    expect(Object.values(assignment)).not.toContain(undefined);
  });

  it('writes Check-only fields and targeting when kind is check', async () => {
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await result.current.createAssignment({
        ...baseInput,
        kind: 'check',
        checkMode: 'flashcards',
        masteryThreshold: 2,
        scoreVisibility: 'score-and-answers',
        targetGroupIds: ['g1'],
        overridesBySourcedId: { k1: { timeMultiplier: 2 } },
        dueAt: 9000,
      });
    });
    const session = batches[0][0].data as Record<string, unknown>;
    expect(session).toMatchObject({
      kind: 'check',
      checkMode: 'flashcards',
      masteryThreshold: 2,
      scoreVisibility: 'score-and-answers',
      dueAt: 9000,
    });
    const assignment = batches[0][1].data as Record<string, unknown>;
    expect(assignment).toMatchObject({
      checkMode: 'flashcards',
      scoreVisibility: 'score-and-answers',
      targetGroupIds: ['g1'],
      overridesBySourcedId: { k1: { timeMultiplier: 2 } },
      dueAt: 9000,
    });
  });

  it('rejects without a user or with an empty set', async () => {
    const { result: noUser } = renderHook(() =>
      useFlashcardAssignments(undefined)
    );
    await expect(
      noUser.current.createAssignment({ ...baseInput, kind: 'study' })
    ).rejects.toThrow();
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await expect(
      result.current.createAssignment({
        ...baseInput,
        set: { ...set, cards: [] },
        kind: 'study',
      })
    ).rejects.toThrow();
    expect(batches).toHaveLength(0);
  });

  it('ends both docs together', async () => {
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await result.current.endAssignment('a1');
    });
    expect(batches[0]).toEqual([
      {
        op: 'update',
        ref: `users/${TEACHER}/flashcard_assignments/a1`,
        data: { status: 'ended', endedAt: NOW, updatedAt: NOW },
      },
      {
        op: 'update',
        ref: 'flashcard_sessions/a1',
        data: { status: 'ended', endedAt: NOW, updatedAt: NOW },
      },
    ]);
  });

  it('deletes progress docs before the session and assignment', async () => {
    (readAllDocsPaged as Mock).mockResolvedValue([
      { ref: 'flashcard_sessions/a1/progress/s1' },
      { ref: 'flashcard_sessions/a1/progress/s2' },
    ]);
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await result.current.deleteAssignment('a1');
    });
    expect(readAllDocsPaged).toHaveBeenCalledWith(
      'flashcard_sessions/a1/progress'
    );
    expect(batches).toHaveLength(2);
    expect(batches[0].map((o) => o.ref)).toEqual([
      'flashcard_sessions/a1/progress/s1',
      'flashcard_sessions/a1/progress/s2',
    ]);
    expect(batches[1]).toEqual([
      { op: 'delete', ref: 'flashcard_sessions/a1' },
      { op: 'delete', ref: `users/${TEACHER}/flashcard_assignments/a1` },
    ]);
  });

  it('stamps the Test question bar only for a teacher with the flag', async () => {
    const auth = {
      canAccessFeature: (id: string) => id === 'flashcards-test-nav',
    } as unknown as React.ContextType<typeof AuthContext>;
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthContext.Provider, { value: auth }, children);
    const flagged = renderHook(() => useFlashcardAssignments(TEACHER), {
      wrapper,
    });
    await act(async () => {
      await flagged.result.current.createAssignment({
        ...baseInput,
        kind: 'check',
        checkMode: 'test',
      });
    });
    expect((batches[0][0].data as Record<string, unknown>).testNavBar).toBe(
      true
    );

    const plain = renderHook(() => useFlashcardAssignments(TEACHER));
    await act(async () => {
      await plain.result.current.createAssignment({
        ...baseInput,
        kind: 'check',
        checkMode: 'test',
      });
    });
    expect(
      'testNavBar' in (batches[1][0].data as Record<string, unknown>)
    ).toBe(false);
  });

  describe('Speak check', () => {
    const speakAuth = {
      canAccessFeature: (id: string) => id === 'flashcards-speak',
    } as unknown as React.ContextType<typeof AuthContext>;
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthContext.Provider, { value: speakAuth }, children);
    const prepared = {
      id: 'c1',
      term: 'la manzana',
      definition: 'apple',
      speak: {
        term: 'la manzana',
        refs: [{ dialect: 'es-419' as const, tokens: ['l', 'a'], stress: [] }],
        g2pVersion: 'test',
        status: 'ready' as const,
      },
    };

    it('prepares cards for Speak when the check is assigned', async () => {
      (attachSpeakReferences as Mock).mockResolvedValue([prepared]);
      const { result } = renderHook(() => useFlashcardAssignments(TEACHER), {
        wrapper,
      });
      await act(async () => {
        await result.current.createAssignment({
          ...baseInput,
          kind: 'check',
          checkMode: 'speak',
        });
      });
      expect(attachSpeakReferences).toHaveBeenCalledWith(
        set.cards,
        'es',
        expect.any(Array),
        {}
      );
      const session = batches[0][0].data as Record<string, unknown>;
      expect(session.checkMode).toBe('speak');
      expect(session.cards).toEqual([prepared]);
      expect(session.speak).toMatchObject({ locked: true });
    });

    it('says why Speak is unavailable when no card could be prepared', async () => {
      (attachSpeakReferences as Mock).mockResolvedValue(set.cards);
      const { result } = renderHook(() => useFlashcardAssignments(TEACHER), {
        wrapper,
      });
      await expect(
        result.current.createAssignment({
          ...baseInput,
          kind: 'check',
          checkMode: 'speak',
        })
      ).rejects.toThrow(/^Speak mode is unavailable\./);
      expect(batches).toHaveLength(0);
    });
  });
});
