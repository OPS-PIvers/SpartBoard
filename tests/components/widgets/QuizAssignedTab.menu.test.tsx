import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeriodAccess, QuizAssignment, QuizResponse } from '@/types';
import type { LibraryMenuAction } from '@/components/common/library/types';
import { QuizAssignedTab } from '@/components/widgets/QuizWidget/components/QuizAssignedTab';
import { AssignedResponsesFixture } from '@/components/widgets/QuizWidget/components/assignedResponsesFixture';

const classActions = {
  openClass: vi.fn(() => Promise.resolve([])),
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
  collection: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  FieldPath: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
}));
vi.mock('@/hooks/useQuizClassActions', () => ({
  useQuizClassActions: () => classActions,
}));
vi.mock('@/hooks/usePeriodRunner', () => ({
  usePeriodRunner: () => (fn: () => Promise<unknown>) =>
    fn().then(() => undefined),
}));

const NOW = Date.now();
const pa = (label: string, over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
  rosterId: label,
  ...over,
});
const quiz = (over: Partial<QuizAssignment>): QuizAssignment =>
  ({
    id: 'a1',
    quizId: 'quiz-1',
    quizTitle: 'Fractions',
    teacherUid: 't1',
    status: 'active',
    sessionMode: 'student',
    createdAt: NOW - 86_400_000,
    updatedAt: NOW,
    ...over,
  }) as QuizAssignment;

const item = (id: string, label: string, destructive = false) => ({
  id,
  label,
  onClick: vi.fn(),
  ...(destructive ? { destructive } : {}),
});

/** The legacy builder's flat items for a row, as QuizManager hands them over. */
function legacyMenu(a: QuizAssignment, pickStudents: () => void) {
  const out: LibraryMenuAction[] = [];
  if (a.status !== 'inactive') {
    out.push(item('monitor', 'Monitor'), item('student-view', 'Student view'));
    out.push(item('results', 'Results'), item('settings', 'Settings'));
    out.push(item('share', 'Share'), item('pause', 'Pause'));
    out.push(item('deactivate', 'End', true), item('delete', 'Delete', true));
  } else {
    out.push(item('import-written', 'Import written answers'));
    out.push(item('monitor', 'Monitor'), item('settings', 'Settings'));
    out.push(item('share', 'Share'));
    out.push(
      item(
        'publish-scores',
        a.scoreVisibility ? 'Update published scores' : 'Publish scores'
      )
    );
    if (a.scoreVisibility)
      out.push(item('unpublish-scores', 'Unpublish scores'));
    out.push({
      ...item('reopen', 'Reopen'),
      submenu: [
        item('reopen-all', 'All students'),
        {
          ...item('reopen-students', 'Select students…'),
          onClick: pickStudents,
        },
      ],
    });
    out.push(item('delete', 'Delete', true));
  }
  out.push(item('share-plc-results', 'Share results with PLC…'));
  return out;
}

const pickStudents = vi.fn();
function renderTab(
  assignments: QuizAssignment[],
  responses: Record<string, QuizResponse[]> = {}
) {
  render(
    <AssignedResponsesFixture.Provider value={responses}>
      <QuizAssignedTab
        assignments={assignments}
        loading={false}
        quizzes={[]}
        rosters={[]}
        lifecycle={{
          pauseAssignment: vi.fn(),
          resumeAssignment: vi.fn(),
          deactivateAssignment: vi.fn(),
          reopenAssignment: vi.fn(),
        }}
        emptyTitle="Nothing active"
        emptySub="Assign a quiz from the Library."
        onMonitor={vi.fn()}
        onResults={vi.fn()}
        legacyPrimary={() => null}
        menu={(a) => legacyMenu(a, pickStudents)}
      />
    </AssignedResponsesFixture.Provider>
  );
}

const menuItems = (): string[] => {
  fireEvent.click(screen.getByRole('button', { name: /more/i }));
  return screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
};

const done = { status: 'completed' } as QuizResponse;

beforeEach(() => vi.clearAllMocks());

describe('Quiz Assigned row menu', () => {
  it('not opened yet: links and settings, no Monitor, Results or sharing', () => {
    renderTab([quiz({ periodAccess: { p1: pa('P1'), p2: pa('P2') } })], {
      a1: [],
    });
    expect(menuItems()).toEqual([
      'Student view',
      'Settings',
      'Close for all classes',
      'Move to Finished',
      'Delete',
    ]);
  });

  it('hides Share results with PLC until there is a response', () => {
    const a = quiz({ periodAccess: { p1: pa('P1', { state: 'open' }) } });
    renderTab([a], { a1: [] });
    expect(menuItems()).not.toContain('Share results with PLC');
  });

  it('a class open: Monitor stays on the row, menu keeps whole-assignment items', () => {
    const a = quiz({
      periodAccess: {
        p1: pa('P1', { state: 'open' }),
        p2: pa('P2', { closedAt: NOW - 1000 }),
      },
    });
    renderTab([a], { a1: [done] });
    expect(screen.getByRole('button', { name: 'Monitor' })).toBeTruthy();
    expect(menuItems()).toEqual([
      'Student view',
      'Settings',
      'Share results with PLC',
      'Close for all classes',
      'Reopen',
      'Move to Finished',
      'Delete',
    ]);
  });

  it('all closed and Active: no settings, one Publish scores item and Reopen', () => {
    const a = quiz({
      status: 'inactive',
      periodAccess: {
        p1: pa('P1', { closedAt: NOW - 1000 }),
        p2: pa('P2', { closedAt: NOW - 1000 }),
      },
    });
    renderTab([a], { a1: [done] });
    expect(menuItems()).toEqual([
      'Import written answers',
      'Publish scores',
      'Share results with PLC',
      'Reopen',
      'Move to Finished',
      'Delete',
    ]);
  });

  it('Finished with scores published: Publish settings and no paper import', () => {
    renderTab([
      quiz({
        status: 'inactive',
        scoreVisibility: 'score-only',
        periodAccess: { p1: pa('P1', { closedAt: NOW - 1000 }) },
      }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /^Finished/ }));
    expect(menuItems()).toEqual([
      'Publish settings',
      'Share results with PLC',
      'Reopen',
      'Delete',
    ]);
  });

  it('a running paper quiz keeps Close in the menu, since its panel has no class controls', () => {
    renderTab([quiz({ paper: true })], { a1: [] });
    expect(menuItems()[0]).toBe('Close');
  });

  it('a running view-only share keeps only Delete', () => {
    renderTab([quiz({ mode: 'view-only' })]);
    expect(menuItems()).toEqual(['Delete']);
  });

  it('Reopen names the class and reopens it for everyone', async () => {
    const a = quiz({
      status: 'inactive',
      periodAccess: {
        p1: pa('P1', { closedAt: NOW - 1000 }),
        p2: pa('P2', { closedAt: NOW - 1000 }),
      },
    });
    renderTab([a], { a1: [done] });
    menuItems();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reopen' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Class' }), {
      target: { value: 'p2' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
      await Promise.resolve();
    });
    expect(classActions.reopenClass).toHaveBeenCalledWith('p2');
  });

  it('Reopen for chosen students opens the existing student picker', () => {
    const a = quiz({
      status: 'inactive',
      periodAccess: { p1: pa('P1', { closedAt: NOW - 1000 }) },
    });
    renderTab([a], { a1: [done] });
    menuItems();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reopen' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('radio', { name: 'Only chosen students' })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    expect(pickStudents).toHaveBeenCalled();
    expect(classActions.reopenClass).not.toHaveBeenCalled();
  });
});
