import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProjectGroup, ProjectRun } from '@/types';
import { useProjectGrades } from '@/hooks/useProjectGrades';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { ProjectGrader } from './ProjectGrader';

vi.mock('@/hooks/useProjectGrades');
vi.mock('@/hooks/useAssignmentPseudonyms', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useAssignmentPseudonyms')
  >('@/hooks/useAssignmentPseudonyms');
  return { ...actual, useAssignmentPseudonymsMulti: vi.fn() };
});
vi.mock(
  '@/components/widgets/QuizWidget/components/RubricScoringPanel',
  () => ({
    RubricScoringPanel: () => <div data-testid="rubric-panel" />,
  })
);

const saveGrade = vi.fn().mockResolvedValue(undefined);

const run: ProjectRun = {
  id: 'teacher-1_project-1',
  projectId: 'project-1',
  teacherUid: 'teacher-1',
  title: 'Ecosystem poster',
  steps: [],
  rubric: {
    id: 'rubric-1',
    title: 'Poster rubric',
    criteria: [],
    createdAt: 1,
    updatedAt: 1,
  },
  rubricMaxPoints: 20,
  classIds: ['class-a'],
  approvalStepIds: [],
  showStatusToStudents: true,
  acceptingUpdates: true,
  updatedAt: 1,
};

const group: ProjectGroup = {
  id: 'g1',
  name: 'Group 1',
  classId: 'class-a',
  memberUids: ['student-1'],
  order: 0,
  stepStates: {},
  workLinks: [],
  updatedAt: 1,
};

describe('ProjectGrader — individual score overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveGrade.mockResolvedValue(undefined);
    (useProjectGrades as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      gradesByGroupId: {},
      loading: false,
      saveGrade,
    });
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      byStudentUid: new Map([
        ['student-1', { givenName: 'Ada', familyName: 'Lovelace' }],
      ]),
    });
  });

  const setOverridePoints = (value: string) => {
    const input = screen.getByLabelText('Points for Ada Lovelace');
    fireEvent.change(input, { target: { value } });
  };

  it('clamps an override above the rubric max before saving', async () => {
    render(
      <ProjectGrader
        run={run}
        groups={[group]}
        orgId="org-1"
        onClose={vi.fn()}
      />
    );

    setOverridePoints('999');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveGrade).toHaveBeenCalledTimes(1));
    const [grade] = saveGrade.mock.calls[0] as [
      {
        overridesByUid?: Record<string, { points: number }>;
      },
    ];
    expect(grade.overridesByUid?.['student-1'].points).toBe(20);
  });

  it('clamps a negative override to zero before saving', async () => {
    render(
      <ProjectGrader
        run={run}
        groups={[group]}
        orgId="org-1"
        onClose={vi.fn()}
      />
    );

    setOverridePoints('-5');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveGrade).toHaveBeenCalledTimes(1));
    const [grade] = saveGrade.mock.calls[0] as [
      {
        overridesByUid?: Record<string, { points: number }>;
      },
    ];
    expect(grade.overridesByUid?.['student-1'].points).toBe(0);
  });
});
