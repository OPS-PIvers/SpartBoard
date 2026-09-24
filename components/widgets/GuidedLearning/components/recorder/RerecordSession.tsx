import React, { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { useAuth } from '@/context/useAuth';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useStorage } from '@/hooks/useStorage';
import type { StudioReturn } from '@/components/tours/tourState';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { logError } from '@/utils/logError';
import { TourRecorder } from './TourRecorder';
import { buildNameMatcher } from './redaction';
import type { TourRecording } from './useTourCapture';
import type { StepRecapture } from './recordingHandoff';

interface RerecordSessionProps {
  target: StudioReturn;
  /** The uploaded click, or null when cancelled or it failed; the Studio reopens either way. */
  onDone: (recapture: StepRecapture | null) => void;
}

/** Captures one click on the real board and uploads its frame for one Studio step. */
export const RerecordSession: React.FC<RerecordSessionProps> = ({
  target,
  onDone,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const dashboard = useContext(DashboardContext);
  const { uploadGuidedLearningImage } = useStorage();
  // Built once; the roster names never leave this matcher.
  const [matcher] = useState(() =>
    buildNameMatcher((dashboard?.rosters ?? []).flatMap((r) => r.students))
  );
  const [busy, setBusy] = useState(false);

  const finish = async (recording: TourRecording) => {
    const step = recording.steps[0];
    const frame = step ? recording.frames[step.frameIndex] : undefined;
    if (!step || !frame || !user) {
      onDone(null);
      return;
    }
    setBusy(true);
    try {
      const file = new File([frame], 'tour-step.png', {
        type: frame.type || 'image/png',
      });
      const prepared = await prepareImageForUpload(file);
      // Recordings are district content, so they live on Storage.
      const uploaded = await uploadGuidedLearningImage(
        user.uid,
        prepared,
        prepared.name,
        'storage'
      );
      onDone({
        stepId: target.stepId,
        url: uploaded.url,
        ...(uploaded.thumbnailUrl
          ? { thumbnailUrl: uploaded.thumbnailUrl }
          : {}),
        placement: { xPct: step.xPct, yPct: step.yPct, region: step.region },
        tour: step.tour,
      });
    } catch (err) {
      logError('RerecordSession', err, { setId: target.setId });
      dashboard?.addToast(t('glRecorder.rerecordFailed'), 'error');
      onDone(null);
    }
  };

  if (busy) {
    return createPortal(
      <p
        role="status"
        data-tour-ignore=""
        className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-slate-900/90 px-4 py-2 text-sm font-semibold text-slate-100 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
        style={{ zIndex: Z_INDEX.tour }}
      >
        <Loader2
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {t('glRecorder.rerecordSaving')}
      </p>,
      document.body
    );
  }

  return (
    <TourRecorder
      single
      matcher={matcher}
      onFinish={(recording) => void finish(recording)}
      onDiscard={() => onDone(null)}
    />
  );
};

export default RerecordSession;
