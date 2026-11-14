import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import { GL_TOURS_COLLECTION } from '@/components/tours/tourSnapshot';
import { logError } from '@/utils/logError';

export interface TourCounts {
  plays: number;
  finished: number;
  linkViews: number;
}

const count = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/** Reads a stats doc written by the tourCounts functions; a missing doc is all zeros. */
export const parseTourCounts = (data: unknown): TourCounts => {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    plays: count(d.plays),
    finished: count(d.finished),
    linkViews: count(d.linkViews),
  };
};

// Non-breaking spaces keep each count on one line when the row wraps.
const plural = (n: number, one: string, many: string) =>
  `${n}\u00a0${n === 1 ? one : many}`.replace(/ /g, '\u00a0');

/** "12 views · 9 finished · 4 link views"; link views only once the link was ever on. */
export const countsText = (c: TourCounts, linkOn: boolean): string =>
  [
    plural(c.plays, 'view', 'views'),
    `${c.finished}\u00a0finished`,
    ...(linkOn || c.linkViews > 0
      ? [plural(c.linkViews, 'link view', 'link views')]
      : []),
  ].join(' · ');

/** A published tour's play, finish and public link view counts, live; null until loaded or when off. Admins only. */
export function useTourCounts(
  setId: string,
  enabled: boolean
): TourCounts | null {
  const [state, setState] = useState<{
    key: string;
    counts: TourCounts;
  } | null>(null);
  const key = enabled && isConfigured ? setId : '';
  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      doc(db, GL_TOURS_COLLECTION, key, 'stats', 'counts'),
      (snap) => setState({ key, counts: parseTourCounts(snap.data()) }),
      (err) => logError('useTourCounts', err, { setId: key })
    );
  }, [key]);
  return state && state.key === key ? state.counts : null;
}
