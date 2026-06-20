/**
 * Nightly PLC garbage-collection sweep (Wave 4 — PRD §5.3 / §3.4 / §3.1 /
 * §3.3, Decisions 5.3, 3.4, 3.1, 2.1).
 *
 * Modeled on `expireSubShares.ts`: an `onSchedule` function that pins
 * `memory` / `maxInstances` / `timeZone` and caps the amount of work done per
 * run so one slow sweep can't monopolise the scheduler slot or fan the
 * function out. It reaps the debris the live PLC workspace deliberately leaves
 * behind so the canonical write paths stay cheap and lock-free:
 *
 *   (a) **Empty synced groups** — `synced_quizzes` / `synced_video_activities`
 *       docs whose `participants` map is empty. `detachPlcSyncLinkage` (and the
 *       `leaveSynced*Group` handlers) intentionally LEAVE an emptied group in
 *       place so a re-share resolves the doc rather than 404; this job is the
 *       backstop that finally deletes a group nobody re-shares. We carry the
 *       existing orphan-logging posture (a per-category summary) so the rate is
 *       observable in Cloud Logging.
 *
 *   (b) **Stale activity events** — `plcs/{id}/activity/{eventId}` older than
 *       ~90 days. The activity feed is append-only and bounded on read
 *       (`limit(50)`); this trims the long tail so the collection doesn't grow
 *       without bound (§3.4).
 *
 *   (c) **Stale presence docs** — `plcs/{id}/presence/{uid}` whose
 *       `lastActiveAt` is older than ~5 min. Clients best-effort delete their
 *       own presence on `pagehide`, but an abandoned/crashed tab leaves a
 *       phantom heartbeat; this prunes them (Decision 2.1).
 *
 *   (d) **Expired soft-delete tombstones** — content docs whose `deletedAt` is
 *       older than 30 days, hard-deleted across every soft-deletable PLC
 *       subcollection (notes / todos / docs / quizzes / video_activities /
 *       assessments / meetings / comments). Clients only ever soft-delete (flip
 *       `deletedAt`); the firestore.rules forbid client hard-deletes of these,
 *       so the 30-day purge MUST be a server op (Decision 3.1).
 *
 *   (e) **Version-history overflow** — version snapshots under
 *       `synced_<kind>/{groupId}/versions` beyond the bounded cap. The
 *       client prune in `useSyncedQuizGroups` /
 *       `useSyncedVideoActivityGroups` is best-effort (fire-and-forget after
 *       publish); this sweeps any overflow that publish-time pruning missed
 *       (e.g. a publish that crashed before pruning).
 *
 * PLCs are iterated via a BOUNDED collection scan (cap per run) — the sweep is
 * idempotent and any PLCs not reached this run are picked up the next night.
 *
 * All time comparisons go through tolerant parsers: a field may be a Firestore
 * `Timestamp` (the canonical serverTimestamp write) OR a legacy numeric millis
 * value during the rollout window (§3.2). The pure decision helpers
 * (`isStalePresence`, `isExpiredTombstone`, `isEmptyGroup`, `toMillis`) are
 * exported so they can be unit-tested without an emulator.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import './functionsInit';

// ───────────────────────── tunables (per-run caps) ─────────────────────────

/** Stale-presence threshold: heartbeat is ~45s, "who's here" window ~90s. */
export const STALE_PRESENCE_MS = 5 * 60 * 1000; // 5 minutes (Decision 2.1)

/** Activity-event retention window (§3.4). */
export const ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days

/** Soft-delete tombstone grace before hard-delete (Decision 3.1). */
export const TOMBSTONE_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Bounded version-history depth (mirrors `VERSION_HISTORY_LIMIT` client-side). */
export const VERSION_HISTORY_LIMIT = 10;

/** Max PLCs visited per run — keeps one sweep from monopolising the slot. */
export const MAX_PLCS_PER_RUN = 200;

/** Max synced groups (per collection) scanned per run for empty-group reaping. */
export const MAX_GROUPS_PER_RUN = 500;

/** Max doc deletes per category per PLC per run (defensive batching). */
export const MAX_DELETES_PER_CATEGORY = 500;

/** Firestore caps a batch at 500 ops; chunk below that defensively. */
const BATCH_CHUNK = 250;

/**
 * Every PLC subcollection that carries the optional `deletedAt` soft-delete
 * tombstone (firestore.rules `plcSubDeletedAtOk`). The 30-day hard-delete
 * sweeps each of these. `assessments`/`meetings` are included per the task
 * even though their client soft-delete posture varies — a tombstone older
 * than the grace window is always safe to purge.
 */
export const SOFT_DELETE_SUBCOLLECTIONS = [
  'notes',
  'todos',
  'docs',
  'quizzes',
  'video_activities',
  'assessments',
  'meetings',
  'comments',
] as const;

/** The two canonical synced-group collections + their version subcollection. */
export const SYNCED_GROUP_COLLECTIONS = [
  'synced_quizzes',
  'synced_video_activities',
] as const;

// ───────────────────────── pure decision helpers ───────────────────────────

/**
 * Tolerant millis extraction. Accepts a Firestore `Timestamp` (has
 * `.toMillis()`), a raw number (legacy rollout value), or anything else
 * (treated as 0 → "epoch", i.e. always-stale / always-expired). Returns 0 for
 * null/undefined/malformed so a missing timestamp never blocks a sweep.
 */
export function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    const ms = (value as { toMillis: () => unknown }).toMillis();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/**
 * A presence doc is stale when its `lastActiveAt` is older than
 * `STALE_PRESENCE_MS` relative to `now`. A missing/malformed `lastActiveAt`
 * parses to 0 and is therefore stale (an abandoned doc with no heartbeat).
 */
export function isStalePresence(
  lastActiveAt: unknown,
  now: number,
  thresholdMs: number = STALE_PRESENCE_MS
): boolean {
  return now - toMillis(lastActiveAt) > thresholdMs;
}

/**
 * A soft-delete tombstone is expired (hard-deletable) when `deletedAt` is set
 * (non-null) AND older than `graceMs` relative to `now`. A null/absent
 * `deletedAt` means the doc is LIVE (or restored) and must never be purged —
 * this is the load-bearing guard that keeps GC from eating active content.
 */
export function isExpiredTombstone(
  deletedAt: unknown,
  now: number,
  graceMs: number = TOMBSTONE_GRACE_MS
): boolean {
  if (deletedAt === null || deletedAt === undefined) return false;
  const ms = toMillis(deletedAt);
  if (ms <= 0) return false; // malformed → don't risk deleting live content
  return now - ms > graceMs;
}

/**
 * An activity event is stale when its `createdAt` is older than `retentionMs`.
 * A missing/malformed `createdAt` parses to 0 and is therefore stale (a
 * legacy/garbage event with no timestamp is safe to trim).
 */
export function isStaleActivity(
  createdAt: unknown,
  now: number,
  retentionMs: number = ACTIVITY_RETENTION_MS
): boolean {
  return now - toMillis(createdAt) > retentionMs;
}

/**
 * A synced group is empty (reapable) when its `participants` map has no keys.
 * Tolerant of a missing/non-object `participants` field (treated as empty).
 */
export function isEmptyGroup(group: { participants?: unknown }): boolean {
  const participants = group.participants;
  if (
    participants === null ||
    participants === undefined ||
    typeof participants !== 'object'
  ) {
    return true;
  }
  return Object.keys(participants as Record<string, unknown>).length === 0;
}

// ───────────────────────── sweep helpers (I/O) ─────────────────────────────

interface CategoryCounts {
  emptyGroups: number;
  activity: number;
  presence: number;
  tombstones: number;
  versionOverflow: number;
}

type Firestore = admin.firestore.Firestore;
type QueryDocSnap = admin.firestore.QueryDocumentSnapshot;

/** Batched delete of an arbitrary set of doc refs (chunked under the 500 cap). */
async function deleteRefs(
  db: Firestore,
  refs: admin.firestore.DocumentReference[]
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < refs.length; i += BATCH_CHUNK) {
    const batch = db.batch();
    const chunk = refs.slice(i, i + BATCH_CHUNK);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

/**
 * Reap empty synced groups across both canonical collections. A group is
 * deleted only when its `participants` map is empty (no teacher still shares
 * it). Bounded by `MAX_GROUPS_PER_RUN` per collection.
 */
async function sweepEmptyGroups(db: Firestore): Promise<number> {
  let total = 0;
  for (const collection of SYNCED_GROUP_COLLECTIONS) {
    const snap = await db
      .collection(collection)
      .limit(MAX_GROUPS_PER_RUN)
      .get();
    const reapable: admin.firestore.DocumentReference[] = [];
    for (const doc of snap.docs) {
      if (isEmptyGroup(doc.data() as { participants?: unknown })) {
        reapable.push(doc.ref);
      }
    }
    if (reapable.length > 0) {
      total += await deleteRefs(db, reapable);
    }
  }
  return total;
}

/**
 * Trim version-history overflow under a single synced group. Keeps the newest
 * `VERSION_HISTORY_LIMIT` snapshots (by numeric doc id = version number) and
 * deletes the rest. Defensive: the client prunes after each publish, so this
 * usually finds nothing.
 */
async function sweepVersionOverflow(
  db: Firestore,
  groupRef: admin.firestore.DocumentReference
): Promise<number> {
  const versionsSnap = await groupRef.collection('versions').get();
  if (versionsSnap.size <= VERSION_HISTORY_LIMIT) return 0;
  // Newest-first by version number (doc id). Non-numeric ids sort last (NaN →
  // treated as oldest) so malformed snapshots are pruned first.
  const sorted = [...versionsSnap.docs].sort((a, b) => {
    const av = Number(a.id);
    const bv = Number(b.id);
    const an = Number.isFinite(av) ? av : -Infinity;
    const bn = Number.isFinite(bv) ? bv : -Infinity;
    return bn - an;
  });
  const overflow = sorted.slice(VERSION_HISTORY_LIMIT).map((d) => d.ref);
  return deleteRefs(db, overflow);
}

/**
 * Per-PLC sweep: activity-event trim, stale-presence prune, expired-tombstone
 * hard-delete across every soft-deletable subcollection. Returns the per-PLC
 * deletion counts. Each category is independently bounded.
 */
async function sweepPlc(
  db: Firestore,
  plcRef: admin.firestore.DocumentReference,
  now: number
): Promise<Omit<CategoryCounts, 'emptyGroups' | 'versionOverflow'>> {
  // (b) Activity events older than ~90 days. Query by createdAt where the
  // index allows; fall back to a bounded scan + client filter so the sweep
  // works even before a composite index exists.
  const activitySnap = await plcRef
    .collection('activity')
    .limit(MAX_DELETES_PER_CATEGORY)
    .get();
  const staleActivity = activitySnap.docs
    .filter((d: QueryDocSnap) => isStaleActivity(d.data().createdAt, now))
    .map((d: QueryDocSnap) => d.ref);

  // (c) Presence docs whose lastActiveAt is older than ~5 min.
  const presenceSnap = await plcRef
    .collection('presence')
    .limit(MAX_DELETES_PER_CATEGORY)
    .get();
  const stalePresence = presenceSnap.docs
    .filter((d: QueryDocSnap) => isStalePresence(d.data().lastActiveAt, now))
    .map((d: QueryDocSnap) => d.ref);

  // (d) Expired soft-delete tombstones across every soft-deletable subcollection.
  const expiredTombstones: admin.firestore.DocumentReference[] = [];
  for (const sub of SOFT_DELETE_SUBCOLLECTIONS) {
    const subSnap = await plcRef
      .collection(sub)
      .limit(MAX_DELETES_PER_CATEGORY)
      .get();
    for (const d of subSnap.docs) {
      if (isExpiredTombstone(d.data().deletedAt, now)) {
        expiredTombstones.push(d.ref);
      }
    }
  }

  const [activity, presence, tombstones] = await Promise.all([
    deleteRefs(db, staleActivity),
    deleteRefs(db, stalePresence),
    deleteRefs(db, expiredTombstones),
  ]);
  return { activity, presence, tombstones };
}

/**
 * Core sweep, extracted from the scheduler wrapper so it can be exercised
 * directly in tests against a stub / emulator Firestore without invoking
 * `onSchedule`. Iterates a bounded page of PLCs and runs every category.
 */
export async function runGcPlcOrphans(
  db: Firestore,
  now: number = Date.now()
): Promise<CategoryCounts> {
  const counts: CategoryCounts = {
    emptyGroups: 0,
    activity: 0,
    presence: 0,
    tombstones: 0,
    versionOverflow: 0,
  };

  // (a) + (e) operate on the canonical synced-group collections (PLC-independent).
  counts.emptyGroups = await sweepEmptyGroups(db);
  for (const collection of SYNCED_GROUP_COLLECTIONS) {
    const snap = await db
      .collection(collection)
      .limit(MAX_GROUPS_PER_RUN)
      .get();
    for (const doc of snap.docs) {
      counts.versionOverflow += await sweepVersionOverflow(db, doc.ref);
    }
  }

  // (b) + (c) + (d) are per-PLC. Bounded collection scan.
  const plcsSnap = await db.collection('plcs').limit(MAX_PLCS_PER_RUN).get();
  for (const plcDoc of plcsSnap.docs) {
    const perPlc = await sweepPlc(db, plcDoc.ref, now);
    counts.activity += perPlc.activity;
    counts.presence += perPlc.presence;
    counts.tombstones += perPlc.tombstones;
  }

  return counts;
}

export const gcPlcOrphans = onSchedule(
  {
    // Nightly at 03:15 America/Chicago — off-peak so a long sweep never
    // collides with classroom hours.
    schedule: '15 3 * * *',
    timeZone: 'America/Chicago',
    // Cost posture (PRD §5/§8): a bounded scan with batched deletes. Pin
    // memory + cap concurrency so the nightly job can never fan out.
    memory: '256MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    const counts = await runGcPlcOrphans(db);
    console.log(
      `[gcPlcOrphans] swept: ${counts.emptyGroups} empty synced groups, ` +
        `${counts.activity} stale activity events, ` +
        `${counts.presence} stale presence docs, ` +
        `${counts.tombstones} expired tombstones, ` +
        `${counts.versionOverflow} overflow version snapshots`
    );
  }
);
