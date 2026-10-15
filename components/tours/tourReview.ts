import { useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { TourPlaytest, TourReview, TourReviewNote } from '@/types';

// Admins only (firestore.rules), so notes naming an admin never sit where students can read the draft.
const reviewRef = (setId: string) =>
  doc(db, 'building_guided_learning', setId, 'review', 'current');

/** A tour's notes for Claude and last playtest, live; null until loaded. */
export function useTourReview(setId: string): TourReview | null {
  const [review, setReview] = useState<{
    setId: string;
    value: TourReview;
  } | null>(null);
  useEffect(() => {
    if (!isConfigured || !setId) return;
    return onSnapshot(
      reviewRef(setId),
      (snap) =>
        setReview({
          setId,
          value: (snap.data() as TourReview | undefined) ?? {},
        }),
      (err) => logError('tourReview.listen', err, { setId })
    );
  }, [setId]);
  return review?.setId === setId ? review.value : null;
}

/** Saves or, with no note, removes the tour's note ("tour") or a step's. */
export const saveTourNote = (
  setId: string,
  target: string,
  note: TourReviewNote | undefined
): Promise<void> =>
  setDoc(
    reviewRef(setId),
    target === 'tour'
      ? { tourNote: note ?? deleteField() }
      : { stepNotes: { [target]: note ?? deleteField() } },
    { merge: true }
  );

export const saveTourPlaytest = (
  setId: string,
  playtest: TourPlaytest
): Promise<void> => setDoc(reviewRef(setId), { playtest }, { merge: true });
