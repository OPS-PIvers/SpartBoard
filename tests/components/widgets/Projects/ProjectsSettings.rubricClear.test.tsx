// Regression: picking "No rubric" in ProjectsSettings must deleteField() the run's stale rubric, not just omit it from the updateRun payload.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectsSettings } from '@/components/widgets/Projects/Settings';
import type {
  ProjectDefinition,
  ProjectRun,
  ProjectsConfig,
  Rubric,
  WidgetData,
} from '@/types';

const updateRunMock = vi.fn().mockResolvedValue(undefined);
const saveProjectMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: [],
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    orgId: undefined,
    featurePermissions: [],
    selectedBuildings: [],
  }),
}));

vi.mock('@/hooks/useProjectsWidgetSettings', () => ({
  useProjectsWidgetSettings: () => ({ enabled: true }),
}));

vi.mock('@/hooks/useProjectsBuildingDefaults', () => ({
  useProjectsBuildingDefaults: () => ({ buildingId: undefined }),
}));

vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: () => undefined,
}));

const rubric: Rubric = {
  id: 'rubric-1',
  title: 'Test Rubric',
  criteria: [],
  createdAt: 0,
  updatedAt: 0,
};

const project: ProjectDefinition = {
  id: 'project-1',
  title: 'Test Project',
  steps: [],
  rubric,
  rubricMaxPoints: 10,
  createdAt: 0,
  updatedAt: 0,
};

vi.mock('@/hooks/useProjectLibrary', () => ({
  useProjectLibrary: () => ({
    projects: [project],
    saveProject: saveProjectMock,
  }),
}));

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ rubrics: [rubric] }),
}));

const run: ProjectRun = {
  id: 'run-1',
  projectId: 'project-1',
  teacherUid: 'teacher-1',
  title: 'Test Project',
  steps: [],
  rubric,
  rubricMaxPoints: 10,
  classIds: [],
  approvalStepIds: [],
  showStatusToStudents: true,
  acceptingUpdates: true,
  updatedAt: 0,
};

vi.mock('@/hooks/useProjectRun', () => ({
  useProjectRun: () => ({
    run,
    groups: [],
    ensureRun: vi.fn(),
    updateRun: updateRunMock,
    importGroups: vi.fn(),
  }),
}));

describe('ProjectsSettings — clearing the rubric', () => {
  beforeEach(() => {
    updateRunMock.mockClear();
    saveProjectMock.mockClear();
  });

  it('deleteField()s rubric/rubricMaxPoints on the run when "No rubric" is picked', async () => {
    const widget = {
      id: 'w1',
      type: 'projects',
      config: { projectId: 'project-1' } as ProjectsConfig,
    } as unknown as WidgetData;

    render(<ProjectsSettings widget={widget} />);

    const select = screen.getByLabelText('Rubric');
    fireEvent.change(select, { target: { value: '' } });

    await waitFor(() => expect(updateRunMock).toHaveBeenCalledTimes(1));
    const [updates, clearFields] = updateRunMock.mock.calls[0] as [
      Partial<ProjectRun>,
      (keyof ProjectRun)[] | undefined,
    ];
    expect(updates.rubric).toBeUndefined();
    expect(clearFields).toEqual(
      expect.arrayContaining(['rubric', 'rubricMaxPoints'])
    );
  });
});
