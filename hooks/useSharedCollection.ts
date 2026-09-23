/**
 * useSharedCollection — Collection share lifecycle.
 *
 * Two writes (`shareCollection`, `shareSubstituteCollection`) and two
 * reads (`loadSharedCollection`, `loadSharedCollectionBoards`) plus the
 * recipient-side `importSharedCollection`. Mirrors the single-Board
 * sharing surface in `useFirestore.shareDashboard` etc., but scoped to
 * `/shared_collections/{shareId}`.
 *
 * The hook does NOT subscribe — Collection shares are one-shot writes/
 * reads, not live-mirrored. No onSnapshot.
 */

import { useCallback } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  sanitizeBoardForRecipient,
  sanitizeBoardForSubShare,
} from '@/utils/dashboardSanitize';
import {
  bundleSubShareContent,
  type SubShareBundle,
  type SubShareBundleItem,
  type SubShareBundleServices,
  subShareNeedsCalendar,
  subShareNeedsDrive,
} from '@/utils/bundleSubShareContent';
import {
  extractSubShareNames,
  subShareNamesIsEmpty,
  withSubShareQueues,
  withSubShareWallPosts,
  type SubShareNamesServices,
} from '@/utils/subShareNames';
import { GoogleCalendarService } from '@/utils/googleCalendarService';
import { QuizDriveService } from '@/utils/quizDriveService';
import { MockQuizDriveService } from '@/utils/mockQuizDriveService';
import { GuidedLearningDriveService } from '@/utils/guidedLearningDriveService';
import { MockGuidedLearningDriveService } from '@/utils/mockGuidedLearningDriveService';
import { normalizeVideoActivityQuestions } from '@/utils/videoActivityNormalize';
import { useAuth } from '@/context/useAuth';
import { subShareContentId } from '@/utils/subShareContent';
import type {
  CalendarEvent,
  Dashboard,
  GuidedLearningSet,
  VideoActivityData,
  SharedCollection,
  SharedCollectionBoardDoc,
  SharedCollectionBoardEntry,
  SharedCollectionKind,
  SharedCollectionSection,
  Collection as CollectionType,
  CollectionSubstituteShareInput,
  SubstituteShareDriveGrant,
  SubstituteShareRoster,
} from '@/types';

const SHARED_COLLECTIONS_SUBPATH = 'shared_collections';
const SHARED_COLLECTION_BOARDS_SUBPATH = 'boards';

/**
 * Result of {@link loadSharedCollection}. Differentiates a definitively
 * unavailable share (not-found / expired) from a transient failure to
 * determine its state (unauthorized / network / malformed) so the caller
 * can render the right user message.
 */
export type LoadSharedCollectionResult =
  | { ok: true; meta: SharedCollection }
  | {
      ok: false;
      reason: 'not-found' | 'expired' | 'unauthorized' | 'error';
    };

// ---------------------------------------------------------------------------
// In-memory mock store for auth-bypass (dev / E2E) mode.
// Mirrors the singleton pattern in useFirestore.ts.
// ---------------------------------------------------------------------------
class MockSharedCollectionStore {
  private static instance: MockSharedCollectionStore;
  private collections = new Map<string, SharedCollection>();
  private boards = new Map<string, Map<string, Dashboard>>();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): MockSharedCollectionStore {
    if (!MockSharedCollectionStore.instance) {
      MockSharedCollectionStore.instance = new MockSharedCollectionStore();
    }
    return MockSharedCollectionStore.instance;
  }

  save(shareId: string, meta: SharedCollection, boardList: Dashboard[]): void {
    this.collections.set(shareId, meta);
    const bMap = new Map<string, Dashboard>();
    for (const b of boardList) bMap.set(b.id, b);
    this.boards.set(shareId, bMap);
    try {
      sessionStorage.setItem(
        `mock_scoll_${shareId}`,
        JSON.stringify({ meta, boards: boardList })
      );
    } catch {
      /* session storage unavailable — in-memory only */
    }
  }

  getCollection(shareId: string): SharedCollection | null {
    if (this.collections.has(shareId)) {
      return this.collections.get(shareId) ?? null;
    }
    // Hydrate from sessionStorage (cross-navigation in E2E)
    try {
      const raw = sessionStorage.getItem(`mock_scoll_${shareId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          meta: SharedCollection;
          boards: Dashboard[];
        };
        this.collections.set(shareId, parsed.meta);
        const bMap = new Map<string, Dashboard>();
        for (const b of parsed.boards) bMap.set(b.id, b);
        this.boards.set(shareId, bMap);
        return parsed.meta;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  getBoards(shareId: string): Dashboard[] {
    // Ensure collection (and boards) are hydrated if only sessionStorage has them
    this.getCollection(shareId);
    return Array.from(this.boards.get(shareId)?.values() ?? []);
  }
}

const mockCollStore = MockSharedCollectionStore.getInstance();

interface ShareCollectionInput {
  collection: CollectionType;
  boards: Dashboard[];
  hostUid: string;
  hostDisplayName: string | null;
}

/**
 * The share's shape as the sub will walk it: one section per collection in the
 * tree, boards named and ordered (docs/plans/SUB_SHARE_COLLECTIONS.md §3.1).
 * Built on the teacher's client by `utils/subShareSnapshot`.
 */
export interface SubShareTree {
  kind: SharedCollectionKind;
  sections: SharedCollectionSection[];
  boardEntries: SharedCollectionBoardEntry[];
  defaultBoardId?: string;
}

type SubstituteShareInput = ShareCollectionInput &
  CollectionSubstituteShareInput &
  SubShareTree & {
    /** The Board or Collection the share was made from. */
    sourceId: string;
    /**
     * Resolved Drive permission grants. The caller (DashboardContext's
     * `shareSubstituteCollection`) performs the actual Drive `permissions.create`
     * calls BEFORE invoking this write, so the share doc lands with the grants
     * atomically — mirroring `shareSubstituteDashboard`. May be omitted when
     * no rosters are shared.
     */
    driveGrants?: SubstituteShareDriveGrant[];
    /** Called with what was and was not bundled, for the teacher to see. */
    onBundle?: (bundle: SubShareBundle) => void;
    /** Reads and writes the share's names file; omitted when Drive is absent. */
    names?: SubShareNamesServices;
  };

/**
 * Commit every Board snapshot under `/shared_collections/{shareId}/boards/`
 * in chunked batches. Parent doc is assumed already written by the caller.
 *
 * On batch failure: log with rich context (boards committed so far, total,
 * which batch was in-flight) and attempt a best-effort cleanup of the
 * partially-populated share — delete the parent doc so the recipient gets
 * "not-found" instead of a half-populated share with no warning. Re-throws
 * a descriptive error so the modal's catch can surface it to the host as
 * a real failure instead of returning a share URL that won't fully load.
 */
/**
 * Writes the bundled content docs, and clears out any the new push dropped.
 * Content is written after the boards for the same reason the boards go after
 * the parent: the rule reads the parent's hostUid.
 */
async function commitContentBatches({
  shareId,
  items,
  keys,
  previousIds,
  previousKeyIds,
  failedIds,
}: {
  shareId: string;
  items: SubShareBundleItem[];
  /** Answer keys, which go to `keys/` and are read-gated to the named subs. */
  keys?: SubShareBundleItem[];
  previousIds?: string[];
  previousKeyIds?: string[];
  failedIds?: string[];
}): Promise<void> {
  const BATCH_LIMIT = 400;
  // An item this push could not read keeps its last good copy: deleting it
  // would turn a network blip into an empty widget on the sub's screen.
  const failed = failedIds ?? [];
  const keep = new Set([...items.map((i) => i.id), ...failed]);
  const keepKeys = new Set([...(keys ?? []).map((i) => i.id), ...failed]);
  const stale = (previousIds ?? []).filter((id) => !keep.has(id));
  const staleKeys = (previousKeyIds ?? []).filter((id) => !keepKeys.has(id));
  const writes: (() => void)[] = [];
  let batch = writeBatch(db);
  let inBatch = 0;

  const contentRef = (id: string) =>
    doc(db, SHARED_COLLECTIONS_SUBPATH, shareId, 'content', id);
  const keyRef = (id: string) =>
    doc(db, SHARED_COLLECTIONS_SUBPATH, shareId, 'keys', id);

  for (const item of items) {
    writes.push(() => batch.set(contentRef(item.id), item.doc));
  }
  for (const item of keys ?? []) {
    writes.push(() => batch.set(keyRef(item.id), item.doc));
  }
  for (const id of stale) {
    writes.push(() => batch.delete(contentRef(id)));
  }
  for (const id of staleKeys) {
    writes.push(() => batch.delete(keyRef(id)));
  }

  for (const write of writes) {
    if (inBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      inBatch = 0;
    }
    write();
    inBatch += 1;
  }
  if (inBatch > 0) await batch.commit();
}

async function commitBoardBatches({
  shareId,
  boards,
  scope,
}: {
  shareId: string;
  boards: Dashboard[];
  scope: 'shareCollection' | 'shareSubstituteCollection' | 'updateSubShare';
}): Promise<void> {
  // A sub is looking at the teacher's board for the day, so a substitute
  // snapshot keeps the pen marks and groups a recipient copy drops.
  const sanitize =
    scope === 'shareCollection'
      ? sanitizeBoardForRecipient
      : sanitizeBoardForSubShare;
  const BATCH_LIMIT = 400;
  let currentBatch = writeBatch(db);
  let inBatch = 0;
  let boardsCommitted = 0;

  try {
    for (const board of boards) {
      if (inBatch >= BATCH_LIMIT) {
        await currentBatch.commit();
        boardsCommitted += inBatch;
        currentBatch = writeBatch(db);
        inBatch = 0;
      }
      const boardRef = doc(
        db,
        SHARED_COLLECTIONS_SUBPATH,
        shareId,
        SHARED_COLLECTION_BOARDS_SUBPATH,
        board.id
      );
      const boardPayload: SharedCollectionBoardDoc = {
        boardId: board.id,
        dashboard: sanitize(board),
      };
      currentBatch.set(boardRef, boardPayload);
      inBatch += 1;
    }
    if (inBatch > 0) {
      await currentBatch.commit();
      boardsCommitted += inBatch;
    }
  } catch (err) {
    logError(`useSharedCollection.${scope}.boardBatch`, err, {
      shareId,
      boardsCommitted,
      totalBoards: boards.length,
    });
    // Best-effort cleanup: drop the parent doc so the share fails fast as
    // "not-found" rather than presenting a partially-populated Collection
    // to the recipient. If cleanup itself fails, log and continue — the
    // original failure is the one we re-throw.
    try {
      // Only a failed CREATE leaves a share worth dropping; an update failure
      // must leave the teacher's live share alone.
      if (scope !== 'updateSubShare') {
        const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
        await deleteDoc(parentRef);
      }
    } catch (cleanupErr) {
      logError(`useSharedCollection.${scope}.partialCleanup`, cleanupErr, {
        shareId,
        boardsCommitted,
      });
    }
    const cause = err instanceof Error ? err.message : String(err);
    // A failed create is gone; a failed re-push left the share standing with
    // some boards new and some still the old ones, so it says so.
    const outcome =
      scope === 'updateSubShare'
        ? 'Your sub still has the share, with some boards not yet updated — try again.'
        : 'The share has been cancelled — please try again.';
    throw new Error(
      `Failed to upload all boards (${boardsCommitted.toString()} of ${boards.length.toString()} committed). ${outcome} (${cause})`
    );
  }
}

/**
 * The names the boards carry, plus each live Next Up queue and each open
 * wall's approved posts, all of them student names and so bound for the
 * named-subs file too.
 */
async function collectSubShareNames(
  boards: Dashboard[],
  services: SubShareNamesServices | undefined
) {
  const queued = await withSubShareQueues(
    extractSubShareNames(boards),
    boards,
    services?.readQueue
  );
  const walled = await withSubShareWallPosts(
    queued.names,
    boards,
    services?.readWallPosts
  );
  const unreadable = [...queued.unreadable, ...walled.unreadable];
  if (unreadable.length > 0) services?.onIncomplete?.(unreadable);
  return walled.names;
}

/** Union of two grant lists, keyed on the (email, file, permission) triple. */
function mergeDriveGrants(
  current: SubstituteShareDriveGrant[] | undefined,
  next: SubstituteShareDriveGrant[]
): SubstituteShareDriveGrant[] {
  const merged = [...(current ?? [])];
  const seen = new Set(
    merged.map((g) => `${g.email}|${g.fileId}|${g.permissionId}`)
  );
  for (const grant of next) {
    const key = `${grant.email}|${grant.fileId}|${grant.permissionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(grant);
  }
  return merged;
}

export const useSharedCollection = () => {
  const { ensureGoogleScope, googleAccessToken, user } = useAuth();
  const hostUid = user?.uid;

  /**
   * The Google reads only the teacher's session can make. Non-interactive:
   * a consent popup on top of the share dialog would interrupt the share, so
   * a teacher who never granted Calendar gets a "couldn't be read" line on the
   * share screen instead, and their own widget still offers the connect CTA.
   */
  const bundleServices = useCallback(
    async (boards: Dashboard[]): Promise<SubShareBundleServices> => {
      // Each reader is fetched only when a board wants it: sharing is a hot
      // action, and a GIS round-trip nothing will read is pure latency. They
      // are independent, so a teacher who never granted Calendar still gets
      // their video activities bundled.
      const calendarToken = subShareNeedsCalendar(boards)
        ? await ensureGoogleScope('calendar.readonly')
        : null;
      // `drive.file` is granted at login, so Drive needs no on-demand scope.
      // Each widget family keeps its own Drive service, so the share builds
      // both rather than inventing a third.
      const needsDrive = subShareNeedsDrive(boards);
      const driveArg = isAuthBypass ? hostUid : googleAccessToken;
      const drive = !needsDrive || !driveArg ? null : driveArg;
      const quizDrive = !drive
        ? null
        : isAuthBypass
          ? new MockQuizDriveService(drive)
          : new QuizDriveService(drive);
      const glDrive = !drive
        ? null
        : isAuthBypass
          ? new MockGuidedLearningDriveService(drive)
          : new GuidedLearningDriveService(drive);
      return {
        ...(calendarToken
          ? {
              readCalendar: (
                id: string,
                timeMin: string,
                timeMax: string
              ): Promise<CalendarEvent[]> =>
                new GoogleCalendarService(calendarToken).getEvents(
                  id,
                  timeMin,
                  timeMax
                ),
            }
          : {}),
        ...(quizDrive
          ? {
              loadVideoActivity: async (
                fileId: string
              ): Promise<VideoActivityData> => {
                const raw = (await quizDrive.loadQuiz(fileId)) as unknown as
                  | VideoActivityData
                  | undefined;
                if (!raw) throw new Error('video activity file was empty');
                // An older client may have written questions with no `type`.
                return {
                  ...raw,
                  questions: normalizeVideoActivityQuestions(raw.questions),
                };
              },
            }
          : {}),
        ...(glDrive
          ? {
              loadGuidedLearningSet: (
                fileId: string
              ): Promise<GuidedLearningSet> => glDrive.loadSet(fileId),
            }
          : {}),
      };
    },
    [ensureGoogleScope, googleAccessToken, hostUid]
  );

  /**
   * Host action: write the share metadata + every Board snapshot in a
   * chunked writeBatch. Returns the new shareId.
   *
   * Write order: parent doc FIRST, then board sub-docs in chunked batches.
   * The Firestore subcollection rule reads `parent.hostUid` to authorise
   * board writes — without the parent doc the rule expression cannot
   * evaluate and the write is denied. Auth-bypass (E2E) skips Firestore
   * rules, which is why parent-last slipped through testing.
   *
   * If a board batch fails after the parent lands, `commitBoardBatches`
   * attempts a best-effort cleanup of the parent doc and re-throws —
   * the recipient should see "not-found" rather than a partial Collection.
   * The pre-existing partial-load detection in importSharedCollection
   * remains as a second line of defence for any stale state that escapes
   * cleanup.
   */
  const shareCollection = useCallback(
    async (input: ShareCollectionInput): Promise<string> => {
      const shareId = crypto.randomUUID();
      const now = Date.now();

      const parentPayload: SharedCollection = {
        shareId,
        hostUid: input.hostUid,
        hostDisplayName: input.hostDisplayName,
        intendedMode: 'copy',
        collection: {
          name: input.collection.name,
          ...(input.collection.color !== undefined && {
            color: input.collection.color,
          }),
          ...(input.collection.icon !== undefined && {
            icon: input.collection.icon,
          }),
        },
        boardIds: input.boards.map((b) => b.id),
        createdAt: now,
      };

      if (isAuthBypass) {
        mockCollStore.save(shareId, parentPayload, input.boards);
        return shareId;
      }

      // Write the parent doc FIRST. The subcollection rule reads
      // parent.hostUid to authorize board writes; without an existing
      // parent doc, board batches are denied by Firestore rules.
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const parentBatch = writeBatch(db);
      parentBatch.set(parentRef, parentPayload);
      await parentBatch.commit();

      await commitBoardBatches({
        shareId,
        boards: input.boards,
        scope: 'shareCollection',
      });

      return shareId;
    },
    []
  );

  /**
   * Host action: substitute variant. Same parent-first write strategy as
   * shareCollection. Adds `expiresAt` + `buildingId` and sets
   * `intendedMode: 'substitute'` on the parent payload.
   *
   * Drive grants: the caller resolves them (Drive `permissions.create`) BEFORE
   * calling this and passes them in as `input.driveGrants`; they're persisted
   * on the parent doc (share-level — a roster file is granted once per
   * (file, email), not per board). The expiry sweeps
   * (`useReconcileExpiredSubShares` + `expireSubShares`) revoke them. This
   * mirrors the single-board `shareSubstituteDashboard` flow.
   *
   * See shareCollection for the write-order rationale (parent first, then
   * board sub-docs — the subcollection rule reads parent.hostUid).
   */
  const shareSubstituteCollection = useCallback(
    async (input: SubstituteShareInput): Promise<string> => {
      const shareId = crypto.randomUUID();
      const now = Date.now();

      // Student names the board snapshots are scrubbed of, before the parent
      // doc: the doc has to land with the file id and its grants together, or
      // the sweep would have nothing to revoke.
      const names = await collectSubShareNames(input.boards, input.names);
      const namesWrite = subShareNamesIsEmpty(names)
        ? null
        : ((await input.names?.write(shareId, names)) ?? null);
      const allGrants = [
        ...(input.driveGrants ?? []),
        ...(namesWrite?.driveGrants ?? []),
      ];

      const parentPayload: SharedCollection = {
        shareId,
        hostUid: input.hostUid,
        hostDisplayName: input.hostDisplayName,
        intendedMode: 'substitute',
        collection: {
          name: input.collection.name,
          ...(input.collection.color !== undefined && {
            color: input.collection.color,
          }),
          ...(input.collection.icon !== undefined && {
            icon: input.collection.icon,
          }),
        },
        boardIds: input.boards.map((b) => b.id),
        createdAt: now,
        expiresAt: input.expiresAt,
        buildingId: input.buildingId,
        ...(input.subEmails && input.subEmails.length > 0
          ? { subEmails: input.subEmails }
          : {}),
        ...(allGrants.length > 0 ? { driveGrants: allGrants } : {}),
        ...(input.sharedRosters && input.sharedRosters.length > 0
          ? { sharedRosters: input.sharedRosters }
          : {}),
        ...(namesWrite ? { namesFileId: namesWrite.driveFileId } : {}),
        kind: input.kind,
        sourceId: input.sourceId,
        sections: input.sections,
        boards: input.boardEntries,
        ...(input.defaultBoardId !== undefined && {
          defaultBoardId: input.defaultBoardId,
        }),
        contentVersion: 1,
        updatedAt: now,
      };

      if (isAuthBypass) {
        mockCollStore.save(shareId, parentPayload, input.boards);
        return shareId;
      }

      // Write the parent doc FIRST. The subcollection rule reads
      // parent.hostUid to authorize board writes; without an existing
      // parent doc, board batches are denied by Firestore rules.
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const parentBatch = writeBatch(db);
      parentBatch.set(parentRef, parentPayload);
      await parentBatch.commit();

      await commitBoardBatches({
        shareId,
        boards: input.boards,
        scope: 'shareSubstituteCollection',
      });

      // Widget data the sub cannot reach in their own account. Reported, not
      // thrown: a board that reaches the sub without its strokes still beats
      // no share at all, and the caller shows the teacher what was missed.
      const bundle = await bundleSubShareContent({
        hostUid: input.hostUid,
        boards: input.boards,
        services: await bundleServices(input.boards),
      });
      await commitContentBatches({
        shareId,
        items: bundle.items,
        keys: bundle.keys,
      });
      input.onBundle?.(bundle);

      return shareId;
    },
    [bundleServices]
  );

  /**
   * Host action: re-push the current boards into an existing sub share — same
   * link, same /subs entry (D1). Boards dropped from the collection since the
   * last push are deleted; `contentVersion` is bumped so an open /subs session
   * knows to offer a reload.
   */
  const updateSubstituteShare = useCallback(
    async (
      input: SubShareTree & {
        shareId: string;
        collection: CollectionType;
        boards: Dashboard[];
        expiresAt?: number;
        subEmails?: string[];
        driveGrants?: SubstituteShareDriveGrant[];
        sharedRosters?: SubstituteShareRoster[];
        onBundle?: (bundle: SubShareBundle) => void;
        names?: SubShareNamesServices;
      }
    ): Promise<void> => {
      const { shareId } = input;
      const now = Date.now();
      const boardIds = input.boards.map((b) => b.id);

      if (isAuthBypass) {
        const meta = mockCollStore.getCollection(shareId);
        if (!meta) throw new Error('Share not found');
        mockCollStore.save(
          shareId,
          {
            ...meta,
            boardIds,
            kind: input.kind,
            sections: input.sections,
            boards: input.boardEntries,
            contentVersion: (meta.contentVersion ?? 1) + 1,
            updatedAt: now,
          },
          input.boards
        );
        return;
      }

      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const snap = await getDoc(parentRef);
      if (!snap.exists()) throw new Error('Share not found');
      const current = snap.data() as SharedCollection;

      // The grant ledger only ever grows while a share lives: it is what the
      // expiry sweep revokes, and a pair dropped from it is a Drive permission
      // nothing would ever take back.
      // An existing file is rewritten even when the boards now hold no names,
      // so a roster the teacher removed stops reaching the sub.
      const names = await collectSubShareNames(input.boards, input.names);
      const namesWrite =
        current.namesFileId || !subShareNamesIsEmpty(names)
          ? ((await input.names?.write(shareId, names, current.namesFileId)) ??
            null)
          : null;
      const incomingGrants = [
        ...(input.driveGrants ?? []),
        ...(namesWrite?.driveGrants ?? []),
      ];
      const mergedGrants =
        incomingGrants.length > 0
          ? mergeDriveGrants(current.driveGrants, incomingGrants)
          : undefined;

      const parentBatch = writeBatch(db);
      parentBatch.update(parentRef, {
        boardIds,
        kind: input.kind,
        sections: input.sections,
        boards: input.boardEntries,
        collection: {
          name: input.collection.name,
          ...(input.collection.color !== undefined && {
            color: input.collection.color,
          }),
          ...(input.collection.icon !== undefined && {
            icon: input.collection.icon,
          }),
        },
        updatedAt: now,
        expiresAt: input.expiresAt ?? current.expiresAt,
        ...(input.defaultBoardId !== undefined && {
          defaultBoardId: input.defaultBoardId,
        }),
        ...(input.subEmails ? { subEmails: input.subEmails } : {}),
        ...(mergedGrants ? { driveGrants: mergedGrants } : {}),
        ...(input.sharedRosters ? { sharedRosters: input.sharedRosters } : {}),
        ...(namesWrite ? { namesFileId: namesWrite.driveFileId } : {}),
      });
      await parentBatch.commit();

      await commitBoardBatches({
        shareId,
        boards: input.boards,
        scope: 'updateSubShare',
      });

      const bundle = await bundleSubShareContent({
        hostUid: current.hostUid,
        boards: input.boards,
        services: await bundleServices(input.boards),
      });
      // What the last push bundled, read back rather than tracked on the
      // parent doc: the host can list it, and a list that drifts from the docs
      // themselves would leave a stale drawing on the sub's screen.
      const [existing, existingKeys] = await Promise.all([
        getDocs(collection(db, SHARED_COLLECTIONS_SUBPATH, shareId, 'content')),
        getDocs(collection(db, SHARED_COLLECTIONS_SUBPATH, shareId, 'keys')),
      ]);
      await commitContentBatches({
        shareId,
        items: bundle.items,
        keys: bundle.keys,
        previousIds: existing.docs.map((d) => d.id),
        previousKeyIds: existingKeys.docs.map((d) => d.id),
        failedIds: bundle.failures.map((f) =>
          subShareContentId(f.kind, f.itemId)
        ),
      });
      input.onBundle?.(bundle);

      // Boards the teacher removed from the collection since the last push.
      const stale = (current.boardIds ?? []).filter(
        (id) => !boardIds.includes(id)
      );
      if (stale.length > 0) {
        const cleanup = writeBatch(db);
        for (const id of stale) {
          cleanup.delete(
            doc(
              db,
              SHARED_COLLECTIONS_SUBPATH,
              shareId,
              SHARED_COLLECTION_BOARDS_SUBPATH,
              id
            )
          );
        }
        await cleanup.commit();
      }

      // Last, because the sub watches this live and reloads on it: bumping it
      // before the content is written serves them an empty widget they cannot
      // retry out of.
      const versionBatch = writeBatch(db);
      versionBatch.update(parentRef, {
        contentVersion: (current.contentVersion ?? 1) + 1,
      });
      await versionBatch.commit();
    },
    [bundleServices]
  );

  /** Host action: push the expiry out, capped at 14 days from now (D11). */
  const extendSubstituteShare = useCallback(
    async (shareId: string, expiresAt: number): Promise<void> => {
      if (isAuthBypass) {
        const meta = mockCollStore.getCollection(shareId);
        if (meta) {
          mockCollStore.save(
            shareId,
            { ...meta, expiresAt, updatedAt: Date.now() },
            mockCollStore.getBoards(shareId)
          );
        }
        return;
      }
      const batch = writeBatch(db);
      batch.update(doc(db, SHARED_COLLECTIONS_SUBPATH, shareId), {
        expiresAt,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    []
  );

  /**
   * Host action: end a share now. Stamping the expiry in the past is what
   * actually cuts the sub off — every read rule gates on it — and it hands the
   * share to the existing expiry sweep, which revokes the Drive grants no other
   * active share still references and deletes the docs. Deleting here instead
   * would drop the grant records with them and leave a sub holding roster
   * access. The caller runs the sweep straight after.
   */
  const expireSubstituteShare = useCallback(
    async (shareId: string): Promise<void> => {
      if (isAuthBypass) return;
      const batch = writeBatch(db);
      batch.update(doc(db, SHARED_COLLECTIONS_SUBPATH, shareId), {
        expiresAt: Date.now() - 1,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    []
  );

  /**
   * Host action: the teacher's own live sub shares, most recently touched
   * first. Filtered on `hostUid` alone — the single-field index every project
   * has — with mode and expiry filtered here so no composite index is needed.
   */
  const listHostSubShares = useCallback(
    async (hostUid: string): Promise<SharedCollection[]> => {
      if (isAuthBypass) return [];
      try {
        const snap = await getDocs(
          query(
            collection(db, SHARED_COLLECTIONS_SUBPATH),
            where('hostUid', '==', hostUid)
          )
        );
        const now = Date.now();
        return snap.docs
          .map((d) => d.data() as SharedCollection)
          .filter(
            (c) => c.intendedMode === 'substitute' && (c.expiresAt ?? 0) > now
          )
          .sort(
            (a, b) =>
              (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
          );
      } catch (err) {
        logError('useSharedCollection.listHostSubShares', err, { hostUid });
        return [];
      }
    },
    []
  );

  /**
   * Recipient action: fetch the share metadata doc.
   *
   * Returns a discriminated result so callers can distinguish definitively
   * "share doesn't exist" / "share has expired" from "we couldn't determine
   * its state" (rules denied, network failure, malformed payload). The
   * three failure cases warrant different user messaging — a teacher who
   * gets `unauthorized` should re-authenticate / contact the host, while
   * `not-found` means the link is invalid. Logs errors via logError so
   * production failures still surface in telemetry.
   */
  const loadSharedCollection = useCallback(
    async (shareId: string): Promise<LoadSharedCollectionResult> => {
      if (isAuthBypass) {
        const meta = mockCollStore.getCollection(shareId);
        if (!meta) return { ok: false, reason: 'not-found' };
        if (
          meta.intendedMode === 'substitute' &&
          meta.expiresAt &&
          meta.expiresAt < Date.now()
        ) {
          return { ok: false, reason: 'expired' };
        }
        return { ok: true, meta };
      }
      try {
        const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
        const snap = await getDoc(parentRef);
        if (!snap.exists()) return { ok: false, reason: 'not-found' };
        const data = snap.data() as SharedCollection;
        if (
          data.intendedMode === 'substitute' &&
          data.expiresAt &&
          data.expiresAt < Date.now()
        ) {
          return { ok: false, reason: 'expired' };
        }
        return { ok: true, meta: data };
      } catch (err) {
        logError('useSharedCollection.loadSharedCollection', err, { shareId });
        // Firestore SDK errors expose `code` on the rejection. A
        // `permission-denied` code means rules rejected the read — the
        // share likely exists but the recipient can't see it (e.g. token
        // expired, building scope mismatch). Distinguish so the caller can
        // tell the user to re-auth instead of "share doesn't exist".
        const code =
          err && typeof err === 'object' && 'code' in err
            ? (err as { code?: unknown }).code
            : undefined;
        if (code === 'permission-denied') {
          return { ok: false, reason: 'unauthorized' };
        }
        return { ok: false, reason: 'error' };
      }
    },
    []
  );

  /**
   * Recipient action: fetch every frozen Board snapshot in the share.
   * Order respects the parent's `boardIds[]` so the recipient sees the
   * same ordering as the host had at share time. Single `getDocs` query
   * is cheaper than N parallel `getDoc` calls for moderate Collection
   * sizes (< 30 Boards).
   */
  const loadSharedCollectionBoards = useCallback(
    async (shareId: string, boardIds: string[]): Promise<Dashboard[]> => {
      if (isAuthBypass) {
        try {
          const allBoards = mockCollStore.getBoards(shareId);
          const byId = new Map(allBoards.map((b) => [b.id, b]));
          return boardIds
            .map((id) => byId.get(id))
            .filter((d): d is Dashboard => Boolean(d));
        } catch (err) {
          logError('useSharedCollection.loadSharedCollectionBoards', err, {
            shareId,
            boardIdCount: boardIds.length,
          });
          return [];
        }
      }
      try {
        const colRef = collection(
          db,
          SHARED_COLLECTIONS_SUBPATH,
          shareId,
          SHARED_COLLECTION_BOARDS_SUBPATH
        );
        const snap = await getDocs(colRef);
        const byId = new Map<string, Dashboard>();
        for (const d of snap.docs) {
          const data = d.data() as SharedCollectionBoardDoc;
          byId.set(d.id, data.dashboard);
        }
        return boardIds
          .map((id) => byId.get(id))
          .filter((d): d is Dashboard => Boolean(d));
      } catch (err) {
        logError('useSharedCollection.loadSharedCollectionBoards', err, {
          shareId,
          boardIdCount: boardIds.length,
        });
        return [];
      }
    },
    []
  );

  return {
    shareCollection,
    shareSubstituteCollection,
    updateSubstituteShare,
    extendSubstituteShare,
    expireSubstituteShare,
    listHostSubShares,
    loadSharedCollection,
    loadSharedCollectionBoards,
  };
};
