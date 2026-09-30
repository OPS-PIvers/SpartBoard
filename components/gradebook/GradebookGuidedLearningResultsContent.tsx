import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { useAuth } from '@/context/useAuth';
import { loadBuildingSet, useGuidedLearning } from '@/hooks/useGuidedLearning';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import { normalizeGuidedLearningSet } from '@/components/widgets/GuidedLearning/utils/setMigration';
import { withFrozenAnswerKeys } from '@/components/widgets/GuidedLearning/utils/resultsScoring';
import { logError } from '@/utils/logError';

const GuidedLearningResults = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/GuidedLearningResults').then(
    (m) => ({ default: m.GuidedLearningResults })
  )
);

interface Props {
  sessionId: string;
  onClose: () => void;
}

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="h-full flex items-center justify-center gap-2 text-slate-300">
    {children}
  </div>
);

/** GL Results for one assignment, loading its set the way the GL widget does. */
export const GradebookGuidedLearningResultsContent: React.FC<Props> = ({
  sessionId,
  onClose,
}) => {
  const { user } = useAuth();
  const { sets, buildingSets, loading, buildingLoading, loadSetData } =
    useGuidedLearning(user?.uid);
  const { assignments, loading: assignmentsLoading } =
    useGuidedLearningAssignments(user?.uid);
  const assignment = assignments.find((a) => a.sessionId === sessionId);
  const [loaded, setLoaded] = useState<{
    setId: string;
    set: GuidedLearningSet | null;
  } | null>(null);

  const ready = !loading && !buildingLoading && !assignmentsLoading;
  const setId = assignment?.setId ?? null;
  const driveFileId = sets.find((s) => s.id === setId)?.driveFileId;
  const buildingEntry = buildingSets.find((s) => s.id === setId);

  useEffect(() => {
    if (!ready || !setId) return;
    let cancelled = false;
    const load = buildingEntry
      ? loadBuildingSet(setId)
      : driveFileId
        ? loadSetData(driveFileId).then(normalizeGuidedLearningSet)
        : Promise.resolve(null);
    load
      .then((set) => {
        if (!cancelled) setLoaded({ setId, set: set ?? null });
      })
      .catch((err: unknown) => {
        logError('GradebookGuidedLearningResults.loadSet', err, { sessionId });
        if (!cancelled) setLoaded({ setId, set: null });
      });
    return () => {
      cancelled = true;
    };
  }, [ready, setId, driveFileId, buildingEntry, loadSetData, sessionId]);

  const answerKeys = assignment?.answerKeys;
  const set = useMemo(
    () =>
      loaded?.setId === setId && loaded.set
        ? withFrozenAnswerKeys(loaded.set, answerKeys)
        : null,
    [loaded, setId, answerKeys]
  );

  if (ready && !setId) {
    return (
      <Centered>
        <AlertTriangle className="w-4 h-4" aria-hidden />
        Assignment not found.
      </Centered>
    );
  }
  if (loaded?.setId === setId && !loaded.set) {
    return (
      <Centered>
        <AlertTriangle className="w-4 h-4" aria-hidden />
        Could not load this activity.
      </Centered>
    );
  }
  if (!set) {
    return (
      <Centered>
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
      </Centered>
    );
  }
  return (
    <Suspense
      fallback={
        <Centered>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
        </Centered>
      }
    >
      <GuidedLearningResults
        set={set}
        sessionId={sessionId}
        onClose={onClose}
      />
    </Suspense>
  );
};
