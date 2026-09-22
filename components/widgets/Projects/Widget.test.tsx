import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  ProjectGroup,
  ProjectRun,
  ProjectsConfig,
  WidgetData,
} from '@/types';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
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
// The manager owns its own Firestore listeners; routing is what's under test.
vi.mock('./components/ProjectsManager', () => ({
  ProjectsManager: () => <div data-testid="projects-manager" />,
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

  it('opens on the library when nothing is picked yet', () => {
    render(<ProjectsWidget widget={widget({ projectId: undefined })} />);
    expect(screen.getByTestId('projects-manager')).toBeInTheDocument();
  });

  it('keeps the tracker for a widget placed before the library landed', () => {
    // No `view` but a `projectId` is the pre-R1 shape; it must not jump to the library.
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.queryByTestId('projects-manager')).not.toBeInTheDocument();
    expect(screen.getByText('Ecosystem poster')).toBeInTheDocument();
  });

  it('honours an explicit library view even with a project selected', () => {
    render(<ProjectsWidget widget={widget({ view: 'manager' })} />);
    expect(screen.getByTestId('projects-manager')).toBeInTheDocument();
  });

  it('returns to the library from the board', () => {
    render(<ProjectsWidget widget={widget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to the project library' })
    );
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: expect.objectContaining({ view: 'manager' }) as object,
    });
  });

  it('draws one cell per step, labelled with its state', () => {
    render(<ProjectsWidget widget={widget()} />);
    expect(
      screen.getByRole('button', { name: 'Group 1, Research, Done' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
    ).toBeInTheDocument();
  });

  it('names every step in a column header', () => {
    render(<ProjectsWidget widget={widget()} />);
    expect(
      screen.getByRole('columnheader', { name: 'Research' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Draft' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('rowheader', { name: /Group 1/ })
    ).toBeInTheDocument();
  });

  it('spells out what each colour means', () => {
    render(<ProjectsWidget widget={widget()} />);
    for (const label of [
      'Not started',
      'Working',
      'Ready for review',
      'Done',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('marks a group needing help with a chip, never an edge border', () => {
    mockRun({ groups: [group({ needsSupport: true })] });
    render(<ProjectsWidget widget={widget()} />);
    const row = screen
      .getByRole('rowheader', { name: /Group 1/ })
      .closest('tr');
    expect(row).not.toBeNull();
    expect(row?.className).not.toMatch(/border-l/);
    expect(row?.getAttribute('style') ?? '').not.toMatch(/border-left/i);
    expect(
      screen.getByRole('button', { name: 'Clear the help flag for Group 1' })
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

  it('locks only the segment being written, not the whole board', async () => {
    let release: () => void = () => undefined;
    setStepState.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = () => resolve()))
    );
    mockRun({
      groups: [group(), group({ id: 'g2', name: 'Group 2', order: 1 })],
    });
    render(<ProjectsWidget widget={widget()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
      ).toBeDisabled()
    );
    // The other group stays live: a swallowed click is the bug being fixed.
    fireEvent.click(
      screen.getByRole('button', { name: 'Group 2, Draft, Not started' })
    );
    await waitFor(() => expect(setStepState).toHaveBeenCalledTimes(2));
    // Group 2's write settling must not unlock Group 1, whose write is still open.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Group 2, Draft, Not started' })
      ).toBeEnabled()
    );
    expect(
      screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
    ).toBeDisabled();
    release();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
      ).toBeEnabled()
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
      screen.getByText(/showing\s+counts instead of the grid/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('1 of 2 done')).toHaveLength(9);
  });

  it('tracks a hand-built roster under its local class id (D6)', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast: vi.fn(),
      rosters: [{ id: 'roster-2', name: 'Club' }],
      activeRosterId: 'roster-2',
      activeDashboard: { globalStyle: { fontFamily: 'sans' } },
    });
    mockRun({ groups: [group({ classId: 'local:roster-2' })] });
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.queryByText('Pick a class')).not.toBeInTheDocument();
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

  describe('inside a sub share', () => {
    const inShare = (load: () => Promise<unknown>) =>
      function InShare({ children }: { children: React.ReactNode }) {
        return (
          <SubShareContentContext.Provider
            value={{ shareId: 'share-1', version: 0, load: load as never }}
          >
            {children}
          </SubShareContentContext.Provider>
        );
      };

    const bundled = {
      run: {
        id: 'teacher-1_project-1',
        projectId: 'project-1',
        title: 'Ecosystem poster',
        steps: [
          { id: 'step-1', title: 'Research' },
          { id: 'step-2', title: 'Draft', requiresApproval: true },
        ],
      },
      groups: [
        {
          id: 'g1',
          name: 'Group 1',
          classId: 'class-a',
          order: 0,
          stepStates: { 'step-1': 'done', 'step-2': 'notStarted' },
          needsSupport: true,
        },
      ],
    };

    const renderShared = (config: Partial<ProjectsConfig> = {}) => {
      // Empty: a substitute can read neither the project nor its run, so
      // anything on screen has to have come from the bundle.
      mockRun({ run: null, groups: [] });
      return render(<ProjectsWidget widget={widget(config)} />, {
        wrapper: inShare(() => Promise.resolve(bundled)),
      });
    };

    it('shows the teacher’s bundled tracker, not the substitute’s own', async () => {
      renderShared();
      expect(await screen.findByText('Ecosystem poster')).toBeInTheDocument();
      expect(screen.getByText('Group 1')).toBeInTheDocument();
      expect(screen.queryByTestId('projects-manager')).not.toBeInTheDocument();
      // No listener against a run whose rule wants its own teacher.
      expect(useProjectRun).toHaveBeenCalledWith(
        'teacher-1',
        undefined,
        'teacher-1'
      );
    });

    it('draws the tracker read-only, so no cell can be moved', async () => {
      renderShared();
      expect(
        await screen.findByLabelText('Group 1, Research, Done')
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Group 1, Research, Done' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Clear the help flag/ })
      ).not.toBeInTheDocument();
      expect(screen.getByText('Help')).toBeInTheDocument();
    });

    // Each of these writes the teacher's board or their run, which a
    // substitute cannot do, and the library behind it is not theirs to see.
    it('hides the library, the status toggle and the project actions', async () => {
      renderShared();
      await screen.findByText('Ecosystem poster');
      expect(
        screen.queryByRole('button', { name: 'Back to the project library' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Hide status' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Project actions' })
      ).not.toBeInTheDocument();
    });

    // The teacher may have left the widget on its library face; in a share
    // that face is the substitute's own account, and empty.
    it('opens on the tracker even when the teacher left it on the library', async () => {
      renderShared({ view: 'manager' });
      expect(await screen.findByText('Ecosystem poster')).toBeInTheDocument();
      expect(screen.queryByTestId('projects-manager')).not.toBeInTheDocument();
    });

    it('says so rather than opening the substitute’s library when no project came along', async () => {
      renderShared({ projectId: undefined });
      expect(await screen.findByText('No project')).toBeInTheDocument();
      expect(screen.queryByTestId('projects-manager')).not.toBeInTheDocument();
    });

    it('says so when the project had not started at share time', async () => {
      mockRun({ run: null, groups: [] });
      render(<ProjectsWidget widget={widget()} />, {
        wrapper: inShare(() => Promise.resolve(null)),
      });
      expect(await screen.findByText('Not started yet')).toBeInTheDocument();
      expect(
        screen.getByText('This project had no groups yet when it was shared.')
      ).toBeInTheDocument();
    });
  });
});
