import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import type { GuidedLearningSet } from '@/types';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { assertGuidedLearningDocFits } from '@/utils/firestoreDocSize';
import { logError } from '@/utils/logError';
import {
  buildTourContent,
  GL_TOURS_COLLECTION,
  parsePublishedTour,
  TOURS_META_ID,
  type PublishedTour,
} from './tourSnapshot';
import { tourStepsOf } from './tourSession';

const tourRef = (id: string) => doc(db, GL_TOURS_COLLECTION, id);

/** Writes the set's tour content as the snapshot every launch point runs. */
export async function publishTour(
  set: GuidedLearningSet,
  uid: string
): Promise<void> {
  const data = {
    set: buildTourContent(set),
    publishedAt: Date.now(),
    publishedBy: uid,
  };
  assertGuidedLearningDocFits(`${GL_TOURS_COLLECTION}/${set.id}`, data);
  await setDoc(tourRef(set.id), data);
}

/** The published snapshot itself, or null when the set was never published. */
export async function loadPublishedTour(
  setId: string
): Promise<PublishedTour | null> {
  const snap = await getDoc(tourRef(setId));
  return snap.exists() ? parsePublishedTour(setId, snap.data()) : null;
}

/** The set a launch point may run: its published snapshot, or the saved set until the one-time publish ran. */
export async function loadRunnableTour(
  setId: string
): Promise<GuidedLearningSet | null> {
  const snap = await getDoc(tourRef(setId));
  if (snap.exists()) return parsePublishedTour(setId, snap.data())?.set ?? null;
  if ((await getDoc(tourRef(TOURS_META_ID))).exists()) return null;
  return loadBuildingSet(setId);
}

// Shared, ref-counted doc listeners so every launch point on a page reads one snapshot per tour.
interface DocEntry {
  refs: number;
  loaded: boolean;
  exists: boolean;
  tour: PublishedTour | null;
  unsub: () => void;
}

const entries = new Map<string, DocEntry>();
const listeners = new Set<() => void>();
// Pre-publishing fallback only: whether the saved set has a tour, read once per page.
const legacy = new Map<string, boolean>();
const legacyPending = new Set<string>();
let version = 0;

const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

const markerMissing = (): boolean => {
  const meta = entries.get(TOURS_META_ID);
  return !!meta?.loaded && !meta.exists;
};

const checkLegacy = (id: string) => {
  if (legacy.has(id) || legacyPending.has(id)) return;
  legacyPending.add(id);
  void loadBuildingSet(id)
    .then((set) => !!set && tourStepsOf(set).length > 0)
    .catch(() => false)
    .then((has) => {
      legacyPending.delete(id);
      legacy.set(id, has);
      notify();
    });
};

const afterChange = () => {
  if (markerMissing()) {
    entries.forEach((e, id) => {
      if (id !== TOURS_META_ID && e.loaded && !e.exists) checkLegacy(id);
    });
  }
  notify();
};

const watchDoc = (id: string): (() => void) => {
  let entry = entries.get(id);
  if (!entry) {
    const created: DocEntry = {
      refs: 0,
      loaded: false,
      exists: false,
      tour: null,
      unsub: () => undefined,
    };
    entry = created;
    entries.set(id, created);
    if (!isConfigured) {
      created.loaded = true;
    } else {
      created.unsub = onSnapshot(
        tourRef(id),
        (snap) => {
          created.loaded = true;
          created.exists = snap.exists();
          created.tour = created.exists
            ? parsePublishedTour(id, snap.data())
            : null;
          afterChange();
        },
        (err) => {
          // Unreadable counts as published-and-empty, so nothing falls back to a draft.
          logError('publishedTours listener', err, { id });
          created.loaded = true;
          created.exists = true;
          created.tour = null;
          afterChange();
        }
      );
    }
  }
  const watched = entry;
  watched.refs++;
  return () => {
    watched.refs--;
    if (watched.refs > 0) return;
    watched.unsub();
    entries.delete(id);
  };
};

/** Watches these tours (and the one-time-publish marker) until the returned cleanup runs. */
export function watchTours(
  ids: readonly string[],
  onChange: () => void
): () => void {
  listeners.add(onChange);
  const stops = [TOURS_META_ID, ...ids].map(watchDoc);
  return () => {
    listeners.delete(onChange);
    stops.forEach((stop) => stop());
  };
}

export const getToursVersion = (): number => version;

/** The watched published snapshot, once its first read has landed. */
export function readPublishedTour(id: string): {
  loaded: boolean;
  tour: PublishedTour | null;
} {
  const entry = entries.get(id);
  return { loaded: !!entry?.loaded, tour: entry?.tour ?? null };
}

/** Whether a watched tour can run now; undefined while still loading. */
export function isTourRunnable(id: string): boolean | undefined {
  const entry = entries.get(id);
  if (!entry?.loaded) return undefined;
  if (entry.exists) {
    return !!entry.tour && tourStepsOf(entry.tour.set).length > 0;
  }
  const meta = entries.get(TOURS_META_ID);
  if (!meta?.loaded) return undefined;
  if (meta.exists) return false;
  return legacy.get(id);
}

export const __resetPublishedToursForTests = (): void => {
  entries.forEach((e) => e.unsub());
  entries.clear();
  listeners.clear();
  legacy.clear();
  legacyPending.clear();
  version = 0;
};
