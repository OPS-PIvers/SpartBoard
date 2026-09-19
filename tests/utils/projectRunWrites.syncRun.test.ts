// Regression: clearing a project's rubric must deleteField() the run's stale copy, not just omit it from the payload.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectDefinition, ProjectRun, Rubric } from '@/types';

const updateDocMock = vi.fn().mockResolvedValue(undefined);
const DELETE_SENTINEL = { __delete: true };

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteField: () => DELETE_SENTINEL,
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  updateDoc: (...args: unknown[]): Promise<void> => {
    updateDocMock(...args);
    return Promise.resolve();
  },
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const { syncRunFromProject } = await import('@/utils/projectRunWrites');

const rubric: Rubric = {
  id: 'rubric-1',
  title: 'Poster rubric',
  criteria: [
    {
      id: 'c1',
      title: 'Evidence',
      levels: [
        { id: 'l1', label: 'Meets', points: 4 },
        { id: 'l2', label: 'Approaching', points: 2 },
      ],
    },
  ],
} as unknown as Rubric;

const run = (overrides: Partial<ProjectRun> = {}): ProjectRun =>
  ({
    id: 'teacher-1_project-1',
    projectId: 'project-1',
    teacherUid: 'teacher-1',
    title: 'Ecosystem poster',
    steps: [{ id: 'step-1', title: 'Research' }],
    classIds: ['class-a'],
    approvalStepIds: [],
    showStatusToStudents: true,
    acceptingUpdates: true,
    updatedAt: 1,
    ...overrides,
  }) as ProjectRun;

const project = (
  overrides: Partial<ProjectDefinition> = {}
): ProjectDefinition =>
  ({
    id: 'project-1',
    title: 'Ecosystem poster',
    steps: [{ id: 'step-1', title: 'Research' }],
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }) as ProjectDefinition;

const payload = (): Record<string, unknown> =>
  updateDocMock.mock.calls[0][1] as Record<string, unknown>;

describe('syncRunFromProject', () => {
  beforeEach(() => updateDocMock.mockClear());

  it('deleteField()s the rubric when the project no longer has one', async () => {
    await syncRunFromProject(
      {} as never,
      run({ rubric, rubricMaxPoints: 4 }),
      project()
    );
    expect(payload().rubric).toBe(DELETE_SENTINEL);
    expect(payload().rubricMaxPoints).toBe(DELETE_SENTINEL);
  });

  it('writes the rubric snapshot and its max when the project has one', async () => {
    await syncRunFromProject(
      {} as never,
      run(),
      project({ rubric, rubricMaxPoints: 4 })
    );
    expect(payload().rubric).toEqual(rubric);
    expect(payload().rubricMaxPoints).toBe(4);
  });

  it('leaves the rubric key out entirely when neither side has one', async () => {
    await syncRunFromProject({} as never, run(), project());
    expect('rubric' in payload()).toBe(false);
    expect('rubricMaxPoints' in payload()).toBe(false);
  });

  it('deleteField()s a due date the teacher removed', async () => {
    await syncRunFromProject({} as never, run({ dueAt: 123 }), project());
    expect(payload().dueAt).toBe(DELETE_SENTINEL);
  });

  it('re-denormalizes approvalStepIds off the edited steps', async () => {
    await syncRunFromProject(
      {} as never,
      run(),
      project({
        steps: [
          { id: 'step-1', title: 'Research' },
          { id: 'step-2', title: 'Draft', requiresApproval: true },
        ],
      })
    );
    expect(payload().approvalStepIds).toEqual(['step-2']);
  });
});
