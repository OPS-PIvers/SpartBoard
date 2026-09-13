// The §10 post-publish language advisory belongs to the quiz-translation flag:
// a read-aloud-only teacher must never see a nag they cannot act on.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignmentDetailPane } from '@/components/assignmentsHub/AssignmentDetailPane';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useAssignmentRosterStatus } from '@/hooks/useAssignmentRosterStatus';
import { useAssignmentDetailActions } from '@/hooks/useAssignmentDetailActions';
import type { UnifiedAssignmentRow } from '@/components/assignmentsHub/useUnifiedAssignments';
import type { ClassRoster } from '@/types';

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
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  // The live session serves no localized strings, so 'so' is newly requested.
  onSnapshot: (
    _ref: unknown,
    next: (snap: { data: () => unknown }) => void
  ) => {
    next({ data: () => ({ publicQuestions: [{ id: 'q1' }] }) });
    return () => undefined;
  },
}));

const roster: ClassRoster = {
  id: 'roster-1',
  name: 'Period 2',
  driveFileId: null,
  studentCount: 1,
  createdAt: 0,
  students: [
    {
      id: 's1',
      firstName: 'Alex',
      lastName: 'Doe',
      pin: '01',
      classLinkSourcedId: 'SID-1',
    },
  ],
};

const row = (): UnifiedAssignmentRow =>
  ({
    id: 'assign-1',
    kind: 'quiz',
    title: 'Fractions Quiz',
    className: 'Period 2',
    status: 'active',
    targetMode: 'students',
    targetSkippedCount: 0,
    createdAt: 0,
    sessionId: 'assign-1',
    rosterIds: ['roster-1'],
    targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
    overridesBySourcedId: { 'classlink:SID-1': { language: 'so' } },
  }) as UnifiedAssignmentRow;

const setFeatures = (allowed: string[]) =>
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { uid: 'teacher-1' },
    orgId: 'org-1',
    canAccessFeature: (f: string) => allowed.includes(f),
  });

describe('AssignmentDetailPane post-publish language advisory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rosters: [roster],
    });
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      byStudentUid: new Map([
        ['uid-1', { givenName: 'Alex', familyName: 'Doe' }],
      ]),
      byAssignmentPseudonym: new Map(),
      targetRefKeyByStudentUid: new Map([['uid-1', 'classlink:SID-1']]),
      targetRefKeyByAssignmentPseudonym: new Map(),
    });
    (
      useAssignmentRosterStatus as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      statusByUid: new Map([['uid-1', 'not-started']]),
      totalQuestions: 5,
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

  it('shows the advisory to a teacher who has the translation flag', () => {
    setFeatures(['quiz-translation']);
    render(<AssignmentDetailPane row={row()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('hides it from a read-aloud-only teacher', () => {
    setFeatures(['quiz-read-aloud']);
    render(<AssignmentDetailPane row={row()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});
