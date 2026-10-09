// A teacher's private filing of library items they don't own (LIBRARY_FOLDERS D21-D24).
import { useCallback, useMemo } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  type SharedSource,
  useSharedSubscription,
} from './useSharedSubscription';

/** Libraries that show items from a source the teacher doesn't own. */
export type PlacementWidget = 'guided_learning' | 'miniapp' | 'question_bank';

export type PlacementSource = 'building' | 'global' | 'plcbank';

export interface LibraryPlacement {
  /** Doc id: "building:<setId>", "global:<appId>" or "plcbank:<plcId>:<bankId>". */
  sourceKey: string;
  folderId: string;
  order?: number;
  updatedAt: number;
}

export const placementSourceKey = (
  source: PlacementSource,
  ...ids: string[]
): string => [source, ...ids].join(':');

export const placementSourceOf = (
  sourceKey: string
): PlacementSource | null => {
  const head = sourceKey.split(':', 1)[0];
  return head === 'building' || head === 'global' || head === 'plcbank'
    ? head
    : null;
};

interface PlacementsState {
  placements: LibraryPlacement[];
  loading: boolean;
}

const placementsSource: SharedSource<PlacementsState> = {
  id: 'library-placements',
  initial: { placements: [], loading: true },
  start: (path, update) =>
    onSnapshot(
      collection(db, path),
      (snap) =>
        update(() => ({
          placements: snap.docs.map((d) => ({
            ...(d.data() as Omit<LibraryPlacement, 'sourceKey'>),
            sourceKey: d.id,
          })),
          loading: false,
        })),
      (err) => {
        logError('useLibraryPlacements.onSnapshot', err, { path });
        update((prev) => ({ ...prev, loading: false }));
      }
    ),
};

export interface UseLibraryPlacementsResult {
  /** Placement by source key. */
  byKey: Map<string, LibraryPlacement>;
  loading: boolean;
  /** File a source item into one of the teacher's folders. */
  place: (sourceKey: string, folderId: string, order?: number) => Promise<void>;
  /** Return a source item to its source folder. */
  unplace: (sourceKey: string) => Promise<void>;
}

export function useLibraryPlacements(
  userId: string | undefined,
  widget: PlacementWidget | null
): UseLibraryPlacementsResult {
  const path = userId && widget ? `users/${userId}/${widget}_placements` : null;
  const shared = useSharedSubscription(placementsSource, path);
  const placements = useMemo(
    () => (path ? shared.placements : []),
    [path, shared.placements]
  );
  const loading = path ? shared.loading : false;

  const byKey = useMemo(
    () => new Map(placements.map((p) => [p.sourceKey, p] as const)),
    [placements]
  );

  const place = useCallback(
    async (sourceKey: string, folderId: string, order?: number) => {
      if (!path) throw new Error('Not authenticated');
      await setDoc(doc(db, path, sourceKey), {
        folderId,
        ...(order === undefined ? {} : { order }),
        updatedAt: Date.now(),
      });
    },
    [path]
  );

  const unplace = useCallback(
    async (sourceKey: string) => {
      if (!path) throw new Error('Not authenticated');
      await deleteDoc(doc(db, path, sourceKey));
    },
    [path]
  );

  return useMemo(
    () => ({ byKey, loading, place, unplace }),
    [byKey, loading, place, unplace]
  );
}
