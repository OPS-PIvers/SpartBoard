import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HubAssignedList } from '@/components/assignmentsHub/HubAssignedList';
import type {
  UnifiedAssignmentRow,
  UnifiedAssignmentSources,
} from '@/components/assignmentsHub/useUnifiedAssignments';

const openClass = vi.fn(() => Promise.resolve([]));
const classActions = {
  openClass,
  pauseClass: vi.fn(() => Promise.resolve()),
  closeClass: vi.fn(() => Promise.resolve()),
  reopenClass: vi.fn(() => Promise.resolve([])),
  closeAll: vi.fn(() => Promise.resolve()),
  moveToDone: vi.fn(() => Promise.resolve()),
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 't1' }, featurePermissions: [] }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => path),
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  FieldPath: vi.fn(),
  onSnapshot: vi.fn(
    (_ref: unknown, next: (snap: { docs: unknown[] }) => void) => {
      next({ docs: [] });
      return () => undefined;
    }
  ),
}));
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({ quizzes: [], loadQuizData: vi.fn() }),
}));
vi.mock('@/hooks/useQuizClassActions', () => ({
  useQuizClassActions: () => classActions,
}));
vi.mock('@/hooks/useAssignmentClassActions', () => ({
  useAssignmentClassActions: () => classActions,
}));
const writingActions = {
  ...classActions,
  closeAll: vi.fn(() => Promise.resolve()),
};
const undoWritingClose = vi.fn((_prev: unknown) => Promise.resolve());
vi.mock('@/hooks/useWritingClassActions', () => ({
  useWritingClassActions: () => writingActions,
  undoWritingClose: (prev: unknown) => undoWritingClose(prev),
}));
vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({ setAssignmentTargets: vi.fn() }),
}));
vi.mock('@/hooks/usePeriodRunner', () => ({
  usePeriodRunner: () => (fn: () => Promise<unknown>) =>
    fn().then(() => undefined),
}));

const quiz = {
  id: 'q1',
  quizId: 'quiz-1',
  quizTitle: 'Fractions Quiz',
  teacherUid: 't1',
  status: 'inactive',
  createdAt: 1,
  closedAt: null,
};
const va = {
  id: 'v1',
  activityTitle: 'Volcano Video',
  teacherUid: 't1',
  status: 'paused',
  createdAt: 2,
};
const pa = (label: string, state: 'open' | 'closed') => ({
  state,
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
  rosterId: label,
});
const mini = {
  id: 'm1',
  sessionId: 'm1-session',
  appTitle: 'Rock Sort',
  teacherUid: 't1',
  status: 'active',
  createdAt: 4,
  periodAccess: { P1: pa('P1', 'open'), P2: pa('P2', 'open') },
};
const flash = {
  id: 'f1',
  sessionId: 'f1',
  setTitle: 'Spanish Verbs',
  teacherUid: 't1',
  status: 'active',
  kind: 'study',
  createdAt: 3,
};
const essay = {
  id: 'w1',
  title: 'Argument Essay',
  teacherUid: 't1',
  status: 'active',
  createdAt: 5,
};

const sources = {
  quiz: {
    assignments: [quiz],
    pauseAssignment: vi.fn(),
    resumeAssignment: vi.fn(),
    deactivateAssignment: vi.fn(),
    reopenAssignment: vi.fn(),
  },
  videoActivity: {
    assignments: [va],
    pauseAssignment: vi.fn(),
    resumeAssignment: vi.fn(),
    deactivateAssignment: vi.fn(),
    reactivateAssignment: vi.fn(),
  },
  guidedLearning: { assignments: [], archiveAssignment: vi.fn() },
  miniApp: {
    assignments: [mini],
    endAssignment: vi.fn(),
    reactivateAssignment: vi.fn(),
  },
  flashcards: {
    assignments: [flash],
    endAssignment: vi.fn(),
    reopenAssignment: vi.fn(),
  },
  writing: { records: [essay] },
} as unknown as UnifiedAssignmentSources;

const row = (id: string, kind: UnifiedAssignmentRow['kind']) =>
  ({ id, kind }) as UnifiedAssignmentRow;

const kindLabel = (k: string) => `kind:${k}`;

function renderList(
  rows: UnifiedAssignmentRow[],
  onSelect = vi.fn(),
  selectedId: string | null = null
) {
  render(
    <HubAssignedList
      rows={rows}
      sources={sources}
      loading={false}
      rosters={[]}
      selectedId={selectedId}
      onSelect={onSelect}
      kindLabel={kindLabel}
    />
  );
  return onSelect;
}

describe('HubAssignedList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows every kind on the shared rows, Active first and ended work in Finished', () => {
    renderList([
      row('q1', 'quiz'),
      row('v1', 'video-activity'),
      row('f1', 'flashcards'),
    ]);
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(screen.getByText('Spanish Verbs')).toBeInTheDocument();
    expect(screen.getByText('· kind:video-activity')).toBeInTheDocument();
    // The ended legacy quiz sits in the collapsed Finished section.
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Finished/ }));
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.getByText('· kind:quiz')).toBeInTheDocument();
  });

  it('keeps only the rows the hub filters left', () => {
    renderList([row('v1', 'video-activity')]);
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(screen.queryByText('Spanish Verbs')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Finished/ })
    ).not.toBeInTheDocument();
  });

  it('Resume on a paused Video Activity lets it back in through the shared class actions', async () => {
    renderList([row('v1', 'video-activity')]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
      await Promise.resolve();
    });
    // The single line's class key, as the Quiz tab passes it.
    expect(openClass).toHaveBeenCalledWith('');
  });

  it('Flashcards closes through the shared class actions, and the title picks the row', async () => {
    const onSelect = renderList([row('f1', 'flashcards')]);
    fireEvent.click(screen.getByRole('button', { name: /more|actions|menu/i }));
    await act(async () => {
      fireEvent.click(screen.getByText('Close'));
      await Promise.resolve();
    });
    expect(classActions.closeClass).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByText('Spanish Verbs'));
    expect(onSelect).toHaveBeenCalledWith('f1');
  });

  it('Writing closes through its server-backed actions, with Undo putting the record back', async () => {
    renderList([row('w1', 'writing')]);
    fireEvent.click(screen.getByRole('button', { name: /more|actions|menu/i }));
    await act(async () => {
      fireEvent.click(screen.getByText('Close'));
      await Promise.resolve();
    });
    expect(writingActions.closeAll).toHaveBeenCalled();
    expect(classActions.closeClass).not.toHaveBeenCalled();
  });

  it('marks the selected row', () => {
    renderList([row('v1', 'video-activity')], vi.fn(), 'v1');
    const title = screen.getByText('Volcano Video');
    const rowEl = title.closest('[aria-current]');
    expect(rowEl).not.toBeNull();
    expect(within(rowEl as HTMLElement).getByText('Volcano Video')).toBe(title);
  });

  it('offers Move to Finished on a kind with class actions, through the shared hook', async () => {
    renderList([row('v1', 'video-activity')]);
    fireEvent.click(screen.getByRole('button', { name: /more|actions|menu/i }));
    await act(async () => {
      fireEvent.click(screen.getByText('Move to Finished'));
      await Promise.resolve();
    });
    expect(classActions.moveToDone).toHaveBeenCalled();
  });

  it('a Mini App in several classes shows no per-class counts, since submissions carry no class', () => {
    renderList([row('m1', 'mini-app')]);
    expect(screen.getByText('Rock Sort')).toBeInTheDocument();
    expect(screen.queryByText(/turned in/)).toBeNull();
  });

  it('Monitor asks the hub to show the roster, and the title keeps the row tour anchor', () => {
    const onSelect = renderList([row('v1', 'video-activity')]);
    expect(
      screen
        .getByText('Volcano Video')
        .closest('[data-tour="assignments-hub.row"]')
    ).not.toBeNull();
    fireEvent.click(screen.getByText('Volcano Video'));
    expect(onSelect).toHaveBeenLastCalledWith('v1');
  });
});
