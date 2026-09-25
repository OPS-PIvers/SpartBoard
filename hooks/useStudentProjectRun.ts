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
  writeStepState,
  writeWorkLink,
} from '@/utils/projectRunWrites';
import { useProjectGroupWork } from './useProjectGroupWork';

type GroupDocs = ProjectGroup[];

const groupsFrom = (docs: { id: string; data: () => unknown }[]): GroupDocs =>
  docs.map((snapshotDoc) => ({
    ...(snapshotDoc.data() as Omit<ProjectGroup, 'id'>),
    id: snapshotDoc.id,
  }));

interface UseStudentProjectRunResult {
  run: ProjectRun | null;
  /** The caller's own group, plus classmates' groups while the run shows them (D39). */
  groups: ProjectGroup[];
  /** The caller's own group, the only one they may write to. */
  myGroup: ProjectGroup | null;
  /** D40 — `private/work`, or the legacy group-doc field until it is backfilled. */
  workLinks: ProjectWorkLink[];
  /** Null until the teacher releases it — an unreleased grade is unreadable. */
  grade: ProjectGroupGrade | null;
  loading: boolean;
  error: string | null;
  setStepState: (stepId: string, state: ProjectStepState) => Promise<void>;
  addWorkLink: (link: ProjectWorkLink) => Promise<void>;
  removeWorkLink: (link: ProjectWorkLink) => Promise<void>;
}

export function useStudentProjectRun(
  runId: string | null,
  uid: string | null,
  classIds: readonly string[]
): UseStudentProjectRunResult {
  const [run, setRun] = useState<ProjectRun | null>(null);
  const [ownGroups, setOwnGroups] = useState<GroupDocs>([]);
  const [peerGroups, setPeerGroups] = useState<GroupDocs>([]);
  const [grade, setGrade] = useState<ProjectGroupGrade | null>(null);
  const [loading, setLoading] = useState(Boolean(runId));
  const [error, setError] = useState<string | null>(null);

  const [previousRunId, setPreviousRunId] = useState(runId);
  if (previousRunId !== runId) {
    setPreviousRunId(runId);
    setRun(null);
    setOwnGroups([]);
    setPeerGroups([]);
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

  // D39 — the read rule admits a member, or a classmate only while `peerVisible`
  // is on, so each query below matches exactly one of those shapes.
  useEffect(() => {
    if (!runId || !uid) return undefined;
    return onSnapshot(
      query(
        collection(db, RUNS_COLLECTION, runId, 'groups'),
        where('memberUids', 'array-contains', uid)
      ),
      (snapshot) => setOwnGroups(groupsFrom(snapshot.docs)),
      (snapshotError) => {
        logError('useStudentProjectRun.ownGroup', snapshotError, { runId });
        setError('Group progress could not be loaded.');
      }
    );
  }, [runId, uid]);

  const classIdsKey = useMemo(
    () => Array.from(new Set(classIds)).sort().slice(0, 30).join('|'),
    [classIds]
  );
  const showPeers = run?.showStatusToStudents === true;

  useEffect(() => {
    if (!runId || !classIdsKey || !showPeers) return undefined;
    return onSnapshot(
      query(
        collection(db, RUNS_COLLECTION, runId, 'groups'),
        where('classId', 'in', classIdsKey.split('|')),
        where('peerVisible', '==', true)
      ),
      (snapshot) => setPeerGroups(groupsFrom(snapshot.docs)),
      // Peers are optional context; losing them never blocks the student's own group.
      (snapshotError) => {
        logError('useStudentProjectRun.peerGroups', snapshotError, { runId });
        setPeerGroups([]);
      }
    );
  }, [classIdsKey, runId, showPeers]);

  const groups = useMemo(() => {
    const byId = new Map<string, ProjectGroup>();
    if (showPeers) for (const group of peerGroups) byId.set(group.id, group);
    for (const group of ownGroups) byId.set(group.id, group);
    return Array.from(byId.values());
  }, [ownGroups, peerGroups, showPeers]);

  const myGroup = useMemo(
    () =>
      uid ? (ownGroups.find((g) => g.memberUids?.includes(uid)) ?? null) : null,
    [ownGroups, uid]
  );
  const myGroupId = myGroup?.id ?? null;
  const work = useProjectGroupWork(runId, myGroupId, myGroup?.workLinks);

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

  const legacySeed = work.legacySeed;

  const addWorkLink = useCallback(
    async (link: ProjectWorkLink) => {
      const target = guard();
      await writeWorkLink(
        db,
        target.runId,
        target.groupId,
        link,
        actor,
        legacySeed
      );
    },
    [actor, guard, legacySeed]
  );

  const removeWorkLink = useCallback(
    async (link: ProjectWorkLink) => {
      const target = guard();
      await removeWorkLinkWrite(
        db,
        target.runId,
        target.groupId,
        link,
        legacySeed
      );
    },
    [guard, legacySeed]
  );

  return {
    run,
    groups,
    myGroup,
    workLinks: work.workLinks,
    grade,
    loading,
    error,
    setStepState,
    addWorkLink,
    removeWorkLink,
  };
}
