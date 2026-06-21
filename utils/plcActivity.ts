/**
 * Fire-and-forget writer for the PLC activity log (Decision 2.2, §3.4).
 *
 * `writePlcActivityEvent(plcId, event)` appends a materialized event to
 * `plcs/{plcId}/activity` and is intentionally NON-BLOCKING: it mirrors the
 * `writePlcAssignmentIndexEntry` / `notifyPlcWriteFailure` posture — the
 * canonical write (creating a note, holding a meeting, soft-deleting an item)
 * must never block on, or fail because of, the activity-log append. The helper
 * therefore:
 *
 *   - never throws into the caller (every failure is caught + `logError`'d), and
 *   - returns `Promise<void>` so a caller MAY `void writePlcActivityEvent(...)`
 *     without an unhandled rejection escaping.
 *
 * The doc id is allocated client-side so `event.id` can be pinned to it (the
 * rules require `request.resource.data.id == eventId`). `createdAt` is written
 * with `serverTimestamp()` (Decision 1.3); the listener parser resolves it to
 * millis via `tsToMillis`. `actorUid` MUST be the caller's own uid — the rules
 * reject a forged actor — so callers pass the signed-in uid.
 */

import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import type { PlcActivityEvent, PlcActivityType } from '@/types';

const PLCS_COLLECTION = 'plcs';
const ACTIVITY_SUBCOLLECTION = 'activity';

/**
 * Sentinel `targetType` on a PER-MENTION `comment_added` activity event
 * (Decision 2.6). A comment fans out ONE general event plus one private mention
 * event per @mentioned uid; the mention event carries this marker in
 * `targetType` and the mentioned member's uid in `targetId` (see
 * `buildCommentActivityEvents` in `hooks/usePlcComments.ts`, which re-exports
 * this constant for back-compat). Living here — the activity layer — lets both
 * the feed filter and the unread derivation treat a mention event as a PRIVATE
 * notification addressed to one member, without importing from the comments hook
 * (which would create an import cycle, since that hook imports this module).
 */
export const MENTION_ACTIVITY_TARGET_TYPE = 'comment:mention';

/** `targetType` for the single GENERAL comment-added event (not a mention). */
export const COMMENT_ACTIVITY_TARGET_TYPE = 'comment';

/**
 * Is `event` a per-mention notification addressed to someone OTHER than `uid`?
 * Per-mention `comment_added` events are private notifications for the mentioned
 * member only — they must be hidden from every other viewer's feed and excluded
 * from every other viewer's unread badge (Decision 2.3, "no per-event spam"). A
 * general comment event (or a mention addressed to `uid` themselves) returns
 * `false` (it is surfaced normally). `uid === null` (signed-out) treats every
 * mention event as "not mine" → hidden.
 */
export function isForeignMentionEvent(
  event: PlcActivityEvent,
  uid: string | null
): boolean {
  return (
    event.targetType === MENTION_ACTIVITY_TARGET_TYPE && event.targetId !== uid
  );
}

/**
 * The closed set of activity types, used to drop a malformed/legacy doc whose
 * `type` is outside the union (mirrors the rules' `type in [...]` pin). Kept in
 * lockstep with `PlcActivityType` in `types.ts`.
 */
const ACTIVITY_TYPES: ReadonlySet<PlcActivityType> = new Set<PlcActivityType>([
  'member_joined',
  'member_left',
  'role_changed',
  'assessment_created',
  'assessment_shared',
  'assessment_results_ready',
  'meeting_held',
  'note_created',
  'comment_added',
  'item_deleted',
  'item_restored',
]);

function isActivityType(value: unknown): value is PlcActivityType {
  return (
    typeof value === 'string' && ACTIVITY_TYPES.has(value as PlcActivityType)
  );
}

/**
 * Parse one activity doc into a `PlcActivityEvent`, or `null` if it is
 * malformed (missing required fields or an out-of-union `type`). The doc `id`
 * is authoritative (the rules pin `data.id == eventId`). `createdAt` is
 * `serverTimestamp()`-backed; `tsToMillis` tolerates the resolved Timestamp,
 * legacy plain millis, and an unresolved pending sentinel (→ `0`). Optional
 * target fields are carried through only when they are strings.
 */
export function parseActivity(
  id: string,
  data: Record<string, unknown>
): PlcActivityEvent | null {
  if (
    !isActivityType(data.type) ||
    typeof data.actorUid !== 'string' ||
    typeof data.actorName !== 'string'
  ) {
    return null;
  }
  const event: PlcActivityEvent = {
    id,
    type: data.type,
    actorUid: data.actorUid,
    actorName: data.actorName,
    createdAt: tsToMillis(data.createdAt),
  };
  if (typeof data.targetType === 'string') event.targetType = data.targetType;
  if (typeof data.targetId === 'string') event.targetId = data.targetId;
  if (typeof data.targetTitle === 'string') {
    event.targetTitle = data.targetTitle;
  }
  return event;
}

/**
 * Pure unread-count derivation (Decision 2.2, §3.4): the number of activity
 * events whose `createdAt` is strictly after the member's `lastSeenAt` cursor.
 * Extracted so `usePlcUnread` and its unit test share one definition.
 *
 * Per-mention `comment_added` events addressed to OTHER members are excluded
 * (Decision 2.3, "no per-event spam"): a comment with N mentions writes N
 * private mention events, and counting them would inflate EVERY member's badge.
 * The general comment event still counts once for everyone; a mention addressed
 * to `selfUid` still counts for that member. Pass the current uid as `selfUid`
 * (omit / `null` when signed out → all mention events are treated as foreign and
 * excluded).
 *
 * `lastSeenAt == null` (no cursor yet — the member has never opened the PLC)
 * counts every (non-foreign-mention) event as unread. Events with
 * `createdAt === 0` (an unresolved pending serverTimestamp) are treated as
 * NOT-yet-after any cursor, so a freshly written local event doesn't briefly
 * inflate the badge before the server timestamp resolves.
 */
export function deriveUnreadCount(
  activity: readonly PlcActivityEvent[],
  lastSeenAt: number | null,
  selfUid: string | null = null
): number {
  let count = 0;
  for (const event of activity) {
    // A mention addressed to someone else is a private notification for them —
    // never part of this member's badge.
    if (isForeignMentionEvent(event, selfUid)) continue;
    if (lastSeenAt == null || event.createdAt > lastSeenAt) count += 1;
  }
  return count;
}

/**
 * The caller-supplied fields of an activity event. `id` and `createdAt` are
 * managed by the writer (doc id pin + `serverTimestamp()`), so the caller never
 * provides them. `actorUid` must be the signed-in user's uid (rules-enforced).
 */
export interface PlcActivityEventInput {
  type: PlcActivityType;
  actorUid: string;
  actorName: string;
  /** Object kind the event is about (e.g. 'note' | 'meeting' | 'comment'). */
  targetType?: string;
  /** Id of the target object. */
  targetId?: string;
  /** Display-title snapshot of the target, for rendering without a join. */
  targetTitle?: string;
}

/**
 * Append one event to `plcs/{plcId}/activity`. Fire-and-forget: resolves once
 * the write settles (or is swallowed) and NEVER rejects — a transient failure
 * is logged, not surfaced. Optional target fields are omitted entirely when
 * absent so the schema-locked rule (`keys().hasOnly`) accepts the minimal doc.
 */
export async function writePlcActivityEvent(
  plcId: string,
  event: PlcActivityEventInput
): Promise<void> {
  try {
    // Pre-allocate the doc ref so we can pin `id == eventId` (rules requirement)
    // — the activity log is append-only, so a plain create is correct.
    const ref = doc(
      collection(db, PLCS_COLLECTION, plcId, ACTIVITY_SUBCOLLECTION)
    );
    const payload: Record<string, unknown> = {
      id: ref.id,
      type: event.type,
      actorUid: event.actorUid,
      actorName: event.actorName,
      createdAt: serverTimestamp(),
    };
    if (event.targetType !== undefined) payload.targetType = event.targetType;
    if (event.targetId !== undefined) payload.targetId = event.targetId;
    if (event.targetTitle !== undefined)
      payload.targetTitle = event.targetTitle;
    await setDoc(ref, payload);
  } catch (err) {
    logError('writePlcActivityEvent', err, { plcId, type: event.type });
  }
}
