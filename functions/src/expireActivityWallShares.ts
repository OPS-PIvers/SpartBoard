/**
 * Hourly sweep that re-locks an Activity Wall session once every gallery
 * share pointing at it has lapsed (expired or revoked).
 *
 * `components/widgets/ActivityWall/ShareModal.tsx` flips
 * `publiclyShared: true` onto `activity_wall_sessions/{sessionId}` when a
 * teacher creates a `shared_activity_walls/{shareId}` gallery link — that
 * flag is what unlocks the `submissions` subcollection read (firestore.rules)
 * and the `activity_wall_photos/{sessionId}/*` Storage read for anonymous
 * gallery viewers. Firestore rules cannot look up "is there a live share for
 * this session" directly (rules only support `get()`/`exists()` on an EXACT
 * document path, not a query, and shareId is an unrelated random UUID — not
 * derived from sessionId), so `publiclyShared` has to be a server-maintained
 * mirror of "does at least one live share exist".
 *
 * The share doc itself is correctly gated on `revoked`/`expiresAt` at read
 * time (see `a55c956` / #2242), and the client only *subscribes* to
 * submissions after confirming the share is live (`ActivityWallGalleryView`).
 * But nothing ever flipped `publiclyShared` back to `false` — so a caller who
 * captured `sessionId` from the share doc while it was live (e.g. browser
 * devtools, or a saved Firestore SDK snippet) could keep reading every
 * submission (text + photo storage paths) and downloading every photo
 * directly, forever, even after the teacher's chosen expiration date passed.
 * A permanent share (`expiresAt: null`) is untouched by this sweep — that's
 * the intended "never expires" case.
 *
 * Modeled on `expireSubShares.ts` / `gcPlcOrphans.ts`: an `onSchedule`
 * function with pinned `memory`/`timeZone` and a per-run cap. Unlike those
 * sweeps, this one does NOT delete the share doc — the owner/admin can still
 * read a lapsed share for management (mirrors the sibling rule), so only the
 * session-level unlock flag is corrected.
 *
 * Both `shared_activity_walls` lookups (expired-by-date, revoked) are
 * PAGINATED (startAfter cursor on `orderBy(FieldPath.documentId())`, mirrors
 * `gcPlcOrphans.ts`'s fix for the identical bug) so every lapsed share up to
 * `MAX_LAPSED_SHARES_PER_RUN` is visited every run — not just the first
 * `LAPSED_SHARE_PAGE_SIZE`. Share docs are never deleted (see above), so a
 * single un-paginated `.limit()` page meant that once more than one page of
 * lapsed shares accumulated, the same top page (by document-ID order) was
 * reprocessed every run and any session whose only lapsed share sorted past
 * the cap was NEVER relocked, forever.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import './functionsInit';

/**
 * Overall safety ceiling on lapsed shares visited per run (per query) — a
 * runaway guard, NOT an expected limit. The sweep paginates (see
 * `LAPSED_SHARE_PAGE_SIZE`), so every lapsed share up to this ceiling is
 * covered every run; set far above any realistic accumulation.
 */
export const MAX_LAPSED_SHARES_PER_RUN = 5000;

/** Page size for the paginated lapsed-share sweeps (startAfter cursor on document id). */
export const LAPSED_SHARE_PAGE_SIZE = 500;

type Firestore = admin.firestore.Firestore;
type QueryDocSnap = admin.firestore.QueryDocumentSnapshot;

interface SharedActivityWallData {
  sessionId?: unknown;
  expiresAt?: unknown;
  revoked?: unknown;
}

/**
 * A share has lapsed when it's explicitly revoked OR its `expiresAt` is a
 * number in the past. `expiresAt: null`/absent means "permanent" and never
 * lapses on its own.
 */
export function isLapsedShare(
  data: SharedActivityWallData,
  now: number
): boolean {
  if (data.revoked === true) return true;
  return typeof data.expiresAt === 'number' && data.expiresAt <= now;
}

/** Extracts a valid non-empty `sessionId` string, or null if malformed/missing. */
function sessionIdOf(data: SharedActivityWallData): string | null {
  return typeof data.sessionId === 'string' && data.sessionId.length > 0
    ? data.sessionId
    : null;
}

/**
 * Paginates a `shared_activity_walls` query up to `MAX_LAPSED_SHARES_PER_RUN`
 * using a `startAfter` cursor, `LAPSED_SHARE_PAGE_SIZE` docs at a time. The
 * inequality query (expired-by-date) must `orderBy` the filtered field before
 * any tiebreaker (a Firestore requirement for range queries), so the caller
 * supplies the ordering; the equality query (revoked) orders by document id
 * alone. Either way, `startAfter` takes the cursor's ordering-field values
 * from the last doc of the previous page, so pagination is correct regardless
 * of which fields are ordered on.
 */
async function fetchLapsedSharesPaginated(
  db: Firestore,
  buildQuery: (page: admin.firestore.Query) => admin.firestore.Query
): Promise<QueryDocSnap[]> {
  const results: QueryDocSnap[] = [];
  let lastDoc: QueryDocSnap | undefined;
  let visited = 0;
  while (visited < MAX_LAPSED_SHARES_PER_RUN) {
    let query = buildQuery(db.collection('shared_activity_walls')).limit(
      LAPSED_SHARE_PAGE_SIZE
    );
    if (lastDoc) query = query.startAfter(lastDoc);
    const page = await query.get();
    if (page.size === 0) break;

    results.push(...page.docs);
    visited += page.size;
    lastDoc = page.docs[page.docs.length - 1];
    if (page.size < LAPSED_SHARE_PAGE_SIZE) break;
  }
  if (visited >= MAX_LAPSED_SHARES_PER_RUN) {
    // Fires when the loop exited on the ceiling rather than because pages ran
    // out. If exactly MAX docs existed and the final page was full, every doc
    // was in fact processed this run — but we can't distinguish that from
    // "more remain" without another query, so we warn conservatively. Oncall:
    // this means the ceiling was reached, not necessarily that docs were missed.
    console.warn(
      `[expireActivityWallShares] hit MAX_LAPSED_SHARES_PER_RUN ceiling (${MAX_LAPSED_SHARES_PER_RUN}) — raise it or shard the sweep`
    );
  }
  return results;
}

/**
 * Core sweep, extracted from the scheduler wrapper so it can be exercised
 * against a stub Firestore in tests (mirrors `runGcPlcOrphans`).
 *
 * 1. Find every `shared_activity_walls` doc that is revoked OR past its
 *    `expiresAt` (two single-field queries — no composite index needed),
 *    each PAGINATED (startAfter cursor) so every lapsed share up to
 *    `MAX_LAPSED_SHARES_PER_RUN` is found, not just the first page.
 * 2. Group the lapsed docs by `sessionId` (a session can have been shared
 *    more than once — teachers re-share rather than edit an existing link).
 * 3. For each affected session, re-check ALL its shares (not just the lapsed
 *    ones) — if none are still live, flip `publiclyShared` back to `false`.
 *    A session with even one still-live share is left untouched.
 */
export async function runExpireActivityWallShares(
  db: Firestore,
  now: number = Date.now()
): Promise<{ lapsedShares: number; sessionsRelocked: number }> {
  const [expiredDocs, revokedDocs] = await Promise.all([
    fetchLapsedSharesPaginated(db, (q) =>
      q
        .where('expiresAt', '<=', now)
        .orderBy('expiresAt')
        .orderBy(admin.firestore.FieldPath.documentId())
    ),
    fetchLapsedSharesPaginated(db, (q) =>
      q
        .where('revoked', '==', true)
        .orderBy(admin.firestore.FieldPath.documentId())
    ),
  ]);

  const lapsedById = new Map<string, QueryDocSnap>();
  for (const doc of [...expiredDocs, ...revokedDocs]) {
    lapsedById.set(doc.id, doc);
  }

  const sessionIds = new Set<string>();
  for (const doc of lapsedById.values()) {
    const sessionId = sessionIdOf(doc.data() as SharedActivityWallData);
    if (sessionId) sessionIds.add(sessionId);
  }

  let relocked = 0;
  for (const sessionId of sessionIds) {
    const allSharesSnap = await db
      .collection('shared_activity_walls')
      .where('sessionId', '==', sessionId)
      .get();
    const stillLive = allSharesSnap.docs.some(
      (doc) => !isLapsedShare(doc.data() as SharedActivityWallData, now)
    );
    if (stillLive) continue;

    // Expired share docs are never deleted, so every subsequent run
    // re-finds the same lapsed shares — skip the write once a session is
    // already relocked, or the write count grows forever with no bound.
    const sessionSnap = await db
      .collection('activity_wall_sessions')
      .doc(sessionId)
      .get();
    if (!sessionSnap.exists || sessionSnap.data()?.publiclyShared !== true) {
      continue;
    }

    // Known, accepted trade-off: the `allSharesSnap` read above and this
    // write are not wrapped in a transaction, so there is a millisecond-wide
    // TOCTOU window in which a teacher could create a fresh live share for
    // this session after `allSharesSnap` was captured. If that happens, this
    // sweep would relock a session that is once again legitimately shared, and
    // it would stay locked until the next hourly run re-evaluates it (it will
    // find the new live share and leave `publiclyShared` alone). Given the
    // hourly cadence and the sub-millisecond window, this self-heals within
    // one cycle and is intentionally left non-transactional for simplicity —
    // wrap the read+write in a Firestore transaction if this ever needs to be
    // airtight.
    try {
      await db
        .collection('activity_wall_sessions')
        .doc(sessionId)
        .update({ publiclyShared: false });
      relocked += 1;
    } catch (err) {
      // The session doc may have been deleted independently of its shares —
      // that's not an error for this sweep (nothing left to relock).
      const code = (err as { code?: number | string }).code;
      if (code !== 5 && code !== 'not-found') throw err;
    }
  }

  return { lapsedShares: lapsedById.size, sessionsRelocked: relocked };
}

export const expireActivityWallShares = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Chicago',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();
    const { lapsedShares, sessionsRelocked } =
      await runExpireActivityWallShares(db);
    console.log(
      `[expireActivityWallShares] found ${lapsedShares} lapsed share(s); relocked ${sessionsRelocked} session(s)`
    );
  }
);
