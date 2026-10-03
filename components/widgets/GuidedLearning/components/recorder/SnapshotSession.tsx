import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import type { TourSnapshots } from '@/components/tours/tourState';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { logError } from '@/utils/logError';
import { FrameReview } from './FrameReview';
import type { TourRecording } from './useTourCapture';
import {
  snapshotRecording,
  uploadFramesOnce,
  type StepRecapture,
  type UploadedFrame,
} from './recordingHandoff';

interface SnapshotSessionProps {
  snapshots: TourSnapshots;
  /** The uploaded pictures, or none when discarded; the Studio reopens either way. */
  onDone: (recaptures: StepRecapture[]) => void;
}

/** Reviews a draft run's step pictures like a recording, then uploads them for the Studio. */
export const SnapshotSession: React.FC<SnapshotSessionProps> = ({
  snapshots,
  onDone,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { uploadGuidedLearningImage } = useStorage();
  const [recording] = useState(() => snapshotRecording(snapshots));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploaded = useRef(new Map<Blob, UploadedFrame>());

  const upload = async (reviewed: TourRecording) => {
    if (!user || reviewed.steps.length === 0) {
      onDone([]);
      return;
    }
    setError(null);
    setBusy(t('glRecorder.rerecordSaving'));
    try {
      const frames = await uploadFramesOnce(
        reviewed.frames,
        uploaded.current,
        async (frame, i) => {
          const file = new File([frame], `tour-step-${i + 1}.png`, {
            type: frame.type || 'image/png',
          });
          const prepared = await prepareImageForUpload(file);
          // Tour pictures are district content, so they live on Storage.
          return uploadGuidedLearningImage(
            user.uid,
            prepared,
            prepared.name,
            'storage'
          );
        }
      );
      onDone(
        reviewed.steps.flatMap((step) => {
          const frame = frames[step.frameIndex];
          return frame
            ? [
                {
                  stepId: step.id,
                  url: frame.url,
                  ...(frame.thumbnailUrl
                    ? { thumbnailUrl: frame.thumbnailUrl }
                    : {}),
                  placement: {
                    xPct: step.xPct,
                    yPct: step.yPct,
                    region: step.region,
                  },
                  tour: step.tour,
                },
              ]
            : [];
        })
      );
    } catch (err) {
      // Uploaded frames are remembered, so Upload retries only the rest.
      logError('SnapshotSession', err, { setId: snapshots.setId });
      setError(t('glRecorder.rerecordFailed'));
      setBusy(null);
    }
  };

  return (
    <FrameReview
      recording={recording}
      busy={busy}
      error={error}
      onUpload={(reviewed) => void upload(reviewed)}
      onDiscard={() => onDone([])}
    />
  );
};

export default SnapshotSession;
