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
 * PLCs (and synced groups) are iterated via a PAGINATED collection scan
 * (startAfter cursor on document id, mirrors `plcWeeklyDigest`), so every PLC
 * up to the MAX_PLCS_PER_RUN safety ceiling is visited every run — not just
 * the first page. The sweep is also idempotent, so a run that hits the
 * ceiling (an unrealistically large tenant) picks up where pagination would
 * have continued on the next scheduled run.
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

/**
 * Overall safety ceiling on PLCs visited per run — a runaway guard, NOT an
 * expected limit. The sweep PAGINATES (PLC_PAGE_SIZE pages, startAfter
 * cursor — mirrors `plcWeeklyDigest`'s fix for the identical bug), so every
 * PLC up to this ceiling is covered every run; set far above any realistic
 * single-district tenant. Prior to this, a single un-paginated `.limit()`
 * page meant any PLC past the cap was silently never visited by ANY nightly
 * run (activity/presence/tombstones for it would grow unbounded forever).
 */
export const MAX_PLCS_PER_RUN = 5000;

/** Page size for the paginated PLC sweep (startAfter cursor on document id). */
export const PLC_PAGE_SIZE = 200;

/**
 * Overall safety ceiling on synced groups (per collection) visited per run —
 * same rationale as `MAX_PLCS_PER_RUN`. The empty-group reap and
 * version-overflow sweeps both paginate (GROUP_PAGE_SIZE pages, startAfter
 * cursor) so a group past the old single-page cap is no longer permanently
 * unreachable.
 */
export const MAX_GROUPS_PER_RUN = 5000;

/** Page size for the paginated synced-group sweeps (startAfter cursor on document id). */
export const GROUP_PAGE_SIZE = 500;

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
 * it). Paginated (startAfter cursor on document id) so every group up to
 * `MAX_GROUPS_PER_RUN` is visited, not just the first `GROUP_PAGE_SIZE` —
 * a single un-paginated page silently starved any group past the cap forever.
 */
async function sweepEmptyGroups(db: Firestore): Promise<number> {
  let total = 0;
  for (const collection of SYNCED_GROUP_COLLECTIONS) {
    let lastDoc: QueryDocSnap | undefined;
    let visited = 0;
    while (visited < MAX_GROUPS_PER_RUN) {
      let pageQuery = db
        .collection(collection)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(GROUP_PAGE_SIZE);
      if (lastDoc) pageQuery = pageQuery.startAfter(lastDoc);
      const page = await pageQuery.get();
      if (page.size === 0) break;

      const reapable: admin.firestore.DocumentReference[] = [];
      for (const doc of page.docs) {
        visited += 1;
        if (isEmptyGroup(doc.data() as { participants?: unknown })) {
          reapable.push(doc.ref);
        }
      }
      if (reapable.length > 0) {
        total += await deleteRefs(db, reapable);
      }

      lastDoc = page.docs[page.docs.length - 1];
      if (page.size < GROUP_PAGE_SIZE) break;
    }
    if (visited >= MAX_GROUPS_PER_RUN) {
      console.warn(
        `[gcPlcOrphans] hit MAX_GROUPS_PER_RUN ceiling (${MAX_GROUPS_PER_RUN}) on ${collection} — raise it or shard the sweep`
      );
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
    // Paginated (startAfter cursor on document id) — mirrors sweepEmptyGroups
    // above. A single un-paginated page silently skipped every group past
    // GROUP_PAGE_SIZE, forever (that group's version-history overflow would
    // never be trimmed by any run).
    let lastGroupDoc: QueryDocSnap | undefined;
    let groupsVisited = 0;
    while (groupsVisited < MAX_GROUPS_PER_RUN) {
      let pageQuery = db
        .collection(collection)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(GROUP_PAGE_SIZE);
      if (lastGroupDoc) pageQuery = pageQuery.startAfter(lastGroupDoc);
      const page = await pageQuery.get();
      if (page.size === 0) break;

      for (const doc of page.docs) {
        groupsVisited += 1;
        counts.versionOverflow += await sweepVersionOverflow(db, doc.ref);
      }

      lastGroupDoc = page.docs[page.docs.length - 1];
      if (page.size < GROUP_PAGE_SIZE) break;
    }
    if (groupsVisited >= MAX_GROUPS_PER_RUN) {
      console.warn(
        `[gcPlcOrphans] hit MAX_GROUPS_PER_RUN ceiling (${MAX_GROUPS_PER_RUN}) on ${collection} — raise it or shard the sweep`
      );
    }
  }

  // (b) + (c) + (d) are per-PLC. Paginated (startAfter cursor on document id,
  // mirrors `plcWeeklyDigest`'s fix for the identical bug) so EVERY PLC is
  // covered, not just the first page — bounded by MAX_PLCS_PER_RUN (runaway
  // guard) and the function timeout. A single un-paginated page silently
  // skipped any PLC past the cap every run: its activity/presence/tombstones
  // would grow unbounded forever since no nightly run would ever reach it.
  let lastPlcDoc: QueryDocSnap | undefined;
  let plcsVisited = 0;
  while (plcsVisited < MAX_PLCS_PER_RUN) {
    let pageQuery = db
      .collection('plcs')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PLC_PAGE_SIZE);
    if (lastPlcDoc) pageQuery = pageQuery.startAfter(lastPlcDoc);
    const page = await pageQuery.get();
    if (page.size === 0) break;

    for (const plcDoc of page.docs) {
      plcsVisited += 1;
      const perPlc = await sweepPlc(db, plcDoc.ref, now);
      counts.activity += perPlc.activity;
      counts.presence += perPlc.presence;
      counts.tombstones += perPlc.tombstones;
    }

    lastPlcDoc = page.docs[page.docs.length - 1];
    if (page.size < PLC_PAGE_SIZE) break;
  }

  if (plcsVisited >= MAX_PLCS_PER_RUN) {
    console.warn(
      `[gcPlcOrphans] hit MAX_PLCS_PER_RUN safety ceiling (${MAX_PLCS_PER_RUN}) — raise it or shard the sweep`
    );
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
