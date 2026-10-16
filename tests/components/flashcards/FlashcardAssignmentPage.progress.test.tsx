// Tracked Flashcards progress: teacher resets re-seed the player, and flashcards-mode Checks rate through the server.
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashcardProgressAdapter } from '@/components/flashcards/adapters';

const NOW = 1_800_000_000_000;

const h = vi.hoisted(() => ({
  now: 0,
  session: null as Record<string, unknown> | null,
  progress: null as Record<string, unknown> | null,
  progressListener: null as ((snap: unknown) => void) | null,
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
  callable: vi.fn((..._args: unknown[]) => Promise.resolve({ data: {} })),
  callableNames: [] as string[],
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/utils/serverTime', () => ({
  getServerNow: () => h.now,
  syncServerTime: vi.fn(),
}));
vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({ pseudonymUid: 'ps-1', classIds: ['A'] }),
}));
vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => null,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => {
    h.callableNames.push(name);
    return (data: unknown) => h.callable(name, data);
  },
}));
vi.mock('@/components/flashcards/FlashcardPlayer', () => ({
  FlashcardPlayer: ({
    adapter,
    check,
  }: {
    adapter: FlashcardProgressAdapter;
    check?: { onSubmit: (s: { answerLog: []; flags: [] }) => void };
  }) => {
    React.useEffect(
      () => () => {
        void adapter.flush();
      },
      [adapter]
    );
    return (
      <div data-testid="player">
        <span>{JSON.stringify(adapter.load().cards)}</span>
        <button
          type="button"
          onClick={() => {
            adapter.record('c1', true, 1);
          }}
        >
          Mark
        </button>
        <button type="button" onClick={() => void adapter.flush()}>
          Save
        </button>
        <button
          type="button"
          onClick={() => check?.onSubmit({ answerLog: [], flags: [] })}
        >
          Submit
        </button>
      </div>
    );
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  setDoc: h.setDoc,
  onSnapshot: vi.fn((path: string, next: (snap: unknown) => void) => {
    if (path.includes('/progress/')) {
      h.progressListener = next;
      next({ exists: () => h.progress !== null, data: () => h.progress });
      return () => undefined;
    }
    next({ exists: () => true, id: 'fc-1', data: () => h.session });
    return () => undefined;
  }),
}));

import { FlashcardAssignmentPage } from '@/components/flashcards/FlashcardAssignmentPage';

const session = (over: Record<string, unknown> = {}) => ({
  title: 'Numbers',
  kind: 'study',
  status: 'active',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  teacherUid: 't1',
  classIds: ['A'],
  cards: [{ id: 'c1', term: 'uno', definition: 'one' }],
  ...over,
});

const pushProgress = (next: Record<string, unknown> | null) => {
  h.progress = next;
  act(() => {
    h.progressListener?.({ exists: () => next !== null, data: () => next });
  });
};

const progressWrites = () =>
  h.setDoc.mock.calls.map(([, payload]) => payload as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  h.callableNames = [];
  h.progress = null;
  h.now = NOW;
  window.history.pushState({}, '', '/flashcards/a/fc-1');
});

describe('FlashcardAssignmentPage tracked progress', () => {
  it('drops unsaved work and starts fresh after a teacher reset', async () => {
    h.session = session();
    h.progress = {
      classId: 'A',
      cards: { c1: { s: 2, due: 3, c: 2, w: 0 } },
      starred: ['c1'],
      round: 3,
      studyMs: 90_000,
      modesUsed: ['flashcards', 'test'],
      tests: [{ at: 1, types: ['mc'], count: 1, score: 1 }],
      lastActiveAt: 1,
    };
    render(<FlashcardAssignmentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    pushProgress(null);
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(screen.getByTestId('player')).toHaveTextContent('{}');

    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });
    expect(progressWrites()).toHaveLength(1);
    expect(progressWrites()[0]).toMatchObject({
      cards: { c1: { s: 1, due: 2, c: 1, w: 0 } },
      starred: [],
      round: 1,
      tests: [],
    });
    expect(progressWrites()[0]?.studyMs).toBeLessThan(90_000);
  });

  it('sends flashcards-mode Check ratings to the server and never writes cards', async () => {
    h.session = session({ kind: 'check', checkMode: 'flashcards' });
    render(<FlashcardAssignmentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(progressWrites()[0]).not.toHaveProperty('cards');
    expect(h.callableNames).toContain('recordFlashcardCheckRatingsV1');
    expect(h.callable).toHaveBeenCalledWith('recordFlashcardCheckRatingsV1', {
      assignmentId: 'fc-1',
      ratings: [{ cardId: 'c1', correct: true, round: 1 }],
    });
  });

  it('holds the submit while a rating has not reached the server', async () => {
    h.session = session({ kind: 'check', checkMode: 'flashcards' });
    h.callable.mockImplementation((name: unknown) =>
      name === 'recordFlashcardCheckRatingsV1'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ data: {} })
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    render(<FlashcardAssignmentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await new Promise((done) => setTimeout(done, 0));
    });
    const names = h.callable.mock.calls.map(([name]) => name);
    expect(names).toContain('recordFlashcardCheckRatingsV1');
    expect(names).not.toContain('submitFlashcardCheckV1');
    consoleError.mockRestore();
    h.callable.mockReset();
    h.callable.mockImplementation(() => Promise.resolve({ data: {} }));
  });

  it('keeps writing cards directly in other Check modes', async () => {
    h.session = session({ kind: 'check', checkMode: 'write' });
    render(<FlashcardAssignmentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });
    expect(progressWrites()[0]).toHaveProperty('cards.c1');
    expect(h.callable).not.toHaveBeenCalled();
  });

  it('closes a Check on screen when its close time passes', () => {
    vi.useFakeTimers();
    try {
      h.session = session({
        kind: 'check',
        checkMode: 'write',
        closeAt: NOW + 1000,
      });
      render(<FlashcardAssignmentPage />);
      expect(screen.getByTestId('player')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByTestId('player')).toBeInTheDocument();
      h.now = NOW + 1000;
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
