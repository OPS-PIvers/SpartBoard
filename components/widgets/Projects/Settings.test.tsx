import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProjectDefinition, ProjectRun, WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useRubrics } from '@/hooks/useRubrics';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { ProjectsSettings } from './Settings';

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useProjectLibrary');
vi.mock('@/hooks/useProjectRun');
vi.mock('@/hooks/useRubrics');
vi.mock('@/hooks/useProjectsWidgetSettings');
vi.mock('./components/GroupImportPanel', () => ({
  GroupImportPanel: ({
    onImport,
  }: {
    onImport: (entries: unknown[]) => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onImport([])}>
      Confirm import
    </button>
  ),
}));

const saveProject = vi.fn().mockResolvedValue(undefined);
const updateRun = vi.fn().mockResolvedValue(undefined);
const updateWidget = vi.fn();
const addToast = vi.fn();

const projectA: ProjectDefinition = {
  id: 'project-a',
  title: 'Ecosystem poster',
  steps: [{ id: 'step-1', title: 'Research' }],
  createdAt: 1,
  updatedAt: 1,
};

const runA: ProjectRun = {
  id: 'teacher-1_project-a',
  projectId: 'project-a',
  teacherUid: 'teacher-1',
  title: projectA.title,
  steps: projectA.steps,
  classIds: [],
  approvalStepIds: [],
  showStatusToStudents: true,
  acceptingUpdates: true,
  updatedAt: 1,
};

const widget: WidgetData = {
  id: 'projects-1',
  type: 'projects',
  x: 0,
  y: 0,
  w: 540,
  h: 360,
  z: 1,
  flipped: true,
  config: { projectId: 'project-a' },
};

describe('ProjectsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      orgId: 'orono',
      selectedBuildings: ['high'],
      featurePermissions: [
        {
          widgetType: 'projects',
          config: {
            buildingDefaults: {
              high: { buildingId: 'high', defaultShowStatusToStudents: false },
            },
          },
        },
      ],
    });
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast,
      rosters: [],
    });
    (
      useProjectsWidgetSettings as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ enabled: true });
    (useProjectLibrary as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      projects: [projectA],
      saveProject,
    });
    (useRubrics as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rubrics: [],
      loading: false,
      error: null,
      saveRubric: vi.fn(),
      deleteRubric: vi.fn(),
      shareRubric: vi.fn(),
      importSharedRubric: vi.fn(),
    });
    (useProjectRun as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      run: runA,
      groups: [],
      ensureRun: vi.fn(),
      updateRun,
      importGroups: vi.fn(),
    });
  });

  it('seeds a new run from the building default the admin set', async () => {
    const ensureRun = vi.fn().mockResolvedValue(runA);
    (useProjectRun as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      run: runA,
      groups: [],
      ensureRun,
      updateRun,
      importGroups: vi
        .fn()
        .mockResolvedValue({ groupsWritten: 1, membersResolved: 2 }),
    });
    render(
      <ProjectsSettings
        widget={{
          ...widget,
          config: {
            projectId: 'project-a',
            pendingImport: { rosterId: 'roster-1', at: 1, groups: [] },
          },
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));

    await waitFor(() =>
      expect(ensureRun).toHaveBeenCalledWith(projectA, {
        showStatusToStudents: false,
      })
    );
  });

  it('calls a hand-built roster import a tracker rather than reporting no students', async () => {
    (useProjectRun as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      run: runA,
      groups: [],
      ensureRun: vi.fn().mockResolvedValue(runA),
      updateRun,
      importGroups: vi
        .fn()
        .mockResolvedValue({ groupsWritten: 11, membersResolved: 0 }),
    });
    render(
      <ProjectsSettings
        widget={{
          ...widget,
          config: {
            projectId: 'project-a',
            pendingImport: { rosterId: 'roster-1', at: 1, groups: [] },
          },
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    const [message, tone] = addToast.mock.calls.at(-1) as [string, string];
    expect(message).toContain('11 groups');
    // "0 students" reads as a failed import; it is a working teacher-only tracker.
    expect(message).not.toContain('0 students');
    expect(message).toContain('tracker you move yourself');
    expect(tone).toBe('info');
  });

  it('leaves the open project’s run alone when a new project is created', async () => {
    render(<ProjectsSettings widget={widget} />);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    // The run doc still belongs to the project that was open, so writing the
    // empty new project into it would wipe a live run.
    expect(updateRun).not.toHaveBeenCalled();
    expect(updateWidget).toHaveBeenCalledWith('projects-1', {
      config: expect.objectContaining({
        projectId: (saveProject.mock.calls[0][0] as ProjectDefinition).id,
      }) as object,
    });
  });

  it('holds the title until blur, then syncs the run', async () => {
    render(<ProjectsSettings widget={widget} />);
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Ecosystem diorama' } });
    expect(saveProject).not.toHaveBeenCalled();

    fireEvent.blur(title);
    await waitFor(() =>
      expect(updateRun).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Ecosystem diorama' }) as object
      )
    );
    expect(saveProject).toHaveBeenCalledOnce();
  });

  it('writes nothing when the title is blurred unchanged', async () => {
    render(<ProjectsSettings widget={widget} />);
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: projectA.title } });
    fireEvent.blur(title);
    await waitFor(() => expect(title).toHaveValue(projectA.title));
    expect(saveProject).not.toHaveBeenCalled();
  });
});
