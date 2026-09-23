// Per-period Flashcards: the student is seated, sees a locked card until their period opens,
// and a paused overlay that holds progress writes when it closes mid-study.
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashcardSession, PeriodAccess } from '@/types';
import type { FlashcardProgressAdapter } from '@/components/flashcards/adapters';

const NOW = 1_800_000_000_000;

const h = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  contentReadable: false,
  sessionListener: null as ((snap: unknown) => void) | null,
  classIds: ['A'] as string[],
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/utils/serverTime', () => ({
  getServerNow: () => NOW,
  syncServerTime: vi.fn(),
}));
vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({ pseudonymUid: 'ps-1', classIds: h.classIds }),
}));
vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => null,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/components/flashcards/FlashcardPlayer', () => ({
  FlashcardPlayer: ({
    cards,
    adapter,
  }: {
    cards: unknown[];
    adapter: FlashcardProgressAdapter;
  }) => (
    <div data-testid="player">
      <span>{cards.length} cards</span>
      <button
        type="button"
        onClick={() => {
          adapter.record('c1', true, 1);
          void adapter.flush();
        }}
      >
        Mark
      </button>
    </div>
  ),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  setDoc: h.setDoc,
  onSnapshot: vi.fn(
    (
      path: string,
      next: (snap: unknown) => void,
      error: (err: unknown) => void
    ) => {
      if (path.endsWith('/content/cards')) {
        if (h.contentReadable)
          next({
            exists: () => true,
            data: () => ({
              cards: [
                { id: 'c1', term: 'uno', definition: 'one' },
                { id: 'c2', term: 'dos', definition: 'two' },
              ],
            }),
          });
        else error({ code: 'permission-denied' });
        return () => undefined;
      }
      if (path.includes('/progress/')) {
        next({ exists: () => false, data: () => undefined });
        return () => undefined;
      }
      h.sessionListener = next;
      next({ exists: () => true, id: 'fc-1', data: () => h.session });
      return () => undefined;
    }
  ),
}));

import { FlashcardAssignmentPage } from '@/components/flashcards/FlashcardAssignmentPage';

const period = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...over,
});

const session = (over: Partial<FlashcardSession> = {}) =>
  ({
    title: 'Numbers',
    kind: 'study',
    status: 'active',
    termLanguage: 'es-ES',
    definitionLanguage: 'en-US',
    teacherUid: 't1',
    classIds: ['A', 'B'],
    cards: [],
    cardsInContent: true,
    accessMode: 'assignment',
    periodAccess: { A: period(), B: period({ label: 'P3' }) },
    ...over,
  }) as unknown as Record<string, unknown>;

function pushSession(next: Record<string, unknown>) {
  h.session = next;
  act(() => {
    h.sessionListener?.({ exists: () => true, id: 'fc-1', data: () => next });
  });
}

const seatWrites = () =>
  h.setDoc.mock.calls.filter(([ref]) => String(ref).includes('/seats/'));
const progressWrites = () =>
  h.setDoc.mock.calls.filter(([ref]) => String(ref).includes('/progress/'));

beforeEach(() => {
  vi.clearAllMocks();
  h.contentReadable = false;
  h.classIds = ['A'];
  window.history.pushState({}, '', '/flashcards/a/fc-1');
});

describe('FlashcardAssignmentPage — per-period access', () => {
  it('seats the student in their period and shows a locked card with no player', async () => {
    h.session = session({
      periodAccess: { A: period({ state: 'closed' }), B: period() },
    });
    render(<FlashcardAssignmentPage />);
    expect(
      await screen.findByText(/as soon as your teacher lets your class in/)
    ).toBeInTheDocument();
    expect(seatWrites()).toEqual([
      ['flashcard_sessions/fc-1/seats/ps-1', { classId: 'A' }],
    ]);
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it('loads the cards from the content doc once the period is open', async () => {
    h.session = session();
    h.contentReadable = true;
    render(<FlashcardAssignmentPage />);
    expect(await screen.findByText('2 cards')).toBeInTheDocument();
  });

  it('tells a student outside every assigned period to ask their teacher', async () => {
    h.classIds = ['Z'];
    h.session = session();
    render(<FlashcardAssignmentPage />);
    expect(
      await screen.findByText(/not in a class this set was assigned to/)
    ).toBeInTheDocument();
    expect(seatWrites()).toHaveLength(0);
  });

  it('pauses in place when the period closes and holds progress writes', async () => {
    h.session = session();
    h.contentReadable = true;
    render(<FlashcardAssignmentPage />);
    await screen.findByText('2 cards');

    pushSession(session({ periodAccess: { A: period({ state: 'paused' }) } }));
    expect(screen.getByText('Paused for your class')).toBeInTheDocument();
    expect(screen.getByTestId('player')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mark'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(progressWrites()).toHaveLength(0);

    pushSession(session());
    await waitFor(() => expect(progressWrites()).toHaveLength(1));
    expect(screen.queryByText('Paused for your class')).toBeNull();
  });

  it('leaves a legacy session without periods untouched', async () => {
    h.session = session({
      periodAccess: undefined,
      accessMode: undefined,
      cardsInContent: undefined,
      cards: [{ id: 'c1', term: 'uno', definition: 'one' }],
    } as Partial<FlashcardSession>);
    render(<FlashcardAssignmentPage />);
    expect(await screen.findByText('1 cards')).toBeInTheDocument();
    expect(seatWrites()).toHaveLength(0);
  });
});
