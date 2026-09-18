/**
 * Live view of one project run and its groups (D13), plus the writes both the
 * board face and the student page make.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
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
  ProjectGroupEvent,
  ProjectGroupImportEntry,
  ProjectRun,
  ProjectStepState,
  ProjectWorkLink,
} from '@/types';
import { logError } from '@/utils/logError';
import { approvalStepIdsFrom } from '@/components/widgets/Projects/projectSteps';

export const RUNS_COLLECTION = 'project_runs';

/** D13 — exactly one run per project, so the id is derivable, not stored. */
export const runIdFor = (teacherUid: string, projectId: string): string =>
  `${teacherUid}_${projectId}`;

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
  ensureRun: (project: ProjectDefinition) => Promise<ProjectRun>;
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

  /**
   * The event log is append-only and read by the teacher alone (D24). A failed
   * entry must never roll back the change it describes, so it logs and moves on.
   */
  const logEvent = useCallback(
    async (
      groupId: string,
      event: Omit<ProjectGroupEvent, 'id' | 'at' | 'actorUid'>
    ) => {
      if (!runId || !actorUid) return;
      try {
        await addDoc(
          collection(db, RUNS_COLLECTION, runId, 'groups', groupId, 'events'),
          { ...event, at: Date.now(), actorUid }
        );
      } catch (eventError) {
        logError('useProjectRun.logEvent', eventError, { runId, groupId });
      }
    },
    [actorUid, runId]
  );

  const ensureRun = useCallback(
    async (project: ProjectDefinition): Promise<ProjectRun> => {
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
        showStatusToStudents: run?.showStatusToStudents ?? true,
        acceptingUpdates: run?.acceptingUpdates ?? true,
        updatedAt: Date.now(),
      };
      if (project.rubric) next.rubric = project.rubric;
      if (project.rubricMaxPoints !== undefined) {
        next.rubricMaxPoints = project.rubricMaxPoints;
      }
      if (project.dueAt !== undefined) next.dueAt = project.dueAt;
      await setDoc(doc(db, RUNS_COLLECTION, id), next, { merge: true });
      return next;
    },
    [
      run?.acceptingUpdates,
      run?.classIds,
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
      await updateDoc(doc(db, RUNS_COLLECTION, runId, 'groups', groupId), {
        [`stepStates.${stepId}`]: state,
        // The rules check this claim against the real diff, which is what makes
        // the per-step approval ceiling enforceable — see `pjStudentStepWrite`.
        lastStepChange: { stepId, at: Date.now() },
        updatedAt: Date.now(),
      });
      await logEvent(groupId, {
        actorRole,
        kind: 'stepState',
        stepId,
        ...(from ? { from } : {}),
        to: state,
      });
    },
    [groups, logEvent, runId]
  );

  const setNeedsSupport = useCallback(
    async (
      groupId: string,
      needsSupport: boolean,
      actorRole: 'student' | 'teacher'
    ) => {
      if (!runId) throw new Error('No project is running.');
      await updateDoc(doc(db, RUNS_COLLECTION, runId, 'groups', groupId), {
        needsSupport,
        updatedAt: Date.now(),
      });
      await logEvent(groupId, {
        actorRole,
        kind: 'needsSupport',
        detail: needsSupport ? 'raised' : 'cleared',
      });
    },
    [logEvent, runId]
  );

  const addWorkLink = useCallback(
    async (
      groupId: string,
      link: ProjectWorkLink,
      actorRole: 'student' | 'teacher'
    ) => {
      if (!runId) throw new Error('No project is running.');
      await updateDoc(doc(db, RUNS_COLLECTION, runId, 'groups', groupId), {
        workLinks: arrayUnion(link),
        updatedAt: Date.now(),
      });
      await logEvent(groupId, {
        actorRole,
        kind: 'workLink',
        ...(link.stepId ? { stepId: link.stepId } : {}),
        detail: link.url,
      });
    },
    [logEvent, runId]
  );

  const removeWorkLink = useCallback(
    async (groupId: string, link: ProjectWorkLink) => {
      if (!runId) throw new Error('No project is running.');
      await updateDoc(doc(db, RUNS_COLLECTION, runId, 'groups', groupId), {
        workLinks: arrayRemove(link),
        updatedAt: Date.now(),
      });
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
