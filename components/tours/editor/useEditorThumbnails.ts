import { useEffect, useEffectEvent } from 'react';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { logError } from '@/utils/logError';
import { frameSize } from '@/components/widgets/GuidedLearning/components/recorder/recordingHandoff';
import { onTourEditShot, type TourEditShot } from './tourEditStore';
import type { TourEditorSession } from './useTourEditorSession';

/** Uploads each picture the runner takes in the editor and stores it as that step's thumbnail. */
export function useEditorThumbnails(session: TourEditorSession | null): void {
  const { user } = useAuth();
  const { uploadGuidedLearningImage } = useStorage();

  const store = useEffectEvent(async (shot: TourEditShot) => {
    const uid = user?.uid;
    if (!uid || !session) return;
    try {
      const file = new File([shot.frame], `tour-step-${shot.stepId}.png`, {
        type: shot.frame.type || 'image/png',
      });
      const [prepared, size] = await Promise.all([
        prepareImageForUpload(file),
        frameSize(shot.frame),
      ]);
      // Tour pictures are district content, so they live on Storage.
      const uploaded = await uploadGuidedLearningImage(
        uid,
        prepared,
        prepared.name,
        'storage'
      );
      session.setThumbnail(shot.stepId, {
        url: uploaded.url,
        anchor: shot.tour.anchor,
        ...size,
      });
    } catch (err) {
      logError('useEditorThumbnails', err, { stepId: shot.stepId });
    }
  });

  useEffect(() => onTourEditShot((shot) => void store(shot)), []);
}
