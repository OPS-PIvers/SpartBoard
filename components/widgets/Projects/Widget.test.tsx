import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  ProjectGroup,
  ProjectRun,
  ProjectsConfig,
  WidgetData,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { ProjectsWidget } from './Widget';

vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth');
vi.mock('@/hooks/useProjectRun');
vi.mock('@/hooks/useProjectsWidgetSettings');
vi.mock('@/components/common/ActiveClassChip', () => ({
  ActiveClassChip: () => <div data-testid="active-class-chip" />,
}));

const setStepState = vi.fn().mockResolvedValue(undefined);
const setNeedsSupport = vi.fn().mockResolvedValue(undefined);
const updateWidget = vi.fn();

const run: ProjectRun = {
  id: 'teacher-1_project-1',
  projectId: 'project-1',
  teacherUid: 'teacher-1',
  title: 'Ecosystem poster',
  steps: [
    { id: 'step-1', title: 'Research' },
    { id: 'step-2', title: 'Draft', requiresApproval: true },
  ],
  classIds: ['class-a'],
  approvalStepIds: ['step-2'],
  showStatusToStudents: true,
  acceptingUpdates: true,
  updatedAt: 1,
};

const group = (overrides: Partial<ProjectGroup> = {}): ProjectGroup => ({
  id: 'g1',
  name: 'Group 1',
  classId: 'class-a',
  memberUids: [],
  order: 0,
  stepStates: { 'step-1': 'done', 'step-2': 'notStarted' },
  needsSupport: false,
  workLinks: [],
  updatedAt: 1,
  ...overrides,
});

const widget = (config: Partial<ProjectsConfig> = {}): WidgetData => ({
  id: 'projects-1',
  type: 'projects',
  x: 0,
  y: 0,
  w: 540,
  h: 360,
  z: 1,
  flipped: false,
  config: { projectId: 'project-1', showStatus: true, ...config },
});

const mockRun = (overrides: Record<string, unknown> = {}) =>
  (useProjectRun as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    run,
    groups: [group()],
    loading: false,
    error: null,
    setStepState,
    setNeedsSupport,
    ensureRun: vi.fn(),
    addWorkLink: vi.fn(),
    removeWorkLink: vi.fn(),
    updateRun: vi.fn(),
    importGroups: vi.fn(),
    ...overrides,
  });

describe('ProjectsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast: vi.fn(),
      rosters: [
        { id: 'roster-1', name: 'Period 1', classlinkClassId: 'class-a' },
      ],
      activeRosterId: 'roster-1',
      activeDashboard: { globalStyle: { fontFamily: 'sans' } },
    });
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
    });
    (
      useProjectsWidgetSettings as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ enabled: true });
    mockRun();
  });

  it('says so when the rollout switch is off', () => {
    (
      useProjectsWidgetSettings as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ enabled: false });
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByText('Projects is off')).toBeInTheDocument();
  });

  it('points at the back face when no project is picked', () => {
    render(<ProjectsWidget widget={widget({ projectId: undefined })} />);
    expect(screen.getByText('No project picked')).toBeInTheDocument();
  });

  it('draws one segment per step, labelled with its state', () => {
    render(<ProjectsWidget widget={widget()} />);
    expect(
      screen.getByRole('button', { name: 'Group 1, Research, Done' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
    ).toBeInTheDocument();
  });

  it('shows only the groups in the active class', () => {
    mockRun({
      groups: [
        group(),
        group({ id: 'g2', name: 'Group 2', classId: 'class-b' }),
      ],
    });
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.queryByText('Group 2')).not.toBeInTheDocument();
  });

  it('floats a group asking for help to the top', () => {
    mockRun({
      groups: [
        group(),
        group({ id: 'g2', name: 'Group 2', order: 1, needsSupport: true }),
      ],
    });
    render(<ProjectsWidget widget={widget()} />);
    const names = screen.getAllByText(/^Group \d$/).map((el) => el.textContent);
    expect(names[0]).toBe('Group 2');
  });

  it('lets the teacher cycle a step and clear a help flag', async () => {
    mockRun({ groups: [group({ needsSupport: true })] });
    render(<ProjectsWidget widget={widget()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
    );
    await waitFor(() =>
      expect(setStepState).toHaveBeenCalledWith(
        'g1',
        'step-2',
        'inProgress',
        'teacher'
      )
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear the help flag for Group 1' })
    );
    await waitFor(() =>
      expect(setNeedsSupport).toHaveBeenCalledWith('g1', false, 'teacher')
    );
  });

  it('cycles an approval step through done for the teacher', async () => {
    mockRun({
      groups: [group({ stepStates: { 'step-2': 'readyForReview' } })],
    });
    render(<ProjectsWidget widget={widget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1, Draft, Ready for review' })
    );
    await waitFor(() =>
      expect(setStepState).toHaveBeenCalledWith(
        'g1',
        'step-2',
        'done',
        'teacher'
      )
    );
  });

  it('swaps the bar for counts when status is hidden', () => {
    render(<ProjectsWidget widget={widget({ showStatus: false })} />);
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show status' }));
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: expect.objectContaining({ showStatus: true }) as object,
    });
  });

  it('falls back to counts past the comfortable ceiling', () => {
    mockRun({
      groups: Array.from({ length: 9 }, (_, i) =>
        group({ id: `g${i}`, name: `Group ${i}`, order: i })
      ),
    });
    render(<ProjectsWidget widget={widget()} />);
    expect(
      screen.getByText(/showing\s+counts instead of the bar/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('1 of 2 done')).toHaveLength(9);
  });

  it('asks for a class when none is active', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast: vi.fn(),
      rosters: [],
      activeRosterId: null,
      activeDashboard: { globalStyle: { fontFamily: 'sans' } },
    });
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByText('Pick a class')).toBeInTheDocument();
  });
});
