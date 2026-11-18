import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VideoActivityAssignment } from '@/types';
import type { AssignedRowProps } from '@/components/common/library/assigned';
import { VideoActivityAssignedTab } from './VideoActivityAssignedTab';
import type { VideoActivityLifecycle } from '../videoActivityLifecycle';

interface Store {
  responses: Record<string, Array<Record<string, unknown>>>;
  sessions: Record<string, Record<string, unknown>>;
  toasts: Array<[string, string]>;
}
const store: Store = vi.hoisted((): Store => ({
  responses: {},
  sessions: {},
  toasts: [],
}));

const actions = vi.hoisted(() => ({
  openClass: vi.fn(() => Promise.resolve([])),
  pauseClass: vi.fn(() => Promise.resolve()),
  closeClass: vi.fn(() => Promise.resolve()),
  reopenClass: vi.fn(() => Promise.resolve([])),
  closeAll: vi.fn(() => Promise.resolve()),
  moveToDone: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  FieldPath: class {},
  collection: (_db: unknown, ...segs: string[]) => segs.join('/'),
  doc: (_db: unknown, ...segs: string[]) => segs.join('/'),
  getDoc: (path: string) => {
    const data = store.sessions[path.split('/')[1]];
    return Promise.resolve({ exists: () => !!data, data: () => data });
  },
  onSnapshot: (path: string, next: (s: unknown) => void) => {
    const id = path.split('/')[1];
    next({
      docs: (store.responses[id] ?? []).map((r) => ({ data: () => r })),
    });
    return () => undefined;
  },
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: () => ({ update: vi.fn(), commit: () => Promise.resolve() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 't1' }, featurePermissions: [] }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: (msg: string, tone: string) => store.toasts.push([msg, tone]),
  }),
}));
vi.mock('@/hooks/useAssignmentClassActions', () => ({
  useAssignmentClassActions: () => actions,
}));
vi.mock('@/components/common/library/assigned', async (orig) => {
  const real =
    await orig<typeof import('@/components/common/library/assigned')>();
  return {
    ...real,
    AssignedRow: (p: AssignedRowProps) => (
      <div data-testid={`row-${p.title}`}>
        {p.mainLabel && <button onClick={p.onMain}>{p.mainLabel}</button>}
        {p.menuActions.map((m) => (
          <button key={m.id} onClick={() => void m.onClick()}>
            menu:{m.label}
          </button>
        ))}
      </div>
    ),
  };
});

const lifecycle = {} as VideoActivityLifecycle;
const NOW = Date.now();

const base = (
  over: Partial<VideoActivityAssignment> & Record<string, unknown>
): VideoActivityAssignment =>
  ({
    activityId: 'act',
    activityTitle: 'Cells',
    activityDriveFileId: 'f',
    teacherUid: 't1',
    status: 'active',
    createdAt: NOW - 86_400_000,
    updatedAt: NOW,
    ...over,
  }) as VideoActivityAssignment;

const handlers = () => ({
  onMonitor: vi.fn(),
  onResults: vi.fn(),
  onPublish: vi.fn(),
  onCopyLink: vi.fn(),
  menu: vi.fn(() => [
    { id: 'pause-resume', label: 'Pause', onClick: vi.fn() },
    { id: 'deactivate', label: 'End assignment', onClick: vi.fn() },
    { id: 'reactivate', label: 'Reactivate', onClick: vi.fn() },
    { id: 'results', label: 'Results', onClick: vi.fn() },
  ]),
});

const renderTab = (assignments: VideoActivityAssignment[], h = handlers()) => {
  render(
    <VideoActivityAssignedTab
      assignments={assignments}
      loading={false}
      rosters={[]}
      lifecycle={lifecycle}
      emptyTitle="Nothing active"
      emptySub="Assign a video activity from the Library."
      {...h}
    />
  );
  return h;
};

beforeEach(() => {
  store.responses = {};
  store.sessions = {};
  store.toasts = [];
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('VideoActivityAssignedTab', () => {
  it('shows the empty state with no assignments', () => {
    renderTab([]);
    expect(screen.getByText('Nothing active')).toBeTruthy();
  });

  it('replaces the old lifecycle items with Assigned actions', () => {
    renderTab([base({ id: 'a1' })]);
    expect(screen.queryByText('menu:End assignment')).toBeNull();
    expect(screen.queryByText('menu:Reactivate')).toBeNull();
    expect(screen.getByText('menu:Monitor')).toBeTruthy();
    expect(screen.getByText('menu:Pause')).toBeTruthy();
    expect(screen.getByText('menu:Results')).toBeTruthy();
    fireEvent.click(screen.getByText('menu:Close'));
    expect(actions.closeAll).toHaveBeenCalled();
  });

  it('never offers Pause or Reopen on a live run', async () => {
    store.responses['live-closed'] = [{ completedAt: NOW - 5000 }];
    renderTab([
      base({
        id: 'live-open',
        activityTitle: 'Open live',
        sessionMode: 'teacher',
      }),
      base({
        id: 'live-closed',
        activityTitle: 'Closed live',
        sessionMode: 'teacher',
        status: 'inactive',
        closedAt: NOW - 1000,
      }),
    ]);
    const open = screen.getByTestId('row-Open live');
    expect(open.textContent).not.toContain('menu:Pause');
    expect(open.textContent).toContain('menu:Close');
    const closed = screen.getByTestId('row-Closed live');
    expect(closed.textContent).not.toContain('menu:Reopen');
    // Closing a live run can't be undone, so its toast has no Undo.
    fireEvent.click(screen.getByText('menu:Close'));
    await waitFor(() =>
      expect(store.toasts).toContainEqual(['Open live is closed.', 'success'])
    );
  });

  it('offers Reopen on a closed self-paced single line', () => {
    store.responses.a1 = [{ completedAt: NOW - 5000 }];
    renderTab([base({ id: 'a1', status: 'inactive', closedAt: NOW - 1000 })]);
    fireEvent.click(screen.getByText('menu:Reopen'));
    expect(actions.reopenClass).toHaveBeenCalledWith(null);
  });

  it('counts short answers awaiting a grade from the answer key', async () => {
    store.sessions.a1 = {
      id: 'a1',
      questions: [
        { id: 'q1', type: 'SA', correctAnswer: '', points: 1, timestamp: 5 },
      ],
    };
    store.responses.a1 = [
      {
        completedAt: NOW - 5000,
        answers: [{ questionId: 'q1', answer: 'mitochondria' }],
      },
    ];
    const h = renderTab([
      base({ id: 'a1', status: 'inactive', closedAt: NOW - 1000 }),
    ]);
    const grade = await screen.findByText('Grade (1)');
    fireEvent.click(grade);
    expect(h.onResults).toHaveBeenCalled();
  });

  it('keeps Copy link as the main button of a running share', () => {
    const h = renderTab([base({ id: 's1', mode: 'view-only' })]);
    fireEvent.click(screen.getByText('Copy link'));
    expect(h.onCopyLink).toHaveBeenCalled();
    expect(screen.queryByText('menu:Monitor')).toBeNull();
  });

  it('shows a live run limit as its own message', async () => {
    actions.reopenClass.mockRejectedValueOnce(
      new Error('A live video run cannot be reopened. Assign it again.')
    );
    store.responses.a1 = [{ completedAt: NOW - 5000 }];
    renderTab([base({ id: 'a1', status: 'inactive', closedAt: NOW - 1000 })]);
    fireEvent.click(screen.getByText('menu:Reopen'));
    await waitFor(() =>
      expect(store.toasts).toContainEqual([
        'A live video run cannot be reopened. Assign it again.',
        'info',
      ])
    );
  });
});
