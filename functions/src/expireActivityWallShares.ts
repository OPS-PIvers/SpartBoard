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
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import './functionsInit';

/** Cap per-run lapsed-share lookups to keep one slow sweep from monopolising. */
export const MAX_LAPSED_SHARES_PER_RUN = 500;

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
 * Core sweep, extracted from the scheduler wrapper so it can be exercised
 * against a stub Firestore in tests (mirrors `runGcPlcOrphans`).
 *
 * 1. Find every `shared_activity_walls` doc that is revoked OR past its
 *    `expiresAt` (two single-field queries — no composite index needed).
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
  const [expiredSnap, revokedSnap] = await Promise.all([
    db
      .collection('shared_activity_walls')
      .where('expiresAt', '<=', now)
      .limit(MAX_LAPSED_SHARES_PER_RUN)
      .get(),
    db
      .collection('shared_activity_walls')
      .where('revoked', '==', true)
      .limit(MAX_LAPSED_SHARES_PER_RUN)
      .get(),
  ]);

  const lapsedById = new Map<string, QueryDocSnap>();
  for (const doc of [...expiredSnap.docs, ...revokedSnap.docs]) {
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
