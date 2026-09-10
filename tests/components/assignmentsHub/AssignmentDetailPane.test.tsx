import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

function makeRow(
  overrides: Partial<UnifiedAssignmentRow> = {}
): UnifiedAssignmentRow {
  return {
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
    overridesBySourcedId: {},
    ...overrides,
  };
}

const mockSaveEdit = vi.fn();
const mockCloseNow = vi.fn();

describe('AssignmentDetailPane — D3 edit-in-place', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      orgId: 'org-1',
      canAccessFeature: () => false,
    });
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
    mockSaveEdit.mockResolvedValue({ skipped: [] });
    (
      useAssignmentDetailActions as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      saveEdit: mockSaveEdit,
      closeNow: mockCloseNow,
      toTargetingValue: vi.fn(),
    });
  });

  it('shows read-only D2 behavior unchanged when Edit is not clicked', () => {
    render(<AssignmentDetailPane row={makeRow()} />);
    expect(screen.getByText('Alex Doe')).toBeInTheDocument();
    expect(mockSaveEdit).not.toHaveBeenCalled();
  });

  it('opens the targeting editor and saves on Save', async () => {
    render(<AssignmentDetailPane row={makeRow()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockSaveEdit).toHaveBeenCalledTimes(1));
    const [rowArg, userIdArg] = mockSaveEdit.mock.calls[0] as [
      UnifiedAssignmentRow,
      string,
    ];
    expect(rowArg.id).toBe('assign-1');
    expect(userIdArg).toBe('teacher-1');
  });

  it('closes the editor without saving on Cancel', () => {
    render(<AssignmentDetailPane row={makeRow()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
    expect(mockSaveEdit).not.toHaveBeenCalled();
  });

  it('closes the assignment early via Close now', async () => {
    render(<AssignmentDetailPane row={makeRow()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close now' }));
    await waitFor(() => expect(mockCloseNow).toHaveBeenCalledTimes(1));
  });

  it('disables Close now for an assignment already closed', () => {
    render(
      <AssignmentDetailPane row={makeRow({ closeAt: Date.now() - 1000 })} />
    );
    expect(screen.getByRole('button', { name: 'Close now' })).toBeDisabled();
  });

  it('renders a removed-but-submitted row marked "Removed — work retained"', () => {
    (
      useAssignmentRosterStatus as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      statusByUid: new Map([['uid-1', 'submitted']]),
      totalQuestions: 5,
      loading: false,
    });
    render(
      <AssignmentDetailPane
        row={makeRow({
          targetStudents: [],
          removedStudentRefs: [{ kind: 'classlink', sourcedId: 'SID-1' }],
        })}
      />
    );
    expect(screen.getByText('Alex Doe')).toBeInTheDocument();
    expect(screen.getByText('Removed — work retained')).toBeInTheDocument();
  });

  it('keeps header controls and offers an Add students action when the roster is empty (F2)', () => {
    render(
      <AssignmentDetailPane
        row={makeRow({ targetStudents: [], rosterIds: [] })}
      />
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close now' })
    ).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: 'Add students' });
    fireEvent.click(addButton);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('AssignmentDetailPane — Schoology section resolution', () => {
  const linkedRoster: ClassRoster = {
    ...roster,
    id: 'roster-lti',
    name: 'Biology B2',
    ltiContextId: 'ctx-1',
  };

  const schoologyRow = (overrides: Partial<UnifiedAssignmentRow> = {}) =>
    makeRow({
      targetMode: 'class',
      rosterIds: [],
      targetStudents: [],
      className: 'Schoology',
      periodNames: ['Biology Section 2'],
      classIds: ['schoology:ctx-1'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Biology Section 2' },
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      orgId: 'org-1',
      canAccessFeature: () => false,
    });
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      byStudentUid: new Map(),
      byAssignmentPseudonym: new Map(),
      targetRefKeyByStudentUid: new Map(),
      targetRefKeyByAssignmentPseudonym: new Map(),
    });
    (
      useAssignmentRosterStatus as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      statusByUid: new Map(),
      totalQuestions: 5,
      loading: false,
    });
    (
      useAssignmentDetailActions as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      saveEdit: mockSaveEdit,
      closeNow: mockCloseNow,
      toTargetingValue: vi.fn(),
    });
  });

  it('resolves a linked section to its SpartBoard class and lists its students', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rosters: [linkedRoster],
    });
    render(<AssignmentDetailPane row={schoologyRow()} />);
    expect(screen.getByText('Biology B2')).toBeInTheDocument();
    expect(screen.queryByText('Not linked')).not.toBeInTheDocument();
    expect(screen.getByText('Alex Doe')).toBeInTheDocument();
  });

  it('falls back to the section title with a "Not linked" hint when no roster mirrors the context', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rosters: [roster],
    });
    render(<AssignmentDetailPane row={schoologyRow()} />);
    expect(screen.getByText('Biology Section 2')).toBeInTheDocument();
    expect(screen.getByText('Not linked')).toBeInTheDocument();
  });

  it('leaves a plain rosterIds assignment untouched', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rosters: [roster, linkedRoster],
    });
    render(
      <AssignmentDetailPane
        row={makeRow({
          targetMode: 'class',
          rosterIds: ['roster-1'],
          targetStudents: [],
        })}
      />
    );
    expect(screen.getByText('Alex Doe')).toBeInTheDocument();
    expect(screen.queryByText('Not linked')).not.toBeInTheDocument();
    expect(screen.queryByText('Biology B2')).not.toBeInTheDocument();
  });
});

describe('AssignmentDetailPane — PLC results sharing (D12)', () => {
  const mockAddToast = vi.fn();
  const share = vi.fn().mockResolvedValue(undefined);
  const stopSharing = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      orgId: 'org-1',
      canAccessFeature: () => false,
    });
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rosters: [roster],
      addToast: mockAddToast,
    });
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      byStudentUid: new Map(),
      byAssignmentPseudonym: new Map(),
      targetRefKeyByStudentUid: new Map(),
      targetRefKeyByAssignmentPseudonym: new Map(),
    });
    (
      useAssignmentRosterStatus as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      statusByUid: new Map(),
      totalQuestions: 5,
      loading: false,
    });
    (
      useAssignmentDetailActions as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      saveEdit: mockSaveEdit,
      closeNow: mockCloseNow,
      toTargetingValue: vi.fn(),
    });
  });

  it('shows the linked PLC and stops sharing through the quiz actions', async () => {
    render(
      <AssignmentDetailPane
        row={makeRow({ plc: { id: 'plc-1', name: 'Math PLC' } })}
        quizPlcActions={{ share, stopSharing }}
      />
    );
    expect(
      screen.getByText('Sharing results with Math PLC')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(stopSharing).toHaveBeenCalledWith('assign-1'));
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('Math PLC'),
      'success'
    );
  });

  it('hides the share entry point when the teacher belongs to no PLC', () => {
    render(
      <AssignmentDetailPane
        row={makeRow()}
        quizPlcActions={{ share, stopSharing }}
      />
    );
    expect(
      screen.queryByRole('button', { name: /Share results with PLC/ })
    ).not.toBeInTheDocument();
  });

  it('never renders PLC controls on non-quiz rows', () => {
    render(
      <AssignmentDetailPane
        row={makeRow({
          kind: 'video-activity',
          plc: { id: 'plc-1', name: 'Math PLC' },
        })}
        quizPlcActions={{ share, stopSharing }}
      />
    );
    expect(screen.queryByText(/Sharing results with/)).not.toBeInTheDocument();
  });
});
