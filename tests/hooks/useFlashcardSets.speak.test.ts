import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { useFlashcardSets } from '@/hooks/useFlashcardSets';
import { useFlashcardAssignments } from '@/hooks/useFlashcardAssignments';
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
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

interface BatchOp {
  op: 'set' | 'update';
  ref: unknown;
  data: Record<string, unknown>;
}

const TEACHER = 'teacher-1';
const NOW = 1_700_000_000_000;
let ops: BatchOp[] = [];

const speakCard = (term: string): NonNullable<FlashcardCard['speak']> => ({
  term,
  refs: [{ dialect: 'es-419', tokens: ['o', 'l', 'a'], stress: [0] }],
  g2pVersion: 'v1',
  status: 'ready',
});

const plainSet: FlashcardSet = {
  id: 'set-1',
  title: 'Saludos',
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
  cards: [{ id: 'c1', term: 'hola', definition: 'hello' }],
  publicShareId: 'share-1',
  folderId: null,
  createdAt: 1,
  updatedAt: 2,
};

const speakSet: FlashcardSet = {
  ...plainSet,
  cards: [{ ...plainSet.cards[0], speak: speakCard('hola') }],
  speak: {
    dialects: ['es-ES'],
    preset: 'advanced',
    strict: true,
    groups: { 'es-trill': 'require', bogus: 'forgive' },
    attempts: 4,
    example: false,
  },
};

const wrapper = (canSpeak: boolean) =>
  function SpeakAuth({ children }: { children: ReactNode }) {
    return createElement(
      AuthContext.Provider,
      {
        value: {
          canAccessFeature: (id: string) =>
            canSpeak && id === 'flashcards-speak',
        } as unknown as AuthContextType,
      },
      children
    );
  };

const openSessions = (docs: Array<Record<string, unknown>>) =>
  (getDocs as Mock).mockResolvedValue({
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((data, i) => ({
      id: `session-${i}`,
      ref: `flashcard_sessions/session-${i}`,
      get: (key: string) => data[key],
    })),
  });

const opFor = (ref: string) => ops.find((op) => op.ref === ref);

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  (writeBatch as Mock).mockImplementation(() => ({
    set: (ref: unknown, data: Record<string, unknown>) =>
      ops.push({ op: 'set', ref, data }),
    update: (ref: unknown, data: Record<string, unknown>) =>
      ops.push({ op: 'update', ref, data }),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }));
  (getDoc as Mock).mockResolvedValue({
    data: () => ({
      attempts: 5,
      languages: { es: { preset: 'intermediate' } },
    }),
  });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('useFlashcardSets Speak stamp (F21)', () => {
  it('writes today’s set, snapshot and session docs for a teacher without the flag', async () => {
    openSessions([{ cardsInContent: false }, { cardsInContent: true }]);
    const { result } = renderHook(() => useFlashcardSets(TEACHER), {
      wrapper: wrapper(false),
    });
    await act(async () => {
      await result.current.saveSet(plainSet);
    });

    expect(getDoc).not.toHaveBeenCalled();
    expect(opFor('users/teacher-1/flashcard_sets/set-1')?.data).toEqual({
      ...plainSet,
      description: '',
      updatedAt: NOW,
    });
    expect(opFor('public_flashcard_sets/share-1')?.data).toEqual({
      teacherUid: TEACHER,
      setId: 'set-1',
      title: 'Saludos',
      description: '',
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
      cards: plainSet.cards,
      updatedAt: NOW,
    });
    expect(opFor('flashcard_sessions/session-0')?.data).toEqual({
      title: 'Saludos',
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
      cards: plainSet.cards,
    });
    expect(opFor('flashcard_sessions/session-1')?.data).toEqual({
      title: 'Saludos',
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
    });
    expect(opFor('flashcard_sessions/session-1/content/cards')?.data).toEqual({
      cards: plainSet.cards,
    });
  });

  it('works without an AuthProvider, as a teacher without the flag', async () => {
    openSessions([]);
    const { result } = renderHook(() => useFlashcardSets(TEACHER));
    await act(async () => {
      await result.current.saveSet(speakSet);
    });
    expect(getDoc).not.toHaveBeenCalled();
    expect(opFor('public_flashcard_sets/share-1')?.data).not.toHaveProperty(
      'speak'
    );
  });

  it('stamps the snapshot and open sessions, keeping each session’s lock', async () => {
    openSessions([{ speak: { locked: true } }, {}]);
    const { result } = renderHook(() => useFlashcardSets(TEACHER), {
      wrapper: wrapper(true),
    });
    await act(async () => {
      await result.current.saveSet(speakSet);
    });

    const settings = {
      dialects: ['es-ES'],
      preset: 'advanced',
      strict: true,
      groups: { 'es-trill': 'require' },
      attempts: 4,
      example: false,
    };
    expect(getDoc).toHaveBeenCalledWith('admin_settings/flashcardsSpeak');
    expect(opFor('users/teacher-1/flashcard_sets/set-1')?.data).toMatchObject({
      speak: speakSet.speak,
      cards: speakSet.cards,
    });
    const snapshot = opFor('public_flashcard_sets/share-1')?.data;
    expect(snapshot?.speak).toEqual(settings);
    expect(snapshot?.cards).toEqual(speakSet.cards);
    expect(opFor('flashcard_sessions/session-0')?.data.speak).toEqual({
      ...settings,
      locked: true,
    });
    expect(opFor('flashcard_sessions/session-1')?.data).toMatchObject({
      speak: { ...settings, locked: false },
      cards: speakSet.cards,
    });
  });

  it('resolves a set without its own settings from the district defaults', async () => {
    openSessions([]);
    const { result } = renderHook(() => useFlashcardSets(TEACHER), {
      wrapper: wrapper(true),
    });
    await act(async () => {
      await result.current.publishSet(plainSet);
    });
    expect(opFor('public_flashcard_sets/share-1')?.data.speak).toMatchObject({
      dialects: ['es-419', 'es-ES'],
      preset: 'intermediate',
      strict: false,
      attempts: 5,
      example: true,
      groups: expect.objectContaining({
        'es-trill': 'require',
        'es-soft-bdg': 'forgive',
      }),
    });
  });

  it('skips the stamp and the admin read for a language Speak doesn’t support', async () => {
    openSessions([{ speak: { locked: false } }]);
    const { result } = renderHook(() => useFlashcardSets(TEACHER), {
      wrapper: wrapper(true),
    });
    await act(async () => {
      await result.current.saveSet({ ...speakSet, termLanguage: 'fr-FR' });
    });
    expect(getDoc).not.toHaveBeenCalled();
    expect(opFor('public_flashcard_sets/share-1')?.data).not.toHaveProperty(
      'speak'
    );
  });

  it('removes the stamp and card references once the flag is gone', async () => {
    openSessions([{ speak: { locked: true }, cardsInContent: true }]);
    const { result } = renderHook(() => useFlashcardSets(TEACHER), {
      wrapper: wrapper(false),
    });
    await act(async () => {
      await result.current.saveSet(speakSet);
    });
    const snapshot = opFor('public_flashcard_sets/share-1')?.data;
    expect(snapshot).not.toHaveProperty('speak');
    expect(snapshot?.cards).toEqual(plainSet.cards);
    expect(opFor('flashcard_sessions/session-0')?.data.speak).toBe(
      'DELETE_FIELD'
    );
    expect(opFor('flashcard_sessions/session-0/content/cards')?.data).toEqual({
      cards: plainSet.cards,
    });
  });
});

describe('useFlashcardSets card references', () => {
  it('drops references from another language when the term language changes', async () => {
    openSessions([]);
    const { result } = renderHook(() => useFlashcardSets(TEACHER), {
      wrapper: wrapper(true),
    });
    await act(async () => {
      await result.current.saveSet({ ...speakSet, termLanguage: 'de-DE' });
    });
    const saved = opFor('users/teacher-1/flashcard_sets/set-1')?.data;
    expect((saved?.cards as FlashcardCard[])[0]).not.toHaveProperty('speak');
    expect(opFor('public_flashcard_sets/share-1')?.data.speak).toMatchObject({
      dialects: ['de-DE'],
    });
  });
});

describe('useFlashcardAssignments Speak stamp', () => {
  const input = {
    set: speakSet,
    classIds: ['class-a'],
    periodNames: ['P1'],
    rosterIds: ['r1'],
  };

  it('stamps a Study session with the assignment lock', async () => {
    const { result } = renderHook(() => useFlashcardAssignments(TEACHER), {
      wrapper: wrapper(true),
    });
    let id = '';
    await act(async () => {
      id = await result.current.createAssignment({
        ...input,
        kind: 'study',
        speakLocked: true,
      });
    });
    const session = opFor(`flashcard_sessions/${id}`)?.data;
    expect(session?.speak).toMatchObject({ attempts: 4, locked: true });
    expect(session?.cards).toEqual(speakSet.cards);
    expect(
      opFor(`users/teacher-1/flashcard_assignments/${id}`)?.data
    ).not.toHaveProperty('speak');
  });

  it('never stamps a Check, and strips references without the flag', async () => {
    const checked = renderHook(() => useFlashcardAssignments(TEACHER), {
      wrapper: wrapper(true),
    });
    let checkId = '';
    await act(async () => {
      checkId = await checked.result.current.createAssignment({
        ...input,
        kind: 'check',
        checkMode: 'write',
      });
    });
    expect(opFor(`flashcard_sessions/${checkId}`)?.data).not.toHaveProperty(
      'speak'
    );
    expect(getDoc).not.toHaveBeenCalled();

    ops = [];
    const plain = renderHook(() => useFlashcardAssignments(TEACHER), {
      wrapper: wrapper(false),
    });
    let studyId = '';
    await act(async () => {
      studyId = await plain.result.current.createAssignment({
        ...input,
        kind: 'study',
      });
    });
    const session = opFor(`flashcard_sessions/${studyId}`)?.data;
    expect(session).not.toHaveProperty('speak');
    expect(session?.cards).toEqual(plainSet.cards);
  });
});
