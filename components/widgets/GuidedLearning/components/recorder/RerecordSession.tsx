import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useStorage } from '@/hooks/useStorage';
import type { StudioReturn } from '@/components/tours/tourState';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { logError } from '@/utils/logError';
import { TourRecorder } from './TourRecorder';
import { FrameReview } from './FrameReview';
import { buildNameMatcher } from './redaction';
import type { TourRecording } from './useTourCapture';
import { keepFrames, type StepRecapture } from './recordingHandoff';

interface RerecordSessionProps {
  target: StudioReturn;
  /** The uploaded click, or null when cancelled; the Studio reopens either way. */
  onDone: (recapture: StepRecapture | null) => void;
}

/** Captures one click on the real board, reviews its frame like a full recording, then uploads it for one step. */
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
  // The one captured frame, awaiting the same review a full recording gets.
  const [review, setReview] = useState<TourRecording | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const captured = (recording: TourRecording) => {
    const step = recording.steps[0];
    if (!step || !recording.frames[step.frameIndex]) {
      onDone(null);
      return;
    }
    const single = keepFrames(recording, [step.frameIndex]);
    setReview({ ...single, steps: single.steps.slice(0, 1) });
  };

  const upload = async (reviewed: TourRecording) => {
    const step = reviewed.steps[0];
    const frame = step ? reviewed.frames[step.frameIndex] : undefined;
    if (!step || !frame || !user) {
      onDone(null);
      return;
    }
    setError(null);
    setBusy(t('glRecorder.rerecordSaving'));
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
      // The reviewed frame stays, so Upload retries without recording again.
      logError('RerecordSession', err, { setId: target.setId });
      setError(t('glRecorder.rerecordFailed'));
      setBusy(null);
    }
  };

  if (review) {
    return (
      <FrameReview
        recording={review}
        busy={busy}
        error={error}
        onUpload={(reviewed) => void upload(reviewed)}
        onDiscard={() => onDone(null)}
      />
    );
  }

  return (
    <TourRecorder
      single
      matcher={matcher}
      onFinish={captured}
      onDiscard={() => onDone(null)}
    />
  );
};

export default RerecordSession;
