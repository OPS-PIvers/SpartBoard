// R3 — the grader now wears the quiz free-response grader's chrome: a queue rail, autosave on advance.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import type { ProjectGroup, ProjectGroupGrade, ProjectRun } from '@/types';
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
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));
vi.mock(
  '@/components/widgets/QuizWidget/components/RubricScoringPanel',
  () => ({
    RubricScoringPanel: ({
      onChange,
    }: {
      onChange: (scores: unknown[], points: number) => void;
    }) => (
      <button type="button" onClick={() => onChange([{ id: 'c1' }], 12)}>
        Score it
      </button>
    ),
  })
);

const saveGrade = vi.fn().mockResolvedValue(undefined);

const run = (overrides: Partial<ProjectRun> = {}): ProjectRun =>
  ({
    id: 'teacher-1_project-1',
    projectId: 'project-1',
    teacherUid: 'teacher-1',
    title: 'Ecosystem poster',
    steps: [],
    rubric: { id: 'rubric-1', title: 'Poster rubric', criteria: [] },
    rubricMaxPoints: 20,
    classIds: ['class-a'],
    approvalStepIds: [],
    showStatusToStudents: true,
    acceptingUpdates: true,
    updatedAt: 1,
    ...overrides,
  }) as ProjectRun;

const group = (id: string, name: string, order: number): ProjectGroup =>
  ({
    id,
    name,
    classId: 'class-a',
    memberUids: [],
    order,
    stepStates: {},
    workLinks: [],
    updatedAt: 1,
  }) as ProjectGroup;

const groups = [group('g1', 'Group 1', 0), group('g2', 'Group 2', 1)];

const mockGrades = (gradesByGroupId: Record<string, ProjectGroupGrade>) =>
  (useProjectGrades as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    gradesByGroupId,
    loading: false,
    saveGrade,
  });

const renderGrader = (
  props: Partial<{ run: ProjectRun; groups: ProjectGroup[] }> = {}
) =>
  render(
    <ProjectGrader
      run={props.run ?? run()}
      groups={props.groups ?? groups}
      orgId="org-1"
      onClose={vi.fn()}
    />
  );

const queue = () => screen.getByRole('navigation', { name: 'Group queue' });

describe('ProjectGrader — the queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveGrade.mockResolvedValue(undefined);
    mockGrades({});
    (
      useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({ byStudentUid: new Map() });
  });

  it('lists every group with its grading state', () => {
    mockGrades({
      g1: { groupId: 'g1', released: true } as ProjectGroupGrade,
    });
    renderGrader();
    expect(within(queue()).getByText('Released')).toBeInTheDocument();
    expect(within(queue()).getByText('To do')).toBeInTheDocument();
  });

  it('jumps straight to a group picked from the rail', () => {
    renderGrader();
    fireEvent.click(within(queue()).getByText('Group 2'));
    expect(
      screen.getByText('Group 2 of 2', { exact: false })
    ).toBeInTheDocument();
  });

  it('autosaves the open group when advancing', async () => {
    renderGrader();
    fireEvent.click(screen.getByRole('button', { name: 'Score it' }));
    fireEvent.click(screen.getByRole('button', { name: /Save and next/ }));

    await waitFor(() => expect(saveGrade).toHaveBeenCalledOnce());
    expect(saveGrade.mock.calls[0][0]).toMatchObject({
      groupId: 'g1',
      points: 12,
    });
  });

  // Skip is the "come back to this one" escape hatch; it must not write.
  it('leaves an unsaved draft behind when skipping', () => {
    renderGrader();
    fireEvent.click(screen.getByRole('button', { name: 'Score it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(saveGrade).not.toHaveBeenCalled();
  });

  it('calls the whole queue done once every group is graded', () => {
    mockGrades({
      g1: { groupId: 'g1' } as ProjectGroupGrade,
      g2: { groupId: 'g2' } as ProjectGroupGrade,
    });
    renderGrader();
    expect(screen.getByText('All graded')).toBeInTheDocument();
  });

  it('asks for a rubric instead of showing an unusable queue', () => {
    renderGrader({ run: run({ rubric: undefined }) });
    expect(screen.getByText(/Attach a rubric/)).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Group queue' })
    ).toBeNull();
  });

  it('asks for groups instead of showing an empty queue', () => {
    renderGrader({ groups: [] });
    expect(
      screen.getByText(/Import groups before grading/)
    ).toBeInTheDocument();
  });
});
