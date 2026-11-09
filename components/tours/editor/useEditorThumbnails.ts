import { useEffect, useEffectEvent } from 'react';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { logError } from '@/utils/logError';
import type { RecordedPlacement } from '@/components/widgets/GuidedLearning/components/recorder/resolveAnchor';
import { frameSize } from '@/components/widgets/GuidedLearning/components/recorder/recordingHandoff';
import { onTourEditShot, type TourEditShot } from './tourEditStore';
import type { TourEditorSession } from './useTourEditorSession';

/** The recorded centre and size, in percent, as a 0-1 box in the picture. */
export function targetOf(placement: RecordedPlacement) {
  const { xPct, yPct, region } = placement;
  const w = region.wPct / 100;
  const h = region.hPct / 100;
  const x = xPct / 100 - w / 2;
  const y = yPct / 100 - h / 2;
  const fits =
    w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 1.001 && y + h <= 1.001;
  return fits ? { x, y, w, h } : null;
}

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
      const target = shot.placement && targetOf(shot.placement);
      session.setThumbnail(shot.stepId, {
        url: uploaded.url,
        anchor: shot.tour.anchor,
        ...size,
        ...(target ? { target } : {}),
      });
    } catch (err) {
      logError('useEditorThumbnails', err, { stepId: shot.stepId });
    }
  });

  useEffect(() => onTourEditShot((shot) => void store(shot)), []);
}
