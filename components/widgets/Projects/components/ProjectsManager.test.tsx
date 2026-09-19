import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProjectDefinition, ProjectRun, WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { useProjectRuns } from '@/hooks/useProjectRuns';
import { useRubrics } from '@/hooks/useRubrics';
import { useFolders } from '@/hooks/useFolders';
import { syncRunFromProject } from '@/utils/projectRunWrites';
import { ProjectsManager } from './ProjectsManager';

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useProjectLibrary');
vi.mock('@/hooks/useProjectRuns');
vi.mock('@/hooks/useRubrics');
vi.mock('@/hooks/useFolders');
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('@/utils/projectRunWrites', async () => {
  const actual = await vi.importActual<
    typeof import('@/utils/projectRunWrites')
  >('@/utils/projectRunWrites');
  return {
    ...actual,
    setRunAcceptingUpdates: vi.fn().mockResolvedValue(undefined),
    syncRunFromProject: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('./ProjectEditorModal', () => ({
  ProjectEditorModal: ({
    project,
    onSave,
  }: {
    project: ProjectDefinition;
    onSave: (next: ProjectDefinition) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() => void onSave({ ...project, title: 'Renamed' })}
    >
      {`Save ${project.id}`}
    </button>
  ),
}));

const saveProject = vi.fn().mockResolvedValue(undefined);
const onOpenBoard = vi.fn();
const onSetupGroups = vi.fn();
const onGrade = vi.fn();

const project = (
  overrides: Partial<ProjectDefinition> = {}
): ProjectDefinition => ({
  id: 'project-a',
  title: 'Ecosystem poster',
  steps: [{ id: 'step-1', title: 'Research' }],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const run = (overrides: Partial<ProjectRun> = {}): ProjectRun =>
  ({
    id: 'teacher-1_project-a',
    projectId: 'project-a',
    teacherUid: 'teacher-1',
    title: 'Ecosystem poster',
    steps: [{ id: 'step-1', title: 'Research' }],
    classIds: ['class-a'],
    approvalStepIds: [],
    showStatusToStudents: true,
    acceptingUpdates: true,
    updatedAt: 2,
    ...overrides,
  }) as ProjectRun;

const widget = (config = {}): WidgetData =>
  ({
    id: 'projects-1',
    type: 'projects',
    x: 0,
    y: 0,
    w: 620,
    h: 560,
    z: 1,
    config: { view: 'manager', managerTab: 'library', ...config },
  }) as unknown as WidgetData;

const mockLibrary = (projects: ProjectDefinition[]) =>
  (useProjectLibrary as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    projects,
    loading: false,
    error: null,
    saveProject,
    deleteProject: vi.fn(),
    setArchived: vi.fn().mockResolvedValue(undefined),
    duplicateProject: vi.fn(),
    reorderProjects: vi.fn(),
  });

const mockRuns = (runs: ProjectRun[]) =>
  (useProjectRuns as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    runs,
    loading: false,
    error: null,
  });

const renderManager = (config = {}) =>
  render(
    <ProjectsManager
      widget={widget(config)}
      onOpenBoard={onOpenBoard}
      onSetupGroups={onSetupGroups}
      onGrade={onGrade}
    />
  );

describe('ProjectsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      orgId: 'orono',
    });
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
      addToast: vi.fn(),
      rosters: [
        { id: 'roster-1', name: 'Period 1', classlinkClassId: 'class-a' },
      ],
    });
    (useRubrics as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rubrics: [],
    });
    (useFolders as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      folders: [],
      loading: false,
      error: null,
      moveItem: vi.fn(),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      deleteFolder: vi.fn(),
    });
    mockLibrary([project()]);
    mockRuns([]);
  });

  // The antipattern being fixed: a fresh widget opened on nothing to act on.
  it('offers a way in when the library is empty', () => {
    mockLibrary([]);
    renderManager();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New project' })
    ).toBeInTheDocument();
  });

  it('sets up groups from a project that has never run', () => {
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: 'Set up groups' }));
    expect(onSetupGroups).toHaveBeenCalledWith('project-a');
  });

  it('will not launch a project with no steps yet', () => {
    mockLibrary([project({ steps: [] })]);
    renderManager();
    expect(
      screen.getByRole('button', { name: 'Set up groups' })
    ).toBeDisabled();
  });

  it('opens the board once the project is running', () => {
    mockRuns([run()]);
    renderManager();
    fireEvent.click(screen.getAllByRole('button', { name: 'Open board' })[0]);
    expect(onOpenBoard).toHaveBeenCalledWith('project-a');
  });

  // R2 — In Progress and Archive split on the run's acceptingUpdates flag.
  it('files an open run under In Progress and a closed one under Archive', () => {
    mockRuns([run()]);
    const { rerender } = renderManager({ managerTab: 'active' });
    expect(screen.getByText('Period 1', { exact: false })).toBeInTheDocument();

    mockRuns([run({ acceptingUpdates: false })]);
    rerender(
      <ProjectsManager
        widget={widget({ managerTab: 'active' })}
        onOpenBoard={onOpenBoard}
        onSetupGroups={onSetupGroups}
        onGrade={onGrade}
      />
    );
    expect(screen.getByText('No projects running')).toBeInTheDocument();
  });

  it('names the classes a run covers rather than showing raw class ids', () => {
    mockRuns([run()]);
    renderManager({ managerTab: 'active' });
    expect(screen.getByText(/Period 1/)).toBeInTheDocument();
    expect(screen.queryByText(/class-a/)).not.toBeInTheDocument();
  });

  it('grades from the In Progress card', () => {
    mockRuns([run()]);
    renderManager({ managerTab: 'active' });
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(onGrade).toHaveBeenCalledWith('project-a');
  });

  it('lists a project archived from the library exactly once', () => {
    mockLibrary([project({ archivedAt: 5 })]);
    mockRuns([run({ acceptingUpdates: false })]);
    renderManager({ managerTab: 'archive' });
    expect(screen.getAllByText('Ecosystem poster')).toHaveLength(1);
  });

  // D12/D13 — a launched run holds a snapshot, so an edit has to reach it.
  it('pushes an edit onto the run when the project is already launched', async () => {
    mockRuns([run()]);
    renderManager();
    fireEvent.click(screen.getByText('Ecosystem poster'));
    fireEvent.click(screen.getByRole('button', { name: 'Save project-a' }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    expect(syncRunFromProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'teacher-1_project-a' }),
      expect.objectContaining({ title: 'Renamed' })
    );
  });

  it('leaves every other run alone when a project that never launched is saved', async () => {
    mockLibrary([project(), project({ id: 'project-b', title: 'Habitats' })]);
    mockRuns([run()]);
    renderManager();
    fireEvent.click(screen.getByText('Habitats'));
    fireEvent.click(screen.getByRole('button', { name: 'Save project-b' }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    expect(syncRunFromProject).not.toHaveBeenCalled();
  });

  it('surfaces a Group Maker push instead of burying it in the drawer', () => {
    renderManager({
      pendingImport: {
        rosterId: 'roster-1',
        at: 1,
        groups: [
          { name: 'A', studentIds: [] },
          { name: 'B', studentIds: [] },
        ],
      },
    });
    expect(screen.getByText(/2 groups from the/)).toBeInTheDocument();
  });
});
