import { useCallback, useSyncExternalStore } from 'react';
import { isWebTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import {
  getToursVersion,
  readPublishedTour,
  watchTours,
} from '@/components/tours/publishedTours';
import { webTourSite } from './tourLinks';

/** Which of these sets are published web tours, each mapped to its site ('' when it has none), and which are still loading. */
export function useWebTourSites(setIds: readonly string[]): {
  sites: ReadonlyMap<string, string>;
  loading: ReadonlySet<string>;
} {
  const key = [...new Set(setIds)].sort().join(',');
  const subscribe = useCallback(
    (onChange: () => void) =>
      key ? watchTours(key.split(','), onChange) : () => undefined,
    [key]
  );
  useSyncExternalStore(subscribe, getToursVersion, getToursVersion);
  const sites = new Map<string, string>();
  const loading = new Set<string>();
  for (const id of key ? key.split(',') : []) {
    const published = readPublishedTour(id);
    if (!published.loaded) loading.add(id);
    const set = published.tour?.set;
    if (set && isWebTourSet(set)) sites.set(id, webTourSite(set) ?? '');
  }
  return { sites, loading };
}
