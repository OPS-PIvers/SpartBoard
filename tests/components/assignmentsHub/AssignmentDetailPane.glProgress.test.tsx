import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignmentDetailPane } from '@/components/assignmentsHub/AssignmentDetailPane';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useAssignmentRosterStatus } from '@/hooks/useAssignmentRosterStatus';
import { useAssignmentDetailActions } from '@/hooks/useAssignmentDetailActions';
import {
  useGuidedLearningSessionShape,
  useGuidedLearningStudentProgress,
} from '@/hooks/useGuidedLearningStudentProgress';
import type { UnifiedAssignmentRow } from '@/components/assignmentsHub/useUnifiedAssignments';
import type { ClassRoster } from '@/types';

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: () => ({ plcs: [] }) }));
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
vi.mock('@/hooks/useGuidedLearningStudentProgress', () => ({
  useGuidedLearningSessionShape: vi.fn(),
  useGuidedLearningStudentProgress: vi.fn(),
}));

const roster: ClassRoster = {
  id: 'roster-1',
  name: 'Period 2',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [
    {
      id: 's1',
      firstName: 'Alex',
      lastName: 'Doe',
      pin: '01',
      classLinkSourcedId: 'SID-1',
    },
    {
      id: 's2',
      firstName: 'Blair',
      lastName: 'Lee',
      pin: '02',
      classLinkSourcedId: 'SID-2',
    },
  ],
};

const row: UnifiedAssignmentRow = {
  id: 'gl-1',
  kind: 'guided-learning',
  title: 'Log in',
  className: 'Period 2',
  status: 'active',
  targetMode: 'students',
  targetSkippedCount: 0,
  createdAt: 0,
  sessionId: 'gl-1',
  rosterIds: ['roster-1'],
  targetStudents: [
    { kind: 'classlink', sourcedId: 'SID-1' },
    { kind: 'classlink', sourcedId: 'SID-2' },
  ],
  overridesBySourcedId: {},
};

function arrange(opts: { playerV2: boolean }) {
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'teacher-1' },
    orgId: 'org-1',
    canAccessFeature: () => false,
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useDashboard).mockReturnValue({
    rosters: [roster],
  } as unknown as ReturnType<typeof useDashboard>);
  vi.mocked(useAssignmentPseudonymsMulti).mockReturnValue({
    byStudentUid: new Map([
      ['uid-1', { givenName: 'Alex', familyName: 'Doe' }],
      ['uid-2', { givenName: 'Blair', familyName: 'Lee' }],
    ]),
    byAssignmentPseudonym: new Map(),
    targetRefKeyByStudentUid: new Map([
      ['uid-1', 'classlink:SID-1'],
      ['uid-2', 'classlink:SID-2'],
    ]),
    targetRefKeyByAssignmentPseudonym: new Map(),
  } as unknown as ReturnType<typeof useAssignmentPseudonymsMulti>);
  vi.mocked(useAssignmentRosterStatus).mockReturnValue({
    statusByUid: new Map([['uid-1', 'in-progress']]),
    totalQuestions: null,
    loading: false,
  });
  vi.mocked(useAssignmentDetailActions).mockReturnValue({
    saveEdit: vi.fn(),
    closeNow: vi.fn(),
    toTargetingValue: vi.fn(),
  });
  vi.mocked(useGuidedLearningSessionShape).mockImplementation((_id, enabled) =>
    enabled ? { playerV2: opts.playerV2, stepCount: 12 } : null
  );
  vi.mocked(useGuidedLearningStudentProgress).mockImplementation(
    (_id, enabled) =>
      enabled
        ? new Map([
            [
              'uid-1',
              { furthestStepIdx: 6, completed: false, updatedAt: null },
            ],
          ])
        : null
  );
}

describe('AssignmentDetailPane: Guided Learning student progress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the slide for a started student and nothing for one who has not started', () => {
    arrange({ playerV2: true });
    render(<AssignmentDetailPane row={row} />);
    expect(screen.getByText('Slide 7 of 12')).toBeInTheDocument();
    expect(screen.getAllByText(/Slide \d/)).toHaveLength(1);
  });

  it('shows recorded progress on a session started before the v2 player', () => {
    arrange({ playerV2: false });
    render(<AssignmentDetailPane row={row} />);
    expect(screen.getByText('Slide 7 of 12')).toBeInTheDocument();
    expect(screen.queryByText('Not tracked')).not.toBeInTheDocument();
  });

  it('says "Not tracked" for a started student with no progress on an older session', () => {
    arrange({ playerV2: false });
    vi.mocked(useGuidedLearningStudentProgress).mockReturnValue(new Map());
    render(<AssignmentDetailPane row={row} />);
    expect(screen.getByText('Not tracked')).toBeInTheDocument();
  });

  it('waits for progress to load before saying "Not tracked"', () => {
    arrange({ playerV2: false });
    vi.mocked(useGuidedLearningStudentProgress).mockReturnValue(null);
    render(<AssignmentDetailPane row={row} />);
    expect(screen.queryByText('Not tracked')).not.toBeInTheDocument();
  });
});
