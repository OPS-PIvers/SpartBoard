import React, {
  lazy,
  Suspense,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningSet } from '@/types';
import { DashboardContext } from '@/context/DashboardContextValue';
import { loadBuildingSet, useGuidedLearning } from '@/hooks/useGuidedLearning';
import type { StudioReturn } from '@/components/tours/tourState';
import { logError } from '@/utils/logError';
import type { StepRecapture } from './recordingHandoff';

const GuidedLearningStudio = lazy(() =>
  import('../studio/GuidedLearningStudio').then((m) => ({
    default: m.GuidedLearningStudio,
  }))
);

interface StudioReopenProps {
  target: StudioReturn;
  recapture?: StepRecapture;
  onEnd: () => void;
}

/** Reopens the Studio on a building set at a step, after a live run or a re-recorded click. */
export const StudioReopen: React.FC<StudioReopenProps> = ({
  target,
  recapture,
  onEnd,
}) => {
  const { t } = useTranslation();
  const addToast = useContext(DashboardContext)?.addToast;
  const { saveBuildingSet } = useGuidedLearning(undefined);
  const [set, setSet] = useState<GuidedLearningSet | null>(null);

  const fail = useEffectEvent((err: unknown) => {
    if (err) logError('StudioReopen', err, { setId: target.setId });
    addToast?.(t('glStudio.reopenFailed'), 'error');
    onEnd();
  });

  useEffect(() => {
    let live = true;
    loadBuildingSet(target.setId).then(
      (loaded) => {
        if (!live) return;
        if (loaded) setSet(loaded);
        else fail(null);
      },
      (err: unknown) => {
        if (live) fail(err);
      }
    );
    return () => {
      live = false;
    };
  }, [target.setId]);

  if (!set) return null;
  return (
    <Suspense fallback={null}>
      <GuidedLearningStudio
        set={set}
        meta={null}
        onClose={onEnd}
        onSave={(next, _driveFileId, guard) => saveBuildingSet(next, guard)}
        initialStepId={target.stepId}
        recapture={recapture}
      />
    </Suspense>
  );
};

export default StudioReopen;
