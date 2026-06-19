/**
 * useSyncedVideoActivityGroups — counterpart to `useSyncedQuizGroups` for
 * Video Activity. Bridges the canonical docs at
 * `/synced_video_activities/{groupId}` and the teacher's UI.
 *
 * Architectural decisions mirror the Quiz hook:
 *   - Per-doc `onSnapshot` listeners (vs. an `in`-query) so list changes
 *     diff naturally and we don't hit the 30-id `in` cap.
 *   - Adjust-state-while-rendering when the id set changes — prunes the
 *     map of stale entries before the effect re-runs.
 *   - Transactional publish that asserts `expectedVersion` and bumps by
 *     exactly one. The Firestore rule mirrors the +1 invariant; concurrent
 *     losers retry against the new base version.
 */

import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { VERSION_HISTORY_LIMIT } from '@/hooks/useSyncedQuizGroups';
import type {
  PlcVideoActivityVersionContent,
  SyncedVideoActivityGroup,
  SyncedVideoActivityVersionSnapshot,
  VideoActivityBehaviorSettings,
  VideoActivityQuestion,
} from '@/types';

const SYNCED_COLLECTION = 'synced_video_activities';
const VERSIONS_SUBCOLLECTION = 'versions';

export { VERSION_HISTORY_LIMIT };

export interface PublishSyncedVideoActivityInput {
  title: string;
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  expectedVersion: number;
  uid: string;
  /** Behavior settings to publish alongside content (optional). */
  behavior?: VideoActivityBehaviorSettings;
}

export interface PublishSyncedVideoActivityResult {
  version: number;
}

export class SyncedVideoActivityVersionConflictError extends Error {
  readonly currentVersion: number;
  readonly expectedVersion: number;
  constructor(expectedVersion: number, currentVersion: number) {
    super(
      `Synced video activity canonical version is ${currentVersion} but caller expected ${expectedVersion}.`
    );
    this.name = 'SyncedVideoActivityVersionConflictError';
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

export function useSyncedVideoActivityGroupsByIds(
  syncGroupIds: readonly string[] | undefined
): {
  groups: Map<string, SyncedVideoActivityGroup>;
  loading: boolean;
} {
  const [groups, setGroups] = useState<Map<string, SyncedVideoActivityGroup>>(
    () => new Map()
  );
  const [loading, setLoading] = useState<boolean>(
    () => (syncGroupIds?.length ?? 0) > 0
  );

  // Dedupe before sorting so `total` in the effect's `markResolved`
  // counter matches the number of unique listeners we'll actually
  // create. Otherwise a duplicate id would inflate `total` and the
  // hook's `loading` flag would hang at `true` forever.
  const idsKey = Array.from(new Set(syncGroupIds ?? []))
    .sort()
    .join(',');

  const [prevIdsKey, setPrevIdsKey] = useState(idsKey);
  if (prevIdsKey !== idsKey) {
    setPrevIdsKey(idsKey);
    if (idsKey === '') {
      setGroups((prev) => (prev.size === 0 ? prev : new Map()));
      setLoading(false);
    } else {
      const liveIds = new Set(idsKey.split(','));
      setGroups((prev) => {
        let mutated = false;
        const next = new Map<string, SyncedVideoActivityGroup>();
        for (const [groupId, group] of prev) {
          if (liveIds.has(groupId)) {
            next.set(groupId, group);
          } else {
            mutated = true;
          }
        }
        if (!mutated && next.size === prev.size) return prev;
        return next;
      });
      setLoading(true);
    }
  }

  useEffect(() => {
    if (idsKey === '') return;
    const ids = idsKey.split(',');
    const resolved = new Set<string>();
    const total = ids.length;
    const markResolved = (groupId: string) => {
      if (resolved.has(groupId)) return;
      resolved.add(groupId);
      if (resolved.size === total) setLoading(false);
    };
    const unsubs: Array<() => void> = ids.map((groupId) =>
      onSnapshot(
        doc(db, SYNCED_COLLECTION, groupId),
        (snap) => {
          setGroups((prev) => {
            const next = new Map(prev);
            if (snap.exists()) {
              next.set(groupId, {
                id: groupId,
                ...(snap.data() as Omit<SyncedVideoActivityGroup, 'id'>),
              });
            } else {
              next.delete(groupId);
            }
            return next;
          });
          markResolved(groupId);
        },
        (err) => {
          logError('useSyncedVideoActivityGroups.subscribe', err, { groupId });
          markResolved(groupId);
        }
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [idsKey]);

  return { groups, loading };
}

/**
 * Read the latest canonical content for a single synced group. Used by the
 * "Sync available" pull path on activity library cards.
 */
export async function pullSyncedVideoActivityContent(groupId: string): Promise<{
  title: string;
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  behavior?: VideoActivityBehaviorSettings;
  version: number;
}> {
  const snap = await getDoc(doc(db, SYNCED_COLLECTION, groupId));
  if (!snap.exists()) {
    throw new Error('Synced video activity group not found.');
  }
  const data = snap.data() as Pick<
    SyncedVideoActivityGroup,
    'title' | 'youtubeUrl' | 'questions' | 'behavior' | 'version'
  >;
  return {
    title: data.title,
    youtubeUrl: data.youtubeUrl ?? '',
    questions: data.questions ?? [],
    behavior: data.behavior,
    version: data.version ?? 1,
  };
}

/**
 * Create the canonical doc for a brand-new synced group. Used by
 * `shareAssignment` when the source activity has no `syncGroupId` yet —
 * the sharer is the sole initial participant.
 */
export async function createSyncedVideoActivityGroup(input: {
  groupId: string;
  uid: string;
  title: string;
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  plcId?: string;
  behavior?: VideoActivityBehaviorSettings;
}): Promise<void> {
  const now = Date.now();
  const payload: SyncedVideoActivityGroup = {
    id: input.groupId,
    version: 1,
    title: input.title,
    youtubeUrl: input.youtubeUrl,
    questions: input.questions,
    participants: { [input.uid]: { joinedAt: now } },
    ...(input.plcId ? { plcId: input.plcId } : {}),
    ...(input.behavior ? { behavior: input.behavior } : {}),
    createdAt: now,
    updatedAt: now,
    updatedBy: input.uid,
  };
  await setDoc(doc(db, SYNCED_COLLECTION, input.groupId), payload);
}

/**
 * Transactionally publish a content edit to a synced group. Asserts the
 * caller's `expectedVersion` is still the canonical doc's `version`,
 * increments by 1, and stamps `updatedBy`.
 */
export async function publishSyncedVideoActivity(
  groupId: string,
  input: PublishSyncedVideoActivityInput
): Promise<PublishSyncedVideoActivityResult> {
  const ref = doc(db, SYNCED_COLLECTION, groupId);
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error('Synced video activity group not found.');
    }
    const current = snap.data() as SyncedVideoActivityGroup;
    if (current.version !== input.expectedVersion) {
      throw new SyncedVideoActivityVersionConflictError(
        input.expectedVersion,
        current.version
      );
    }
    if (
      !current.participants ||
      !Object.prototype.hasOwnProperty.call(current.participants, input.uid)
    ) {
      throw new Error(
        'You are not a participant of this synced video activity group.'
      );
    }
    const nextVersion = current.version + 1;
    const now = Date.now();
    tx.update(ref, {
      version: nextVersion,
      title: input.title,
      youtubeUrl: input.youtubeUrl,
      questions: input.questions,
      updatedAt: now,
      updatedBy: input.uid,
      ...(input.behavior ? { behavior: input.behavior } : {}),
    });
    // Capture the PRE-edit content so the post-commit snapshot writer can
    // archive the version this publish is about to overwrite.
    return {
      version: nextVersion,
      preEditContent: buildVideoActivityVersionContent(current),
      preEditVersion: current.version,
    };
  });

  // Fire-and-forget the version snapshot AFTER the canonical commit so
  // versioning never blocks (or fails) the publish.
  void writeVideoActivityVersionSnapshot(groupId, {
    version: result.preEditVersion,
    content: result.preEditContent,
    savedBy: input.uid,
    savedAt: Date.now(),
  });

  return { version: result.version };
}

/**
 * Normalize a canonical VA doc into the snapshot `content` payload — drops the
 * `behavior` key when absent so we never persist `undefined`.
 */
function buildVideoActivityVersionContent(
  source: Pick<
    SyncedVideoActivityGroup,
    'title' | 'youtubeUrl' | 'questions' | 'behavior'
  >
): PlcVideoActivityVersionContent {
  return {
    title: source.title,
    youtubeUrl: source.youtubeUrl ?? '',
    questions: source.questions ?? [],
    ...(source.behavior ? { behavior: source.behavior } : {}),
  };
}

/**
 * Write one snapshot to `versions/{version}` and prune to the newest
 * `VERSION_HISTORY_LIMIT`. Keyed by canonical version for idempotency.
 * Best-effort; invoked fire-and-forget after the canonical commit.
 */
async function writeVideoActivityVersionSnapshot(
  groupId: string,
  snapshot: SyncedVideoActivityVersionSnapshot
): Promise<void> {
  try {
    await setDoc(
      doc(
        db,
        SYNCED_COLLECTION,
        groupId,
        VERSIONS_SUBCOLLECTION,
        String(snapshot.version)
      ),
      snapshot
    );
    await pruneVideoActivityVersions(groupId);
  } catch (err) {
    logError('useSyncedVideoActivityGroups.writeVersionSnapshot', err, {
      groupId,
    });
  }
}

/**
 * Delete any snapshots beyond the newest `VERSION_HISTORY_LIMIT`.
 */
async function pruneVideoActivityVersions(groupId: string): Promise<void> {
  const versionsRef = collection(
    db,
    SYNCED_COLLECTION,
    groupId,
    VERSIONS_SUBCOLLECTION
  );
  const snap = await getDocs(query(versionsRef, orderBy('version', 'asc')));
  const overflow = snap.docs.length - VERSION_HISTORY_LIMIT;
  if (overflow <= 0) return;
  await Promise.all(snap.docs.slice(0, overflow).map((d) => deleteDoc(d.ref)));
}

/**
 * List the bounded version history for a synced video activity group,
 * newest-first. Used by the "Restore version" UI.
 */
export async function listSyncedVideoActivityVersions(
  groupId: string
): Promise<SyncedVideoActivityVersionSnapshot[]> {
  const versionsRef = collection(
    db,
    SYNCED_COLLECTION,
    groupId,
    VERSIONS_SUBCOLLECTION
  );
  const snap = await getDocs(query(versionsRef, orderBy('version', 'desc')));
  return snap.docs.map((d) => d.data() as SyncedVideoActivityVersionSnapshot);
}

/**
 * Restore a snapshot's content back to the canonical doc via the normal
 * version-precondition publish path (bumps `version`, snapshots the
 * pre-restore content), reusing `SyncedVideoActivityVersionConflictError` on a
 * concurrent edit.
 */
export async function restoreSyncedVideoActivityVersion(
  groupId: string,
  version: number,
  uid: string
): Promise<PublishSyncedVideoActivityResult> {
  const versionSnap = await getDoc(
    doc(db, SYNCED_COLLECTION, groupId, VERSIONS_SUBCOLLECTION, String(version))
  );
  if (!versionSnap.exists()) {
    throw new Error('Synced video activity version snapshot not found.');
  }
  const { content } = versionSnap.data() as SyncedVideoActivityVersionSnapshot;
  const groupSnap = await getDoc(doc(db, SYNCED_COLLECTION, groupId));
  if (!groupSnap.exists()) {
    throw new Error('Synced video activity group not found.');
  }
  const current = groupSnap.data() as SyncedVideoActivityGroup;
  return publishSyncedVideoActivity(groupId, {
    title: content.title,
    youtubeUrl: content.youtubeUrl,
    questions: content.questions,
    expectedVersion: current.version,
    uid,
    ...(content.behavior ? { behavior: content.behavior } : {}),
  });
}

interface JoinResponse {
  groupId: string;
  version: number;
  alreadyJoined: boolean;
}
interface LeaveResponse {
  remainingParticipants: number;
}

export async function callJoinSyncedVideoActivityGroup(
  shareId: string
): Promise<JoinResponse> {
  const fn = httpsCallable<{ shareId: string }, JoinResponse>(
    functions,
    'joinSyncedVideoActivityGroup'
  );
  const result = await fn({ shareId });
  return result.data;
}

export async function callLeaveSyncedVideoActivityGroup(
  groupId: string
): Promise<LeaveResponse> {
  const fn = httpsCallable<{ groupId: string }, LeaveResponse>(
    functions,
    'leaveSyncedVideoActivityGroup'
  );
  const result = await fn({ groupId });
  return result.data;
}

/**
 * Phase 4 sibling of `callJoinPlcQuizSyncGroup`. Resolves `syncGroupId`
 * via `plcs/{plcId}/video_activities/{plcVideoActivityId}` instead of
 * the personal `shared_video_activity_assignments/{shareId}` route. Used
 * by the PLC Video Activity Library "Add to my library (Sync)" path; the
 * Cloud Function performs Admin-SDK membership validation before joining
 * the caller to the canonical `synced_video_activities` group.
 */
export async function callJoinPlcVideoActivitySyncGroup(
  plcId: string,
  plcVideoActivityId: string
): Promise<JoinResponse> {
  const fn = httpsCallable<
    { plcId: string; plcVideoActivityId: string },
    JoinResponse
  >(functions, 'joinPlcVideoActivitySyncGroup');
  const result = await fn({ plcId, plcVideoActivityId });
  return result.data;
}
