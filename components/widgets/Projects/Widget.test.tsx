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
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { useProjectGroupWork } from '@/hooks/useProjectGroupWork';
import { useProjectUploads } from '@/hooks/useProjectUploads';
import { useProjectGroupEvents } from '@/hooks/useProjectGroupEvents';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { NO_STUDENT_SIGN_IN_WARNING } from './projectSteps';
import { ProjectsWidget } from './Widget';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth');
vi.mock('@/hooks/useProjectRun');
vi.mock('@/hooks/useProjectsWidgetSettings');
vi.mock('@/hooks/useProjectGroupWork');
vi.mock('@/hooks/useProjectUploads');
vi.mock('@/hooks/useProjectGroupEvents');
vi.mock('@/hooks/useAssignmentPseudonyms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAssignmentPseudonyms')>()),
  useAssignmentPseudonymsMulti: vi.fn(),
}));
// The manager owns its own Firestore listeners; routing is what's under test.
vi.mock('./components/ProjectsManager', () => ({
  ProjectsManager: () => <div data-testid="projects-manager" />,
}));

const setStepState = vi.fn().mockResolvedValue(undefined);
const updateWidget = vi.fn();

const link = {
  id: 'l1',
  url: 'https://docs.example.com/poster',
  label: 'Poster doc',
  stepId: 'step-1',
  addedByUid: 'uid-1',
  addedAt: 1,
};

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
  config: { projectId: 'project-1', ...config },
});

const mockRun = (overrides: Record<string, unknown> = {}) =>
  (useProjectRun as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    run,
    groups: [group()],
    loading: false,
    error: null,
    setStepState,
    ensureRun: vi.fn(),
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
        {
          id: 'roster-1',
          name: 'Period 1',
          classlinkClassId: 'class-a',
          students: [],
        },
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
    (
      useProjectGroupWork as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ workLinks: [], legacySeed: undefined, loading: false });
    (useProjectUploads as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      uploads: [],
      loading: false,
      error: null,
      uploadFile: vi.fn(),
      removeUpload: vi.fn(),
    });
    (
      useProjectGroupEvents as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ events: [], loading: false });
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      byStudentUid: new Map(),
      byAssignmentPseudonym: new Map(),
      targetRefKeyByStudentUid: new Map(),
      targetRefKeyByAssignmentPseudonym: new Map(),
    });
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

  it('has no help flag on the board (D38)', () => {
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByRole('rowheader', { name: /Group 1/ })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /help flag/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
  });

  it('offers no way to show students other groups', async () => {
    render(<ProjectsWidget widget={widget()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project actions' }));
    await screen.findByRole('menuitem', { name: 'Manage groups' });
    expect(
      screen.queryByRole('menuitem', { name: /other groups/i })
    ).not.toBeInTheDocument();
  });

  it('shows only the groups in the board class', () => {
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

  it('keeps the groups in the teacher’s order', () => {
    mockRun({
      groups: [group({ id: 'g2', name: 'Group 2', order: 1 }), group()],
    });
    render(<ProjectsWidget widget={widget()} />);
    const names = screen.getAllByText(/^Group \d$/).map((el) => el.textContent);
    expect(names).toEqual(['Group 1', 'Group 2']);
  });

  it('sets the exact state from the status popover in one write (D34)', async () => {
    render(<ProjectsWidget widget={widget()} />);

    const cell = screen.getByRole('button', {
      name: 'Group 1, Draft, Not started',
    });
    expect(cell).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(cell);
    expect(
      await screen.findByRole('menu', { name: 'Group 1: Draft' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: 'Not started' })
    ).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: 'Ready for review' })
    );
    await waitFor(() =>
      expect(setStepState).toHaveBeenCalledWith(
        'g1',
        'step-2',
        'readyForReview',
        'teacher'
      )
    );
    expect(setStepState).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers Done on an approval step and writes nothing for the current state', async () => {
    mockRun({
      groups: [group({ stepStates: { 'step-2': 'readyForReview' } })],
    });
    render(<ProjectsWidget widget={widget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1, Draft, Ready for review' })
    );
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Ready for review' })
    );
    expect(setStepState).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1, Draft, Ready for review' })
    );
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Done' }));
    await waitFor(() =>
      expect(setStepState).toHaveBeenCalledWith(
        'g1',
        'step-2',
        'done',
        'teacher'
      )
    );
  });

  it('closes the status popover on Escape', async () => {
    render(<ProjectsWidget widget={widget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
    );
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('locks only the cell being written, not the whole board', async () => {
    let release: () => void = () => undefined;
    setStepState.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = () => resolve()))
    );
    mockRun({
      groups: [group(), group({ id: 'g2', name: 'Group 2', order: 1 })],
    });
    render(<ProjectsWidget widget={widget()} />);

    const pick = async (name: string, state: string) => {
      fireEvent.click(screen.getByRole('button', { name }));
      fireEvent.click(
        await screen.findByRole('menuitemradio', { name: state })
      );
    };

    await pick('Group 1, Draft, Not started', 'Working');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
      ).toBeDisabled()
    );
    await pick('Group 2, Draft, Not started', 'Working');
    await waitFor(() => expect(setStepState).toHaveBeenCalledTimes(2));
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

  it('collapses to one bar per group and remembers it on the board (D37)', () => {
    render(<ProjectsWidget widget={widget({ boardCollapsed: true })} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bars' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: expect.objectContaining({ boardCollapsed: false }) as object,
    });
  });

  it('keeps step titles and lets the teacher set a step from the bars', () => {
    render(<ProjectsWidget widget={widget({ boardCollapsed: true })} />);
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1, Draft, Not started' })
    );
    expect(
      screen.getByRole('menu', { name: 'Group 1: Draft' })
    ).toBeInTheDocument();
  });

  it('writes boardCollapsed when collapsing the grid', () => {
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bars' }));
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: expect.objectContaining({ boardCollapsed: true }) as object,
    });
  });

  it('reads the legacy hidden-status toggle as collapsed', () => {
    render(<ProjectsWidget widget={widget({ showStatus: false })} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('draws the grid at any group count (D31)', () => {
    mockRun({
      groups: Array.from({ length: 12 }, (_, i) =>
        group({ id: `g${i}`, name: `Group ${i}`, order: i })
      ),
    });
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.queryByText('Showing counts.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('rowheader')).toHaveLength(12);
    expect(
      screen.getByRole('button', { name: 'Group 11, Draft, Not started' })
    ).toBeInTheDocument();
  });

  it('tracks a hand-built roster under its local class id and warns (D6, D45)', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast: vi.fn(),
      rosters: [{ id: 'roster-2', name: 'Club', students: [] }],
      activeRosterId: null,
      activeDashboard: { globalStyle: { fontFamily: 'sans' } },
    });
    mockRun({
      run: { ...run, classIds: ['local:roster-2'] },
      groups: [group({ classId: 'local:roster-2' })],
    });
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Club')).toBeInTheDocument();
    expect(screen.getByText(NO_STUDENT_SIGN_IN_WARNING)).toBeInTheDocument();
  });

  it('auto-selects the only class without reading the active class (D32)', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast: vi.fn(),
      rosters: [],
      activeRosterId: null,
      activeDashboard: { globalStyle: { fontFamily: 'sans' } },
    });
    render(<ProjectsWidget widget={widget()} />);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Class 1')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByText(NO_STUDENT_SIGN_IN_WARNING)
    ).not.toBeInTheDocument();
  });

  it('switches classes from the board picker', () => {
    mockRun({
      run: {
        ...run,
        classIds: ['class-a', 'class-b'],
        classNames: { 'class-a': 'Period 1', 'class-b': 'Period 2' },
      },
      groups: [
        group(),
        group({ id: 'g2', name: 'Group 2', classId: 'class-b' }),
      ],
    });
    render(<ProjectsWidget widget={widget({ boardClassId: 'class-b' })} />);
    expect(screen.getByText('Group 2')).toBeInTheDocument();
    expect(screen.queryByText('Group 1')).not.toBeInTheDocument();
    const picker = screen.getByRole('combobox', { name: 'Class' });
    expect(picker).toHaveValue('class-b');
    fireEvent.change(picker, { target: { value: 'class-a' } });
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: expect.objectContaining({ boardClassId: 'class-a' }) as object,
    });
  });

  it('falls back to the first class when the saved one left the run', () => {
    render(<ProjectsWidget widget={widget({ boardClassId: 'gone' })} />);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
  });

  it('counts steps waiting for review and opens the first (D36)', async () => {
    mockRun({
      groups: [
        group({ stepStates: { 'step-1': 'readyForReview' } }),
        group({
          id: 'g2',
          name: 'Group 2',
          order: 1,
          stepStates: { 'step-2': 'readyForReview' },
        }),
      ],
    });
    render(<ProjectsWidget widget={widget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: '2 waiting for review' })
    );
    expect(
      await screen.findByRole('menu', { name: 'Group 1: Research' })
    ).toBeInTheDocument();
  });

  it('dots a cell whose step has work tagged to it', () => {
    (
      useProjectGroupWork as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      workLinks: [link],
      legacySeed: undefined,
      loading: false,
    });
    render(<ProjectsWidget widget={widget()} />);
    expect(
      screen.getByRole('button', {
        name: 'Group 1, Research, Done, work attached',
      })
    ).toBeInTheDocument();
  });

  it('expands a group to show members, work and recent events (D35)', async () => {
    (
      useProjectGroupWork as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      workLinks: [link],
      legacySeed: undefined,
      loading: false,
    });
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      byStudentUid: new Map([
        ['uid-1', { givenName: 'Ada', familyName: 'Lovelace' }],
      ]),
      byAssignmentPseudonym: new Map(),
      targetRefKeyByStudentUid: new Map(),
      targetRefKeyByAssignmentPseudonym: new Map(),
    });
    (
      useProjectGroupEvents as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      events: [
        {
          id: 'e1',
          at: Date.now(),
          actorUid: 'teacher-1',
          actorRole: 'teacher',
          kind: 'stepState',
          stepId: 'step-1',
          to: 'done',
        },
      ],
      loading: false,
    });
    mockRun({ groups: [group({ memberUids: ['uid-1'] })] });
    render(<ProjectsWidget widget={widget()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1', expanded: false })
    );
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Poster doc' })).toHaveAttribute(
      'href',
      'https://docs.example.com/poster'
    );
    expect(
      screen.getByText("Teacher set 'Research' to Done")
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Group 1', expanded: true })
    );
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  describe('inside a sub share', () => {
    const inShare = (load: () => Promise<unknown>) =>
      function InShare({ children }: { children: React.ReactNode }) {
        return (
          <SubShareContentContext.Provider
            value={subShareContextValue({
              shareId: 'share-1',
              version: 0,
              load: load as never,
              loadKey: noSubShareKey,
            })}
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
    });

    // Each of these writes the teacher's board or their run, which a
    // substitute cannot do, and the library behind it is not theirs to see.
    it('hides the library, the collapse toggle and the project actions', async () => {
      renderShared();
      await screen.findByText('Ecosystem poster');
      expect(
        screen.queryByRole('button', { name: 'Back to the project library' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Board layout' })
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
