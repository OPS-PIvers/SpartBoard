import { useEffect, useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import type { GuidedLearningSet } from '@/types';
import type { GuidedLearningSaveGuard } from '@/components/widgets/GuidedLearning/utils/saveConflict';
import { logError } from '@/utils/logError';
import {
  TOUR_ANCHOR_BATCHES_COLLECTION,
  TOUR_ANCHOR_QUEUE_COLLECTION,
  parseQueueItem,
  reboundAnchorRef,
  rebindSteps,
  type TourAnchorOccurrence,
  type TourAnchorQueueItem,
  type UnmappedQueueEntry,
} from './anchorQueue';

const queueRef = (fingerprint: string) =>
  doc(db, TOUR_ANCHOR_QUEUE_COLLECTION, fingerprint);

/** Queues a saved recording's untagged clicks, then writes one batch doc for the routine trigger. */
export async function enqueueUnmappedAnchors(
  setId: string,
  entries: readonly UnmappedQueueEntry[]
): Promise<void> {
  if (!isConfigured || entries.length === 0) return;
  await runTransaction(db, async (tx) => {
    const refs = entries.map((e) => queueRef(e.fingerprint));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    entries.forEach((entry, i) => {
      // Status and firstSeenAt only on create, so a PR-open or rebound item is never reopened.
      const created = !snaps[i].exists();
      tx.set(
        refs[i],
        {
          ...entry.context,
          fingerprint: entry.fingerprint,
          occurrences: arrayUnion(...entry.occurrences),
          updatedAt: serverTimestamp(),
          ...(created
            ? { status: 'open', firstSeenAt: serverTimestamp() }
            : {}),
        },
        { merge: true }
      );
    });
    tx.set(doc(collection(db, TOUR_ANCHOR_BATCHES_COLLECTION)), {
      setId,
      fingerprints: entries.map((e) => e.fingerprint),
      createdAt: serverTimestamp(),
    });
  });
}

/** Drops deleted steps from their queue items; best effort, a missing item is skipped. */
export async function removeQueueOccurrences(
  removed: ReadonlyArray<TourAnchorOccurrence & { fingerprint: string }>
): Promise<void> {
  if (!isConfigured || removed.length === 0) return;
  const byFingerprint = new Map<string, TourAnchorOccurrence[]>();
  for (const { fingerprint, setId, stepId } of removed) {
    const list = byFingerprint.get(fingerprint) ?? [];
    list.push({ setId, stepId });
    byFingerprint.set(fingerprint, list);
  }
  const results = await Promise.allSettled(
    [...byFingerprint].map(([fingerprint, occurrences]) =>
      updateDoc(queueRef(fingerprint), {
        occurrences: arrayRemove(...occurrences),
        updatedAt: serverTimestamp(),
      })
    )
  );
  for (const r of results)
    if (r.status === 'rejected')
      logError('anchorQueue.removeOccurrences', r.reason);
}

export interface RebindDeps {
  load: (setId: string) => Promise<GuidedLearningSet | null>;
  save: (
    set: GuidedLearningSet,
    guard: GuidedLearningSaveGuard
  ) => Promise<void>;
}

/** Writes the mapped anchor into every affected building-set step, then marks the item rebound; 0 means nothing was left to rebind. */
export async function rebindQueueItem(
  item: TourAnchorQueueItem,
  { load, save }: RebindDeps
): Promise<number> {
  const anchorRef = reboundAnchorRef(item);
  if (!anchorRef) throw new Error('Anchor is not in this build');
  const bySet = new Map<string, Set<string>>();
  for (const o of item.occurrences) {
    const ids = bySet.get(o.setId) ?? new Set<string>();
    ids.add(o.stepId);
    bySet.set(o.setId, ids);
  }
  let count = 0;
  for (const [setId, stepIds] of bySet) {
    const set = await load(setId);
    if (!set) continue;
    const next = rebindSteps(set, item.fingerprint, stepIds, anchorRef);
    if (next.count === 0) continue;
    // Guarded like a Studio save, so an edit made elsewhere is never overwritten.
    await save(
      { ...next.set, updatedAt: Math.max(Date.now(), set.updatedAt + 1) },
      { expectedUpdatedAt: set.updatedAt }
    );
    count += next.count;
  }
  // Every step was deleted or rebound elsewhere: prune the stale places instead of claiming a rebind.
  if (count === 0) {
    await removeQueueOccurrences(
      item.occurrences.map((o) => ({ ...o, fingerprint: item.fingerprint }))
    );
    return 0;
  }
  if (isConfigured) {
    await updateDoc(queueRef(item.fingerprint), {
      status: 'rebound',
      reboundAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return count;
}

export interface TourAnchorQueueState {
  items: TourAnchorQueueItem[];
  loading: boolean;
  error: boolean;
}

/** Live queue for Tour Health; admins only. */
export function useTourAnchorQueue(): TourAnchorQueueState {
  const [state, setState] = useState<TourAnchorQueueState>({
    items: [],
    loading: isConfigured,
    error: false,
  });
  useEffect(() => {
    if (!isConfigured) return;
    return onSnapshot(
      collection(db, TOUR_ANCHOR_QUEUE_COLLECTION),
      (snap) =>
        setState({
          items: snap.docs.flatMap((d) => {
            const item = parseQueueItem(d.id, d.data());
            return item ? [item] : [];
          }),
          loading: false,
          error: false,
        }),
      (err) => {
        logError('anchorQueue.subscribe', err);
        setState({ items: [], loading: false, error: true });
      }
    );
  }, []);
  return state;
}
