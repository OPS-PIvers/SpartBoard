// The run seed + import toast used to live in the settings drawer (R1 moved them to the widget body).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProjectDefinition, WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { ProjectsWidget } from '@/components/widgets/Projects/Widget';

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useProjectLibrary');
vi.mock('@/hooks/useProjectRun');
vi.mock('@/hooks/useProjectsWidgetSettings');
vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: () => 'high',
}));
vi.mock('@/hooks/useProjectsBuildingDefaults', () => ({
  useProjectsBuildingDefaults: () => ({
    buildingId: 'high',
    defaultShowStatusToStudents: false,
  }),
}));

// Stands in for a library card's "Set up groups" click.
vi.mock('@/components/widgets/Projects/components/ProjectsManager', () => ({
  ProjectsManager: ({
    onSetupGroups,
  }: {
    onSetupGroups: (projectId: string) => void;
  }) => (
    <button type="button" onClick={() => onSetupGroups('project-a')}>
      Set up groups
    </button>
  ),
}));

const projectA: ProjectDefinition = {
  id: 'project-a',
  title: 'Ecosystem poster',
  steps: [{ id: 'step-1', title: 'Research' }],
  createdAt: 1,
  updatedAt: 1,
};

const widget = {
  id: 'projects-1',
  type: 'projects',
  x: 0,
  y: 0,
  w: 620,
  h: 560,
  z: 1,
  config: { view: 'manager' },
} as unknown as WidgetData;

const ensureRun = vi.fn().mockResolvedValue(undefined);
const importGroups = vi.fn();
const addToast = vi.fn();
const updateWidget = vi.fn();

const openSetupAndCommit = async (): Promise<void> => {
  render(<ProjectsWidget widget={widget} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up groups' }));
  fireEvent.change(await screen.findByLabelText('How many groups?'), {
    target: { value: '2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add 2 groups' }));
};

describe('Projects — setting up groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importGroups.mockResolvedValue({ groupsWritten: 2, membersResolved: 4 });
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      orgId: 'orono',
    });
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast,
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
    (
      useProjectsWidgetSettings as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ enabled: true });
    (useProjectLibrary as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      projects: [projectA],
    });
    (useProjectRun as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      run: null,
      groups: [],
      ensureRun,
      importGroups,
    });
  });

  it('seeds a new run from the building default the admin set (D30)', async () => {
    await openSetupAndCommit();
    await waitFor(() =>
      expect(ensureRun).toHaveBeenCalledWith(projectA, {
        showStatusToStudents: false,
      })
    );
  });

  it('opens the board on the project it just set up', async () => {
    await openSetupAndCommit();
    await waitFor(() =>
      expect(updateWidget).toHaveBeenCalledWith('projects-1', {
        config: expect.objectContaining({
          view: 'board',
          projectId: 'project-a',
        }) as object,
      })
    );
  });

  it('calls a hand-built roster import a tracker rather than reporting no students', async () => {
    importGroups.mockResolvedValue({ groupsWritten: 11, membersResolved: 0 });
    await openSetupAndCommit();

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    const [message, tone] = addToast.mock.calls.at(-1) as [string, string];
    expect(message).toContain('11 groups');
    // "0 students" reads as a failed import; it is a working teacher-only tracker.
    expect(message).not.toContain('0 students');
    expect(message).toContain('tracker you move yourself');
    expect(tone).toBe('info');
  });
});
