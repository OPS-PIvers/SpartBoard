/** Live view of one project run and its groups, plus the writes against them (D13). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type {
  ProjectDefinition,
  ProjectGroup,
  ProjectGroupImportEntry,
  ProjectRun,
  ProjectStepState,
  ProjectWorkLink,
} from '@/types';
import { logError } from '@/utils/logError';
import { approvalStepIdsFrom } from '@/components/widgets/Projects/projectSteps';
import {
  RUNS_COLLECTION,
  removeWorkLinkWrite,
  runIdFor,
  writeNeedsSupport,
  writeStepState,
  writeWorkLink,
} from '@/utils/projectRunWrites';

export { RUNS_COLLECTION, runIdFor };

interface CommitProjectGroupsResult {
  groupsWritten: number;
  groupsCreated: number;
  membersResolved: number;
  classIds: string[];
}

interface UseProjectRunResult {
  run: ProjectRun | null;
  groups: ProjectGroup[];
  loading: boolean;
  error: string | null;
  ensureRun: (
    project: ProjectDefinition,
    seed?: { showStatusToStudents?: boolean }
  ) => Promise<ProjectRun>;
  setStepState: (
    groupId: string,
    stepId: string,
    state: ProjectStepState,
    actorRole: 'student' | 'teacher'
  ) => Promise<void>;
  setNeedsSupport: (
    groupId: string,
    needsSupport: boolean,
    actorRole: 'student' | 'teacher'
  ) => Promise<void>;
  addWorkLink: (
    groupId: string,
    link: ProjectWorkLink,
    actorRole: 'student' | 'teacher'
  ) => Promise<void>;
  removeWorkLink: (groupId: string, link: ProjectWorkLink) => Promise<void>;
  updateRun: (updates: Partial<ProjectRun>) => Promise<void>;
  importGroups: (
    groups: ProjectGroupImportEntry[]
  ) => Promise<CommitProjectGroupsResult>;
}

export function useProjectRun(
  teacherUid: string | undefined,
  projectId: string | undefined,
  actorUid: string | undefined
): UseProjectRunResult {
  const runId = useMemo(
    () => (teacherUid && projectId ? runIdFor(teacherUid, projectId) : null),
    [teacherUid, projectId]
  );

  const [run, setRun] = useState<ProjectRun | null>(null);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(Boolean(runId));
  const [error, setError] = useState<string | null>(null);

  const [previousRunId, setPreviousRunId] = useState(runId);
  if (previousRunId !== runId) {
    setPreviousRunId(runId);
    setRun(null);
    setGroups([]);
    setLoading(Boolean(runId));
    setError(null);
  }

  useEffect(() => {
    if (!runId) return undefined;
    return onSnapshot(
      doc(db, RUNS_COLLECTION, runId),
      (snapshot) => {
        setRun(
          snapshot.exists()
            ? ({ ...snapshot.data(), id: snapshot.id } as ProjectRun)
            : null
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logError('useProjectRun.run', snapshotError, { runId });
        setError('This project could not be loaded.');
        setLoading(false);
      }
    );
  }, [runId]);

  useEffect(() => {
    if (!runId) return undefined;
    return onSnapshot(
      collection(db, RUNS_COLLECTION, runId, 'groups'),
      (snapshot) =>
        setGroups(
          snapshot.docs.map((snapshotDoc) => ({
            ...(snapshotDoc.data() as Omit<ProjectGroup, 'id'>),
            id: snapshotDoc.id,
          }))
        ),
      (snapshotError) => {
        logError('useProjectRun.groups', snapshotError, { runId });
        setError('Group progress could not be loaded.');
      }
    );
  }, [runId]);

  const ensureRun = useCallback(
    async (
      project: ProjectDefinition,
      seed?: { showStatusToStudents?: boolean }
    ): Promise<ProjectRun> => {
      if (!teacherUid) throw new Error('Sign in to start a project.');
      const id = runIdFor(teacherUid, project.id);
      const next: ProjectRun = {
        id,
        projectId: project.id,
        teacherUid,
        title: project.title,
        steps: project.steps,
        classIds: run?.classIds ?? [],
        approvalStepIds: approvalStepIdsFrom(project.steps),
        // D30 — an existing run keeps its value; a new one takes the building default.
        showStatusToStudents:
          run?.showStatusToStudents ?? seed?.showStatusToStudents ?? true,
        acceptingUpdates: run?.acceptingUpdates ?? true,
        updatedAt: Date.now(),
      };
      if (project.rubric) next.rubric = project.rubric;
      if (project.rubricMaxPoints !== undefined) {
        next.rubricMaxPoints = project.rubricMaxPoints;
      }
      if (project.dueAt !== undefined) next.dueAt = project.dueAt;

      // `next` only ADDS these optional fields when the definition still has
      // them, so with `merge: true` a removed rubric/due date is otherwise
      // never cleared off an already-launched run (D "editable after
      // launch") — deleteField() the key instead when the live run still
      // carries a value the definition no longer does.
      const payload: Record<string, unknown> = { ...next };
      if (!project.rubric && run?.rubric) payload.rubric = deleteField();
      if (
        project.rubricMaxPoints === undefined &&
        run?.rubricMaxPoints !== undefined
      ) {
        payload.rubricMaxPoints = deleteField();
      }
      if (project.dueAt === undefined && run?.dueAt !== undefined) {
        payload.dueAt = deleteField();
      }
      await setDoc(doc(db, RUNS_COLLECTION, id), payload, { merge: true });
      return next;
    },
    [
      run?.acceptingUpdates,
      run?.classIds,
      run?.dueAt,
      run?.rubric,
      run?.rubricMaxPoints,
      run?.showStatusToStudents,
      teacherUid,
    ]
  );

  const setStepState = useCallback(
    async (
      groupId: string,
      stepId: string,
      state: ProjectStepState,
      actorRole: 'student' | 'teacher'
    ) => {
      if (!runId) throw new Error('No project is running.');
      const from = groups.find((g) => g.id === groupId)?.stepStates?.[stepId];
      await writeStepState(
        db,
        runId,
        groupId,
        stepId,
        state,
        { uid: actorUid, role: actorRole },
        from
      );
    },
    [actorUid, groups, runId]
  );

  const setNeedsSupport = useCallback(
    async (
      groupId: string,
      needsSupport: boolean,
      actorRole: 'student' | 'teacher'
    ) => {
      if (!runId) throw new Error('No project is running.');
      await writeNeedsSupport(db, runId, groupId, needsSupport, {
        uid: actorUid,
        role: actorRole,
      });
    },
    [actorUid, runId]
  );

  const addWorkLink = useCallback(
    async (
      groupId: string,
      link: ProjectWorkLink,
      actorRole: 'student' | 'teacher'
    ) => {
      if (!runId) throw new Error('No project is running.');
      await writeWorkLink(db, runId, groupId, link, {
        uid: actorUid,
        role: actorRole,
      });
    },
    [actorUid, runId]
  );

  const removeWorkLink = useCallback(
    async (groupId: string, link: ProjectWorkLink) => {
      if (!runId) throw new Error('No project is running.');
      await removeWorkLinkWrite(db, runId, groupId, link);
    },
    [runId]
  );

  const updateRun = useCallback(
    async (updates: Partial<ProjectRun>) => {
      if (!runId) throw new Error('No project is running.');
      await updateDoc(doc(db, RUNS_COLLECTION, runId), {
        ...updates,
        updatedAt: Date.now(),
      });
    },
    [runId]
  );

  const importGroups = useCallback(
    async (entries: ProjectGroupImportEntry[]) => {
      if (!runId) throw new Error('No project is running.');
      const callable = httpsCallable<
        { runId: string; groups: ProjectGroupImportEntry[] },
        CommitProjectGroupsResult
      >(functions, 'commitProjectGroupsV1');
      const result = await callable({ runId, groups: entries });
      return result.data;
    },
    [runId]
  );

  return {
    run,
    groups,
    loading,
    error,
    ensureRun,
    setStepState,
    setNeedsSupport,
    addWorkLink,
    removeWorkLink,
    updateRun,
    importGroups,
  };
}
