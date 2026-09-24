/** The student page's view of one run (§6); separate from `useProjectRun`, which is teacher-only. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  ProjectGroup,
  ProjectGroupGrade,
  ProjectRun,
  ProjectStepState,
  ProjectWorkLink,
} from '@/types';
import { logError } from '@/utils/logError';
import {
  RUNS_COLLECTION,
  removeWorkLinkWrite,
  writeNeedsSupport,
  writeStepState,
  writeWorkLink,
} from '@/utils/projectRunWrites';

interface UseStudentProjectRunResult {
  run: ProjectRun | null;
  groups: ProjectGroup[];
  /** The caller's own group, the only one they may write to. */
  myGroup: ProjectGroup | null;
  /** Null until the teacher releases it — an unreleased grade is unreadable. */
  grade: ProjectGroupGrade | null;
  loading: boolean;
  error: string | null;
  setStepState: (stepId: string, state: ProjectStepState) => Promise<void>;
  setNeedsSupport: (needsSupport: boolean) => Promise<void>;
  addWorkLink: (link: ProjectWorkLink) => Promise<void>;
  removeWorkLink: (link: ProjectWorkLink) => Promise<void>;
}

export function useStudentProjectRun(
  runId: string | null,
  uid: string | null,
  classIds: readonly string[]
): UseStudentProjectRunResult {
  const [run, setRun] = useState<ProjectRun | null>(null);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [grade, setGrade] = useState<ProjectGroupGrade | null>(null);
  const [loading, setLoading] = useState(Boolean(runId));
  const [error, setError] = useState<string | null>(null);

  const [previousRunId, setPreviousRunId] = useState(runId);
  if (previousRunId !== runId) {
    setPreviousRunId(runId);
    setRun(null);
    setGroups([]);
    setGrade(null);
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
        logError('useStudentProjectRun.run', snapshotError, { runId });
        setError('This project could not be loaded.');
        setLoading(false);
      }
    );
  }, [runId]);

  // The group read rule gates each doc on its classId, so an unfiltered listing is always denied.
  const classIdsKey = useMemo(
    () => Array.from(new Set(classIds)).sort().slice(0, 30).join('|'),
    [classIds]
  );

  useEffect(() => {
    if (!runId || !classIdsKey) return undefined;
    return onSnapshot(
      query(
        collection(db, RUNS_COLLECTION, runId, 'groups'),
        where('classId', 'in', classIdsKey.split('|'))
      ),
      (snapshot) =>
        setGroups(
          snapshot.docs.map((snapshotDoc) => ({
            ...(snapshotDoc.data() as Omit<ProjectGroup, 'id'>),
            id: snapshotDoc.id,
          }))
        ),
      (snapshotError) => {
        logError('useStudentProjectRun.groups', snapshotError, { runId });
        setError('Group progress could not be loaded.');
      }
    );
  }, [classIdsKey, runId]);

  const myGroup = useMemo(
    () =>
      uid ? (groups.find((g) => g.memberUids?.includes(uid)) ?? null) : null,
    [groups, uid]
  );
  const myGroupId = myGroup?.id ?? null;

  // Clearing on a group change is a render-time adjustment, not an effect:
  // an effect that calls setState costs an extra render pass and would leave
  // the previous group's score on screen for one of them.
  const [previousGroupId, setPreviousGroupId] = useState(myGroupId);
  if (previousGroupId !== myGroupId) {
    setPreviousGroupId(myGroupId);
    setGrade(null);
  }

  // A2 — an unreleased grade fails the read rule rather than arriving and being
  // hidden, so a permission error here is the expected quiet case, not a fault.
  useEffect(() => {
    if (!runId || !myGroupId) return undefined;
    return onSnapshot(
      doc(db, RUNS_COLLECTION, runId, 'grades', myGroupId),
      (snapshot) =>
        setGrade(
          snapshot.exists() ? (snapshot.data() as ProjectGroupGrade) : null
        ),
      () => setGrade(null)
    );
  }, [myGroupId, runId]);

  const actor = useMemo(
    () => ({ uid: uid ?? undefined, role: 'student' as const }),
    [uid]
  );

  const guard = useCallback((): { runId: string; groupId: string } => {
    if (!runId || !myGroupId) {
      throw new Error('You are not in a group on this project.');
    }
    return { runId, groupId: myGroupId };
  }, [myGroupId, runId]);

  const setStepState = useCallback(
    async (stepId: string, state: ProjectStepState) => {
      const target = guard();
      await writeStepState(
        db,
        target.runId,
        target.groupId,
        stepId,
        state,
        actor,
        myGroup?.stepStates?.[stepId]
      );
    },
    [actor, guard, myGroup?.stepStates]
  );

  const setNeedsSupport = useCallback(
    async (needsSupport: boolean) => {
      const target = guard();
      await writeNeedsSupport(
        db,
        target.runId,
        target.groupId,
        needsSupport,
        actor
      );
    },
    [actor, guard]
  );

  const addWorkLink = useCallback(
    async (link: ProjectWorkLink) => {
      const target = guard();
      await writeWorkLink(db, target.runId, target.groupId, link, actor);
    },
    [actor, guard]
  );

  const removeWorkLink = useCallback(
    async (link: ProjectWorkLink) => {
      const target = guard();
      await removeWorkLinkWrite(db, target.runId, target.groupId, link);
    },
    [guard]
  );

  return {
    run,
    groups,
    myGroup,
    grade,
    loading,
    error,
    setStepState,
    setNeedsSupport,
    addWorkLink,
    removeWorkLink,
  };
}
