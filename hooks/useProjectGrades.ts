/**
 * One run's grades (A2). They live in `grades/{groupId}` beside the groups, not
 * on the group docs, so a member reading their own group can never read an
 * unreleased score — the read rule on this collection is what hides it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ProjectGroupGrade } from '@/types';
import { logError } from '@/utils/logError';
import { RUNS_COLLECTION } from '@/utils/projectRunWrites';

interface UseProjectGradesResult {
  gradesByGroupId: Record<string, ProjectGroupGrade>;
  loading: boolean;
  error: string | null;
  saveGrade: (grade: ProjectGroupGrade) => Promise<void>;
}

export function useProjectGrades(
  runId: string | null | undefined
): UseProjectGradesResult {
  const [grades, setGrades] = useState<ProjectGroupGrade[]>([]);
  const [loading, setLoading] = useState(Boolean(runId));
  const [error, setError] = useState<string | null>(null);

  const [previousRunId, setPreviousRunId] = useState(runId);
  if (previousRunId !== runId) {
    setPreviousRunId(runId);
    setGrades([]);
    setLoading(Boolean(runId));
    setError(null);
  }

  useEffect(() => {
    if (!runId) return undefined;
    return onSnapshot(
      collection(db, RUNS_COLLECTION, runId, 'grades'),
      (snapshot) => {
        setGrades(
          snapshot.docs.map((snapshotDoc) => ({
            ...(snapshotDoc.data() as Omit<ProjectGroupGrade, 'groupId'>),
            groupId: snapshotDoc.id,
          }))
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logError('useProjectGrades.subscribe', snapshotError, { runId });
        setError('Grades could not be loaded.');
        setLoading(false);
      }
    );
  }, [runId]);

  const gradesByGroupId = useMemo(() => {
    const map: Record<string, ProjectGroupGrade> = {};
    for (const grade of grades) map[grade.groupId] = grade;
    return map;
  }, [grades]);

  const saveGrade = useCallback(
    async (grade: ProjectGroupGrade) => {
      if (!runId) throw new Error('No project is running.');
      await setDoc(
        doc(db, RUNS_COLLECTION, runId, 'grades', grade.groupId),
        grade
      );
    },
    [runId]
  );

  return { gradesByGroupId, loading, error, saveGrade };
}
