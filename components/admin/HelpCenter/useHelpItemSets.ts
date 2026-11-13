import { useEffect, useRef, useState } from 'react';
import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
} from '@/types';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { loadWebTourDraft } from '@/components/tours/webTours';

const loadItemSet = async (
  setId: string
): Promise<GuidedLearningSet | null> => {
  const building = await loadBuildingSet(setId).catch(() => null);
  if (building) return building;
  // An old item can still point at a web tour draft, which publishes elsewhere.
  return loadWebTourDraft(setId).catch(() => null);
};

/** Full sets behind the Help Center's items, reloaded when the library index says one changed; undefined while loading. */
export function useHelpItemSets(
  setIds: readonly string[],
  index: readonly GuidedLearningBuildingSetIndex[]
): ReadonlyMap<string, GuidedLearningSet | null> | undefined {
  const versions = new Map(index.map((entry) => [entry.id, entry.updatedAt]));
  const key = [...new Set(setIds)]
    .sort()
    .map((id) => `${id}@${versions.get(id) ?? '-'}`)
    .join(',');
  const [loaded, setLoaded] = useState<{
    key: string;
    sets: Map<string, GuidedLearningSet | null>;
  } | null>(null);
  // Sets already read, by `id@version`, so one edited set doesn't refetch the rest.
  const cacheRef = useRef(new Map<string, GuidedLearningSet | null>());

  useEffect(() => {
    let cancelled = false;
    const parts = key ? key.split(',') : [];
    const cache = cacheRef.current;
    void Promise.all(
      parts.map(async (part) => {
        if (cache.has(part)) return cache.get(part) ?? null;
        const set = await loadItemSet(part.split('@')[0]);
        cache.set(part, set);
        return set;
      })
    ).then((sets) => {
      if (cancelled) return;
      setLoaded({
        key,
        sets: new Map(parts.map((part, i) => [part.split('@')[0], sets[i]])),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Keep showing the previous result while a changed set reloads.
  return loaded?.sets;
}
