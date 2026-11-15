/**
 * Hourly sweep that deletes expired substitute-mode `/shared_boards` AND
 * `/shared_collections` docs so the substitute portal stays uncluttered and
 * stale snapshots don't sit in Firestore indefinitely.
 *
 * Collection shares additionally carry a `boards/` subcollection of frozen
 * Board snapshots; when a Collection parent is deleted, its board sub-docs are
 * deleted first so nothing is orphaned.
 *
 * Drive grants: the sweep revokes each expired share's `driveGrants` with the
 * host's stored offline grant (down-scoped to drive.file), skipping any
 * permission a live share of the same host still uses. A share whose grants
 * cannot be revoked (no stored grant, Drive error) is kept, never deleted, so
 * the host's own reconciler (`useReconcileExpiredSubShares`) still finds it and
 * prompts them; past the grace window it is also logged as a warning.
 *
 * PAGINATION: the expired-doc lookup PAGINATES (`startAfter` cursor on
 * `orderBy('expiresAt').orderBy(FieldPath.documentId())`, mirroring the
 * identical fix already applied to `gcPlcOrphans.ts` /
 * `expireActivityWallShares.ts` / `finalizeIdleQuizAttempts.ts`) up to
 * `MAX_SWEEP_PER_RUN` — a safety ceiling, not a page size. Docs held in the
 * 7-day Drive-grant grace window are matched by the query but deliberately
 * NOT deleted yet, so without pagination a single un-paginated `.limit()`
 * page would keep re-fetching the SAME arbitrary doc-id-ordered slice every
 * hour (a query with no explicit `orderBy` is NOT implicitly sorted by the
 * inequality field — it falls back to document-id order, confirmed by the
 * identical bug already found/fixed in `expireActivityWallShares.ts`,
 * #2268). Once the count of matching-but-still-in-grace docs exceeded one
 * page, any genuinely-older expired share whose doc id happened to sort
 * past that page would never be reached by this sweep — permanently
 * stranding its `driveGrants` past the intended 7-day grace window with no
 * warning ever logged for it.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import axios from 'axios';
import * as admin from './firebaseAdmin';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
} from './secrets';

// Mirrors SHARE_SUBCOLLECTIONS in utils/subShareContent.ts; functions/ is its
// own package and cannot import from the app.
const SHARE_SUBCOLLECTIONS = ['boards', 'content', 'keys'] as const;

/**
 * Overall safety ceiling on expired docs visited per run (per collection) —
 * a runaway guard, NOT an expected limit. The fetch PAGINATES
 * (`SWEEP_PAGE_SIZE` pages, `startAfter` cursor), so every expired doc up to
 * this ceiling is visited every run — not just the first page.
 */
export const MAX_SWEEP_PER_RUN = 5000;

/** Page size for the paginated expired-doc fetch (`startAfter` cursor). */
export const SWEEP_PAGE_SIZE = 500;

/** Days before an unrevokable share is logged as needing an admin. */
const ORPHAN_GRACE_DAYS = 7;
const ORPHAN_GRACE_MS = ORPHAN_GRACE_DAYS * 24 * 60 * 60 * 1000;

interface SubstituteShareData {
  intendedMode?: string;
  expiresAt?: number;
  originalAuthor?: string;
  driveGrants?: Array<{
    email?: string;
    fileId?: string;
    permissionId?: string;
  }>;
}

type ExpiredDocSnap =
  FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

interface SweepResult {
  deleted: number;
  inGrace: number;
  orphanedGrants: number;
}

/** Drive calls the sweep makes as the host; injectable for tests. */
export interface GrantRevoker {
  /** The host's drive.file token, or null when no offline grant is stored. */
  getAccessToken: (hostUid: string) => Promise<string | null>;
  /** Null when the permission or file is already gone. */
  getPermission: (
    token: string,
    fileId: string,
    permissionId: string
  ) => Promise<{ type?: string; role?: string } | null>;
  deletePermission: (
    token: string,
    fileId: string,
    permissionId: string
  ) => Promise<void>;
  /** The file's name, or null when it is gone or trashed. */
  getFileName: (token: string, fileId: string) => Promise<string | null>;
  trashFile: (token: string, fileId: string) => Promise<void>;
}

/** No Drive access: every grant stays unrevoked (the pre-revoke behaviour). */
const NO_REVOKER: GrantRevoker = {
  getAccessToken: () => Promise.resolve(null),
  getPermission: () => Promise.resolve(null),
  deletePermission: () => Promise.resolve(),
  getFileName: () => Promise.resolve(null),
  trashFile: () => Promise.resolve(),
};

/** Per-run caches shared by both collection sweeps. */
interface RevokeContext {
  revoker: GrantRevoker;
  tokens: Map<string, Promise<string | null>>;
  live: Map<string, Promise<Set<string>>>;
}

/** permissionIds held by the host's still-live substitute shares, across both collections. */
function livePermissionIds(
  db: FirebaseFirestore.Firestore,
  ctx: RevokeContext,
  hostUid: string,
  now: number
): Promise<Set<string>> {
  let hit = ctx.live.get(hostUid);
  if (!hit) {
    hit = Promise.all([
      db
        .collection('shared_boards')
        .where('originalAuthor', '==', hostUid)
        .where('intendedMode', '==', 'substitute')
        .get(),
      db
        .collection('shared_collections')
        .where('hostUid', '==', hostUid)
        .where('intendedMode', '==', 'substitute')
        .get(),
    ]).then((snaps) => {
      const ids = new Set<string>();
      for (const d of snaps.flatMap((s) => s.docs)) {
        const data = d.data() as SubstituteShareData;
        if (!((data.expiresAt ?? 0) > now)) continue;
        for (const g of Array.isArray(data.driveGrants) ? data.driveGrants : [])
          if (g?.permissionId) ids.add(g.permissionId);
      }
      return ids;
    });
    ctx.live.set(hostUid, hit);
  }
  return hit;
}

/** Revokes one expired share's grants as the host; true when none is left standing. */
async function revokeShareGrants(
  db: FirebaseFirestore.Firestore,
  ctx: RevokeContext,
  doc: ExpiredDocSnap,
  hostUid: string | undefined,
  grants: NonNullable<SubstituteShareData['driveGrants']>,
  namesFileId: string | undefined,
  now: number
): Promise<boolean> {
  if (!hostUid) return false;
  let tokenP = ctx.tokens.get(hostUid);
  if (!tokenP) {
    tokenP = ctx.revoker.getAccessToken(hostUid).catch((err) => {
      console.warn(`[expireSubShares] no Drive token for ${hostUid}:`, err);
      return null;
    });
    ctx.tokens.set(hostUid, tokenP);
  }
  const token = await tokenP;
  if (!token) return false;
  try {
    const live = await livePermissionIds(db, ctx, hostUid, now);
    for (const g of grants) {
      if (!g?.fileId || !g.permissionId || live.has(g.permissionId)) continue;
      const perm = await ctx.revoker.getPermission(
        token,
        g.fileId,
        g.permissionId
      );
      // Only a user reader grant is ours to revoke, as the client reconciler does.
      if (!perm || perm.type !== 'user' || perm.role !== 'reader') continue;
      await ctx.revoker.deletePermission(token, g.fileId, g.permissionId);
    }
    if (namesFileId) {
      const name = await ctx.revoker.getFileName(token, namesFileId);
      if (name === `${doc.id}-names.json`) {
        await ctx.revoker.trashFile(token, namesFileId);
      }
    }
    return true;
  } catch (err) {
    console.warn(
      `[expireSubShares] Drive revoke failed for share ${doc.id}:`,
      err
    );
    return false;
  }
}

/**
 * Paginates the "expired substitute share" query for one collection up to
 * `MAX_SWEEP_PER_RUN`, `SWEEP_PAGE_SIZE` docs at a time, via a `startAfter`
 * cursor on `orderBy('expiresAt').orderBy(FieldPath.documentId())` (the
 * doc-id tiebreaker keeps pagination correct when multiple docs share an
 * identical `expiresAt`). Docs held in the Drive-grant grace window are
 * matched but not deleted, so without this cursor a single un-paginated page
 * would keep re-fetching the same doc-id-ordered slice forever once the
 * backlog exceeded one page — see the module header for the full history.
 */
async function fetchExpiredDocsPaginated(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  now: number
): Promise<ExpiredDocSnap[]> {
  const results: ExpiredDocSnap[] = [];
  let lastDoc: ExpiredDocSnap | undefined;
  while (results.length < MAX_SWEEP_PER_RUN) {
    const pageLimit = Math.min(
      SWEEP_PAGE_SIZE,
      MAX_SWEEP_PER_RUN - results.length
    );
    // Equality on intendedMode + range on expiresAt — requires a composite
    // index on (intendedMode ASC, expiresAt ASC); declared in
    // firestore.indexes.json for both collections.
    let query = db
      .collection(collectionName)
      .where('intendedMode', '==', 'substitute')
      .where('expiresAt', '<=', now)
      .orderBy('expiresAt', 'asc')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageLimit);
    if (lastDoc) query = query.startAfter(lastDoc);
    const page = await query.get();
    if (page.empty) break;
    results.push(...page.docs);
    lastDoc = page.docs[page.docs.length - 1];
    if (page.size < pageLimit) break;
  }
  if (results.length >= MAX_SWEEP_PER_RUN) {
    console.warn(
      `[expireSubShares] hit MAX_SWEEP_PER_RUN ceiling (${MAX_SWEEP_PER_RUN}) for ${collectionName} — raise it or shard the sweep`
    );
  }
  return results;
}

/**
 * Sweep one substitute-share collection. `hostField` is the doc field holding
 * the host uid (`originalAuthor` on /shared_boards, `hostUid` on
 * /shared_collections) — only used for logging. When `deleteBoardsSubcollection`
 * is set, each doc's `boards/` subcollection is reaped before the parent.
 */
async function sweepCollection(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  now: number,
  hostField: 'originalAuthor' | 'hostUid',
  deleteBoardsSubcollection: boolean,
  ctx: RevokeContext
): Promise<SweepResult> {
  const expiredDocs = await fetchExpiredDocsPaginated(db, collectionName, now);

  if (expiredDocs.length === 0) {
    console.log(`[expireSubShares] no expired substitute ${collectionName}`);
    return { deleted: 0, inGrace: 0, orphanedGrants: 0 };
  }

  // A doc is ready once it has no grants left standing; otherwise it is kept.
  const readyToDelete: ExpiredDocSnap[] = [];
  let stillInGrace = 0;
  let orphanedGrantCount = 0;

  for (const doc of expiredDocs) {
    const data = doc.data() as SubstituteShareData & {
      hostUid?: string;
      namesFileId?: unknown;
    };
    const grants = Array.isArray(data.driveGrants) ? data.driveGrants : [];
    const expiredAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
    const host = data[hostField];

    if (grants.length > 0) {
      // Only Collection shares write a names file, as the client reconciler checks.
      const namesFileId =
        deleteBoardsSubcollection && typeof data.namesFileId === 'string'
          ? data.namesFileId
          : undefined;
      const revoked = await revokeShareGrants(
        db,
        ctx,
        doc,
        typeof host === 'string' ? host : undefined,
        grants,
        namesFileId,
        now
      );
      if (!revoked) {
        if (expiredAt > now - ORPHAN_GRACE_MS) {
          stillInGrace += 1;
        } else {
          orphanedGrantCount += grants.length;
          console.warn(
            `[expireSubShares] KEEPING ${collectionName} share ${doc.id} (host ${host}) ` +
              `with ${grants.length} unrevoked Drive permissions until the host ` +
              `reconnects Drive. Manual revocation needed for: ` +
              grants
                .map((g) => `${g.email}@${g.fileId}:${g.permissionId}`)
                .join(', ')
          );
        }
        continue;
      }
    }
    readyToDelete.push(doc);
  }

  if (readyToDelete.length === 0) {
    console.log(
      `[expireSubShares] ${stillInGrace} expired ${collectionName} in grace window — waiting for host to clean up`
    );
    return {
      deleted: 0,
      inGrace: stillInGrace,
      orphanedGrants: orphanedGrantCount,
    };
  }

  // Collection parents carry boards/, content/ and keys/ sub-collections — reap
  // those sub-docs first so the parent delete doesn't orphan them. Done before
  // the batched parent delete because subcollections aren't cascaded.
  if (deleteBoardsSubcollection) {
    // Reap each parent's boards/ subcollection. Parallelize across parents
    // (with bounded concurrency) so a sweep that catches many expired
    // Collection shares — each with its own get() + batch-commit chain —
    // doesn't serialize toward the function timeout. The cap keeps us well
    // under Firestore's per-client connection limits rather than fanning out
    // all (up to MAX_SWEEP_PER_RUN) parents at once.
    const BOARD_CLEANUP_CONCURRENCY = 10;
    const boardBatchSize = 250;
    for (let i = 0; i < readyToDelete.length; i += BOARD_CLEANUP_CONCURRENCY) {
      const group = readyToDelete.slice(i, i + BOARD_CLEANUP_CONCURRENCY);
      await Promise.all(
        group.map(async (doc) => {
          for (const name of SHARE_SUBCOLLECTIONS) {
            const subSnap = await doc.ref.collection(name).get();
            if (subSnap.empty) continue;
            for (let j = 0; j < subSnap.docs.length; j += boardBatchSize) {
              const batch = db.batch();
              for (const b of subSnap.docs.slice(j, j + boardBatchSize)) {
                batch.delete(b.ref);
              }
              await batch.commit();
            }
          }
        })
      );
    }
  }

  // Batched delete of parents. Firestore caps each batch at 500 ops, so we
  // chunk defensively (readyToDelete can hold up to MAX_SWEEP_PER_RUN docs).
  const batchSize = 250;
  let deleted = 0;
  for (let i = 0; i < readyToDelete.length; i += batchSize) {
    const batch = db.batch();
    const chunk = readyToDelete.slice(i, i + batchSize);
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
    deleted += chunk.length;
  }

  console.log(
    `[expireSubShares] deleted ${deleted} expired substitute ${collectionName} ` +
      `(${stillInGrace} still in ${ORPHAN_GRACE_DAYS}-day grace window; ` +
      `${orphanedGrantCount} unrevoked Drive permissions kept past grace)`
  );
  return { deleted, inGrace: stillInGrace, orphanedGrants: orphanedGrantCount };
}

/**
 * Core sweep, extracted from the scheduler wrapper so it can be exercised
 * against a stub Firestore in tests (mirrors `runGcPlcOrphans` /
 * `runExpireActivityWallShares` / `runFinalizeIdleQuizAttempts`).
 */
export async function runExpireSubShares(
  db: FirebaseFirestore.Firestore,
  now: number = Date.now(),
  revoker: GrantRevoker = NO_REVOKER
): Promise<{ boards: SweepResult; collections: SweepResult }> {
  const ctx: RevokeContext = { revoker, tokens: new Map(), live: new Map() };
  // Run both sweeps independently: a failure in one (Firestore quota, a
  // batch-commit error, a missing index) must not abort the other and leave
  // its expired shares un-reaped for the hour.
  const [boardsResult, collectionsResult] = await Promise.allSettled([
    sweepCollection(db, 'shared_boards', now, 'originalAuthor', false, ctx),
    sweepCollection(db, 'shared_collections', now, 'hostUid', true, ctx),
  ]);
  const failures: unknown[] = [];
  if (boardsResult.status === 'rejected') {
    console.error(
      '[expireSubShares] shared_boards sweep failed:',
      boardsResult.reason
    );
    failures.push(boardsResult.reason);
  }
  if (collectionsResult.status === 'rejected') {
    console.error(
      '[expireSubShares] shared_collections sweep failed:',
      collectionsResult.reason
    );
    failures.push(collectionsResult.reason);
  }
  // Both sweeps have already completed (allSettled above guarantees neither
  // aborted the other), so re-throwing here is safe and surfaces a persistent
  // failure as a failed invocation — an error metric that can drive a Cloud
  // Monitoring alert — instead of a silent success that lets expired shares
  // accumulate until someone notices the logs.
  if (failures.length > 0) {
    throw new Error(
      `[expireSubShares] ${failures.length} sweep(s) failed; see logged reasons above.`
    );
  }
  return {
    boards: (boardsResult as PromiseFulfilledResult<SweepResult>).value,
    collections: (collectionsResult as PromiseFulfilledResult<SweepResult>)
      .value,
  };
}

export const expireSubShares = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Chicago',
    memory: '256MiB',
    timeoutSeconds: 540,
    secrets: [
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async () => {
    const db = admin.firestore();
    await runExpireSubShares(db, Date.now(), driveGrantRevoker());
  }
);

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_TIMEOUT_MS = 10_000;

function is404(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

/** Drive calls made with the host's own down-scoped token. */
function driveGrantRevoker(): GrantRevoker {
  const auth = (token: string) => ({
    headers: { Authorization: `Bearer ${token}` },
    timeout: DRIVE_TIMEOUT_MS,
  });
  const permUrl = (fileId: string, permissionId: string) =>
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`;
  return {
    getAccessToken: async (hostUid) => {
      const { DRIVE_FILE_SCOPE, refreshGoogleAccessTokenForUid } =
        await import('./googleOAuth');
      const { isNeedsConsentError } = await import('./quizMediaArchive');
      try {
        const { accessToken } = await refreshGoogleAccessTokenForUid(hostUid, {
          scope: DRIVE_FILE_SCOPE,
          keepStoredOnFailure: true,
        });
        return accessToken;
      } catch (err) {
        if (isNeedsConsentError(err)) return null;
        throw err;
      }
    },
    getPermission: async (token, fileId, permissionId) => {
      try {
        const res = await axios.get<{ type?: string; role?: string }>(
          permUrl(fileId, permissionId),
          {
            ...auth(token),
            params: { fields: 'id,type,role', supportsAllDrives: true },
          }
        );
        return res.data;
      } catch (err) {
        if (is404(err)) return null;
        throw err;
      }
    },
    deletePermission: async (token, fileId, permissionId) => {
      const { assertDevDriveWritable } = await import('./devDriveWriteGuard');
      await assertDevDriveWritable(token, fileId);
      try {
        await axios.delete(permUrl(fileId, permissionId), {
          ...auth(token),
          params: { supportsAllDrives: true },
        });
      } catch (err) {
        if (!is404(err)) throw err;
      }
    },
    getFileName: async (token, fileId) => {
      try {
        const res = await axios.get<{ name?: string; trashed?: boolean }>(
          `${DRIVE_FILES}/${encodeURIComponent(fileId)}`,
          {
            ...auth(token),
            params: { fields: 'name,trashed', supportsAllDrives: true },
          }
        );
        return res.data.trashed ? null : (res.data.name ?? null);
      } catch (err) {
        if (is404(err)) return null;
        throw err;
      }
    },
    trashFile: async (token, fileId) => {
      const { assertDevDriveWritable } = await import('./devDriveWriteGuard');
      await assertDevDriveWritable(token, fileId);
      await axios.patch(
        `${DRIVE_FILES}/${encodeURIComponent(fileId)}`,
        { trashed: true },
        { ...auth(token), params: { supportsAllDrives: true } }
      );
    },
  };
}
