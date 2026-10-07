import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import type { TourSnapshots } from '@/components/tours/tourState';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { logError } from '@/utils/logError';
import { frameSize, type StepRecapture } from './recordingHandoff';

interface SnapshotSessionProps {
  snapshots: TourSnapshots;
  /** The uploaded thumbnails, or none when every upload failed; the Studio reopens either way. */
  onDone: (recaptures: StepRecapture[]) => void;
}

/** Uploads a draft run's step pictures (already blurred) as each step's thumbnail, with no review screen. */
export const SnapshotSession: React.FC<SnapshotSessionProps> = ({
  snapshots,
  onDone,
}) => {
  const { user } = useAuth();
  const { uploadGuidedLearningImage } = useStorage();
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode re-runs effects; the pictures upload once.
    if (started.current) return;
    started.current = true;
    const run = async () => {
      const out: StepRecapture[] = [];
      for (const [i, shot] of snapshots.shots.entries()) {
        if (!user) break;
        try {
          const file = new File([shot.frame], `tour-step-${i + 1}.png`, {
            type: shot.frame.type || 'image/png',
          });
          const [prepared, size] = await Promise.all([
            prepareImageForUpload(file),
            frameSize(shot.frame),
          ]);
          // Tour pictures are district content, so they live on Storage.
          const uploaded = await uploadGuidedLearningImage(
            user.uid,
            prepared,
            prepared.name,
            'storage'
          );
          out.push({
            stepId: shot.stepId,
            url: uploaded.url,
            placement: shot.placement,
            tour: {
              ...shot.tour,
              thumbnail: {
                url: uploaded.url,
                anchor: shot.tour.anchor,
                ...size,
              },
            },
          });
        } catch (err) {
          logError('SnapshotSession', err, { setId: snapshots.setId });
        }
      }
      onDone(out);
    };
    void run();
    // Runs once per hand-off; the host remounts this for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default SnapshotSession;
