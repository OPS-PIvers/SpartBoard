/** One run's grades (A2), kept off the group docs so an unreleased score is unreadable. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ProjectGroupGrade } from '@/types';
import { logError } from '@/utils/logError';
import { RUNS_COLLECTION } from '@/utils/projectRunWrites';

type Overrides = NonNullable<ProjectGroupGrade['overridesByUid']>;

interface UseProjectGradesResult {
  gradesByGroupId: Record<string, ProjectGroupGrade>;
  loading: boolean;
  error: string | null;
  saveGrade: (grade: ProjectGroupGrade) => Promise<void>;
}

const overridesCol = (runId: string, groupId: string) =>
  collection(db, RUNS_COLLECTION, runId, 'grades', groupId, 'overrides');

/** Moves a legacy `overridesByUid` map into per-member docs, so members never read each other's. */
async function migrateLegacyOverrides(
  runId: string,
  groupId: string,
  legacy: Overrides
): Promise<void> {
  const batch = writeBatch(db);
  for (const [uid, value] of Object.entries(legacy)) {
    batch.set(doc(overridesCol(runId, groupId), uid), value);
  }
  batch.update(doc(db, RUNS_COLLECTION, runId, 'grades', groupId), {
    overridesByUid: deleteField(),
  });
  await batch.commit();
}

export function useProjectGrades(
  runId: string | null | undefined
): UseProjectGradesResult {
  const [grades, setGrades] = useState<ProjectGroupGrade[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Overrides>>({});
  const [loading, setLoading] = useState(Boolean(runId));
  const [error, setError] = useState<string | null>(null);
  const migrating = useRef(new Set<string>());

  const [previousRunId, setPreviousRunId] = useState(runId);
  if (previousRunId !== runId) {
    setPreviousRunId(runId);
    setGrades([]);
    setOverrides({});
    setLoading(Boolean(runId));
    setError(null);
  }

  useEffect(() => {
    if (!runId) return undefined;
    return onSnapshot(
      collection(db, RUNS_COLLECTION, runId, 'grades'),
      (snapshot) => {
        const next = snapshot.docs.map((snapshotDoc) => ({
          ...(snapshotDoc.data() as Omit<ProjectGroupGrade, 'groupId'>),
          groupId: snapshotDoc.id,
        }));
        setGrades(next);
        setError(null);
        setLoading(false);
        for (const grade of next) {
          const legacy = grade.overridesByUid;
          if (!legacy || migrating.current.has(grade.groupId)) continue;
          migrating.current.add(grade.groupId);
          migrateLegacyOverrides(runId, grade.groupId, legacy)
            .catch((err: unknown) =>
              logError('useProjectGrades.migrate', err, { runId })
            )
            .finally(() => migrating.current.delete(grade.groupId));
        }
      },
      (snapshotError) => {
        logError('useProjectGrades.subscribe', snapshotError, { runId });
        setError('Grades could not be loaded.');
        setLoading(false);
      }
    );
  }, [runId]);

  const groupIdsKey = grades.map((g) => g.groupId).join('\n');
  useEffect(() => {
    if (!runId || !groupIdsKey) return undefined;
    const unsubs = groupIdsKey.split('\n').map((groupId) =>
      onSnapshot(
        overridesCol(runId, groupId),
        (snapshot) => {
          const map: Overrides = {};
          for (const d of snapshot.docs) {
            map[d.id] = d.data() as Overrides[string];
          }
          setOverrides((current) => ({ ...current, [groupId]: map }));
        },
        (err) => logError('useProjectGrades.overrides', err, { runId })
      )
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [runId, groupIdsKey]);

  const gradesByGroupId = useMemo(() => {
    const map: Record<string, ProjectGroupGrade> = {};
    for (const grade of grades) {
      const merged = { ...grade.overridesByUid, ...overrides[grade.groupId] };
      const rest: ProjectGroupGrade = { ...grade };
      delete rest.overridesByUid;
      map[grade.groupId] =
        Object.keys(merged).length > 0
          ? { ...rest, overridesByUid: merged }
          : rest;
    }
    return map;
  }, [grades, overrides]);

  const saveGrade = useCallback(
    async (grade: ProjectGroupGrade) => {
      if (!runId) throw new Error('No project is running.');
      const wanted = grade.overridesByUid ?? {};
      const shared: ProjectGroupGrade = { ...grade };
      delete shared.overridesByUid;
      const batch = writeBatch(db);
      // The shared doc holds no per-member fields; each member's override is its own doc.
      batch.set(
        doc(db, RUNS_COLLECTION, runId, 'grades', grade.groupId),
        shared
      );
      const col = overridesCol(runId, grade.groupId);
      const stored = gradesByGroupId[grade.groupId]?.overridesByUid ?? {};
      for (const uid of Object.keys(stored)) {
        if (!(uid in wanted)) batch.delete(doc(col, uid));
      }
      for (const [uid, value] of Object.entries(wanted)) {
        batch.set(doc(col, uid), value);
      }
      await batch.commit();
    },
    [runId, gradesByGroupId]
  );

  return { gradesByGroupId, loading, error, saveGrade };
}
