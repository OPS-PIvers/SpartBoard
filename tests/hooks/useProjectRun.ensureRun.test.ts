/**
 * Regression test for `useProjectRun.ensureRun` failing to clear a rubric
 * (or due date) that was removed from the project definition.
 *
 * Bug: `ensureRun` only ever ADDS `rubric`/`rubricMaxPoints`/`dueAt` to the
 * `setDoc(..., { merge: true })` payload when the incoming `project` still
 * has them (`if (project.rubric) next.rubric = project.rubric;`). When a
 * teacher removes a rubric from an already-launched project (PROJECTS_WIDGET
 * D "editable after launch") and `ensureRun` runs again (e.g. importing more
 * groups later in the term), the key is simply absent from the payload —
 * `merge: true` then leaves whatever rubric the run doc already had in
 * place instead of clearing it. The grader keeps scoring against a rubric
 * the teacher deleted.
 *
 * Fix: explicitly `deleteField()` the key when the project no longer
 * carries it but the live run still does, mirroring the established
 * `deleteField()`-on-explicit-clear pattern used for `plc` in
 * `useQuizAssignments.updateAssignmentSettings`.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useProjectRun } from '@/hooks/useProjectRun';
import type { ProjectDefinition } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteFieldSentinel: true })),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;

const TEACHER_UID = 'teacher-1';
const PROJECT_ID = 'proj-1';
const RUN_ID = `${TEACHER_UID}_${PROJECT_ID}`;

const baseProject: ProjectDefinition = {
  id: PROJECT_ID,
  title: 'Ecosystem project',
  steps: [{ id: 'step-1', title: 'Research' }],
  createdAt: 0,
  updatedAt: 0,
};

const rubric = {
  id: 'rubric-1',
  title: 'Ecosystem rubric',
  criteria: [
    {
      id: 'c1',
      name: 'Content',
      levels: [{ id: 'l1', label: 'Good', points: 4 }],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

describe('useProjectRun — ensureRun clearing an already-imported rubric/dueAt', () => {
  let runDocListener: ((snapshot: unknown) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    runDocListener = undefined;
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockOnSnapshot.mockImplementation(
      (ref: string, onNext: (snapshot: unknown) => void) => {
        if (ref === `project_runs/${RUN_ID}`) runDocListener = onNext;
        return () => undefined;
      }
    );
    mockSetDoc.mockResolvedValue(undefined);
  });

  it('does not clear rubric/rubricMaxPoints/dueAt on the first launch (nothing to clear)', async () => {
    const { result } = renderHook(() =>
      useProjectRun(TEACHER_UID, PROJECT_ID, TEACHER_UID)
    );

    await act(async () => {
      await result.current.ensureRun(baseProject);
    });

    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.rubric).toBeUndefined();
    expect(payload.rubricMaxPoints).toBeUndefined();
    expect(payload.dueAt).toBeUndefined();
  });

  it('clears a rubric that was removed from the project definition after launch', async () => {
    const { result } = renderHook(() =>
      useProjectRun(TEACHER_UID, PROJECT_ID, TEACHER_UID)
    );

    // Simulate the live run doc already carrying a rubric + due date from an
    // earlier `ensureRun` call (e.g. the initial group import).
    act(() => {
      runDocListener?.({
        exists: () => true,
        id: RUN_ID,
        data: () => ({
          id: RUN_ID,
          projectId: PROJECT_ID,
          teacherUid: TEACHER_UID,
          title: baseProject.title,
          steps: baseProject.steps,
          classIds: [],
          approvalStepIds: [],
          showStatusToStudents: true,
          acceptingUpdates: true,
          rubric,
          rubricMaxPoints: 4,
          dueAt: 1000,
          updatedAt: 0,
        }),
      });
    });

    // Teacher removed the rubric (and due date) from the project definition,
    // then re-imports groups, re-running `ensureRun` with the updated project.
    const projectWithoutRubric: ProjectDefinition = { ...baseProject };

    await act(async () => {
      await result.current.ensureRun(projectWithoutRubric);
    });

    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    // BUG (pre-fix): these keys are simply absent, so `merge: true` leaves
    // the stale rubric/rubricMaxPoints/dueAt in place on the run doc.
    expect(payload.rubric).toEqual({ __deleteFieldSentinel: true });
    expect(payload.rubricMaxPoints).toEqual({ __deleteFieldSentinel: true });
    expect(payload.dueAt).toEqual({ __deleteFieldSentinel: true });
  });

  it('still writes a fresh rubric normally when the project has one', async () => {
    const { result } = renderHook(() =>
      useProjectRun(TEACHER_UID, PROJECT_ID, TEACHER_UID)
    );

    const projectWithRubric: ProjectDefinition = {
      ...baseProject,
      rubric,
      rubricMaxPoints: 4,
      dueAt: 2000,
    };

    await act(async () => {
      await result.current.ensureRun(projectWithRubric);
    });

    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.rubric).toEqual(rubric);
    expect(payload.rubricMaxPoints).toBe(4);
    expect(payload.dueAt).toBe(2000);
  });
});
