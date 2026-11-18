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
const flash = {
  id: 'f1',
  sessionId: 'f1',
  setTitle: 'Spanish Verbs',
  teacherUid: 't1',
  status: 'active',
  kind: 'study',
  createdAt: 3,
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
    assignments: [],
    endAssignment: vi.fn(),
    reactivateAssignment: vi.fn(),
  },
  flashcards: { assignments: [flash] },
  writing: { records: [] },
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

  it('shows every kind on the shared rows, Active first and ended work in Done', () => {
    renderList([
      row('q1', 'quiz'),
      row('v1', 'video-activity'),
      row('f1', 'flashcards'),
    ]);
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(screen.getByText('Spanish Verbs')).toBeInTheDocument();
    expect(screen.getByText('· kind:video-activity')).toBeInTheDocument();
    // The ended legacy quiz sits in the collapsed Done section.
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.getByText('· kind:quiz')).toBeInTheDocument();
  });

  it('keeps only the rows the hub filters left', () => {
    renderList([row('v1', 'video-activity')]);
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(screen.queryByText('Spanish Verbs')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Done/ })
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

  it('a kind without class actions yet shows status only, and the title picks the row', () => {
    const onSelect = renderList([row('f1', 'flashcards')]);
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    fireEvent.click(screen.getByText('Spanish Verbs'));
    expect(onSelect).toHaveBeenCalledWith('f1');
  });

  it('marks the selected row', () => {
    renderList([row('v1', 'video-activity')], vi.fn(), 'v1');
    const title = screen.getByText('Volcano Video');
    const rowEl = title.closest('[aria-current]');
    expect(rowEl).not.toBeNull();
    expect(within(rowEl as HTMLElement).getByText('Volcano Video')).toBe(title);
  });
});
