// Session-derived read-aloud state must not carry over when another assignment is selected.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignmentDetailPane } from '@/components/assignmentsHub/AssignmentDetailPane';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useAssignmentRosterStatus } from '@/hooks/useAssignmentRosterStatus';
import { useAssignmentDetailActions } from '@/hooks/useAssignmentDetailActions';
import type { UnifiedAssignmentRow } from '@/components/assignmentsHub/useUnifiedAssignments';

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: () => ({ plcs: [] }) }));
vi.mock('@/hooks/usePlcAssessments', () => ({
  usePlcAssessments: () => ({ assessments: [], loading: false, error: null }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useAssignmentPseudonyms')
  >('@/hooks/useAssignmentPseudonyms');
  return { ...actual, useAssignmentPseudonymsMulti: vi.fn() };
});
vi.mock('@/hooks/useAssignmentRosterStatus', () => ({
  useAssignmentRosterStatus: vi.fn(),
}));
vi.mock('@/hooks/useAssignmentDetailActions', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useAssignmentDetailActions')
  >('@/hooks/useAssignmentDetailActions');
  return { ...actual, useAssignmentDetailActions: vi.fn() };
});
vi.mock('@/config/firebase', () => ({ db: {} }));
const sessionSnaps = vi.hoisted((): { emit: Record<string, unknown> } => ({
  emit: {},
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: vi.fn(),
  onSnapshot: (
    ref: { id: string },
    next: (snap: { data: () => unknown }) => void
  ) => {
    if (ref.id in sessionSnaps.emit)
      next({ data: () => sessionSnaps.emit[ref.id] });
    return () => undefined;
  },
}));

const rowFor = (id: string): UnifiedAssignmentRow => ({
  id,
  kind: 'quiz',
  title: `Quiz ${id}`,
  className: 'Period 2',
  status: 'active',
  targetMode: 'class',
  targetSkippedCount: 0,
  createdAt: 0,
  sessionId: id,
  rosterIds: [],
});

describe('AssignmentDetailPane read-aloud status across rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionSnaps.emit = {};
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      orgId: 'org-1',
      canAccessFeature: (f: string) => f === 'quiz-read-aloud',
    });
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rosters: [],
    });
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      byStudentUid: new Map(),
      byAssignmentPseudonym: new Map(),
      targetRefKeyByStudentUid: new Map(),
      targetRefKeyByAssignmentPseudonym: new Map(),
      loading: false,
    });
    (
      useAssignmentRosterStatus as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      statusByUid: new Map(),
      totalQuestions: 0,
      loading: false,
    });
    (
      useAssignmentDetailActions as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      saveEdit: vi.fn(),
      closeNow: vi.fn(),
      toTargetingValue: vi.fn(),
    });
  });

  it("does not show the previous quiz's read-aloud status on the next one", () => {
    sessionSnaps.emit = { a: { readAloud: { status: 'preparing' } } };
    const { rerender } = render(<AssignmentDetailPane row={rowFor('a')} />);
    expect(screen.getByText('Preparing read-aloud…')).toBeTruthy();
    rerender(<AssignmentDetailPane row={rowFor('b')} />);
    expect(screen.queryByText('Preparing read-aloud…')).toBeNull();
  });
});
