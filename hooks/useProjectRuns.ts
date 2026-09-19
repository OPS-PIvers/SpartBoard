/** Every run this teacher owns, feeding the In Progress and Archive tabs (R2). */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ProjectRun } from '@/types';
import { logError } from '@/utils/logError';
import { RUNS_COLLECTION } from '@/utils/projectRunWrites';

interface UseProjectRunsResult {
  runs: ProjectRun[];
  loading: boolean;
  error: string | null;
}

export function useProjectRuns(
  teacherUid: string | undefined
): UseProjectRunsResult {
  const [runs, setRuns] = useState<ProjectRun[]>([]);
  const [loading, setLoading] = useState(Boolean(teacherUid));
  const [error, setError] = useState<string | null>(null);

  const [previousUid, setPreviousUid] = useState(teacherUid);
  if (previousUid !== teacherUid) {
    setPreviousUid(teacherUid);
    setRuns([]);
    setLoading(Boolean(teacherUid));
    setError(null);
  }

  useEffect(() => {
    if (!teacherUid) return undefined;
    // No orderBy: that would need a composite index for a handful of docs.
    return onSnapshot(
      query(
        collection(db, RUNS_COLLECTION),
        where('teacherUid', '==', teacherUid)
      ),
      (snapshot) => {
        setRuns(
          snapshot.docs
            .map((snapshotDoc) => ({
              ...(snapshotDoc.data() as Omit<ProjectRun, 'id'>),
              id: snapshotDoc.id,
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt)
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logError('useProjectRuns.onSnapshot', snapshotError, { teacherUid });
        setError('Your running projects could not be loaded.');
        setLoading(false);
      }
    );
  }, [teacherUid]);

  return { runs, loading, error };
}
