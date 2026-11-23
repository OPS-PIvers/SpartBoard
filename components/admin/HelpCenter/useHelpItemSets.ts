import { useEffect, useRef, useState } from 'react';
import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
} from '@/types';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { loadWebTourDraft } from '@/components/tours/webTours';

const RETRY_MS = 5000;

// Throws when a read failed and no set was found, so a blip isn't mistaken for a missing set.
const loadItemSet = async (
  setId: string
): Promise<GuidedLearningSet | null> => {
  let failed: unknown;
  const building = await loadBuildingSet(setId).catch((err: unknown) => {
    failed = err;
    return null;
  });
  if (building) return building;
  // An old item can still point at a web tour draft, which publishes elsewhere.
  const draft = await loadWebTourDraft(setId).catch((err: unknown) => {
    failed = err;
    return null;
  });
  if (draft) return draft;
  if (failed)
    throw failed instanceof Error ? failed : new Error('Help set read failed');
  return null;
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
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const parts = key ? key.split(',') : [];
    const cache = cacheRef.current;
    let anyFailed = false;
    void Promise.all(
      parts.map(async (part) => {
        if (cache.has(part)) return cache.get(part) ?? null;
        try {
          const set = await loadItemSet(part.split('@')[0]);
          cache.set(part, set);
          return set;
        } catch {
          // Not cached, so the next pass reads it again.
          anyFailed = true;
          return null;
        }
      })
    ).then((sets) => {
      if (cancelled) return;
      setLoaded({
        key,
        sets: new Map(parts.map((part, i) => [part.split('@')[0], sets[i]])),
      });
      if (anyFailed)
        timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, attempt]);

  // Keep showing the previous result while a changed set reloads.
  return loaded?.sets;
}
