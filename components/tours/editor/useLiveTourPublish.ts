import { useContext, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { logError } from '@/utils/logError';
import {
  publishTour,
  usePublishedTour,
} from '@/components/tours/publishedTours';
import {
  tourPublishStatus,
  type TourPublishStatus,
} from '@/components/tours/tourSnapshot';
import {
  tourHealthOf,
  type TourStepHealth,
} from '@/components/tours/tourHealth';
import { getTourEdit } from './tourEditStore';
import type { TourEditorSession } from './useTourEditorSession';

export interface LiveTourPublish {
  /** null while the published copy loads. */
  status: TourPublishStatus | null;
  publishedAt: number | null;
  publishing: boolean;
  failed: boolean;
  /** Steps with broken links, listed before an admin publishes anyway. */
  broken: TourStepHealth[];
  confirming: boolean;
  /** Publishes, or first asks to confirm when steps have broken links. */
  publish: () => void;
  publishAnyway: () => void;
  cancel: () => void;
}

/** A Live tour's publish state and action: saves the draft first, then publishes what was saved. */
export function useLiveTourPublish(
  session: TourEditorSession
): LiveTourPublish {
  const uid = useContext(AuthContext)?.user?.uid;
  const { set } = session;
  const { loaded, tour } = usePublishedTour(set.id);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [failed, setFailed] = useState(false);
  const broken = tourHealthOf(set).filter((h) => h.problem !== null);

  const run = async () => {
    if (!uid) return;
    setConfirming(false);
    setPublishing(true);
    setFailed(false);
    try {
      // A failed save shows the editor's own save error; nothing is published.
      const saved = await session.flush();
      const latest = getTourEdit()?.set;
      if (saved && latest) await publishTour(latest, uid);
    } catch (err) {
      logError('useLiveTourPublish', err, { setId: set.id });
      setFailed(true);
    } finally {
      setPublishing(false);
    }
  };

  return {
    status: loaded && uid ? tourPublishStatus(set, tour) : null,
    publishedAt: tour && tour.publishedAt > 0 ? tour.publishedAt : null,
    publishing,
    failed,
    broken,
    confirming,
    publish: () => (broken.length > 0 ? setConfirming(true) : void run()),
    publishAnyway: () => void run(),
    cancel: () => setConfirming(false),
  };
}
