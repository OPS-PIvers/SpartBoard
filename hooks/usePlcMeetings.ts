/**
 * Live subscription + write layer for a PLC's archived meeting records
 * (Decisions 4.0 / 4.0b, §3.7). A `PlcMeeting` is the exportable record Meeting
 * Mode writes when a team holds a data meeting: which common assessments were
 * reviewed, who attended (captured from presence), the decisions made, and the
 * action items spun up — each of which can become a `PlcTodo` (§3.9) carrying a
 * `meetingId` provenance link back to the record.
 *
 * Mirrors the other `usePlc*` subcollection hooks (`usePlcAssessments`,
 * `usePlcDocs`):
 *   - Back-compat (Decision 1.4): reads the deduped `meetings` slice from a
 *     mounted `PlcProvider` when present, else opens its own `onSnapshot`.
 *   - Returns entries ordered newest-held-first by `heldAt`, soft-deleted
 *     entries filtered out of the live list (Decision 3.1 — they live in Trash).
 *   - Parser is tolerant of `serverTimestamp()`-backed Timestamps AND legacy
 *     plain-number time fields during rollout (`tsToMillis`), and tolerant of
 *     the loosely-typed nested `decisions[]` / `actionItems[]` interiors the
 *     rules deliberately don't validate (CEL can't `.every()` a list — §3.7).
 *   - Pass `null` for `plcId` to disable the listener cleanly.
 *
 * The write path (`createMeeting` / `updateMeeting` / `saveMeeting` /
 * `deleteMeeting` / `spawnTodosForMeeting`) lives on the `PlcProvider` actions
 * surface (`usePlcActions`); this hook is read-only, matching the contributions
 * /aggregates hooks. The pure helpers it exports (`captureAttendeeUids`,
 * `actionItemsNeedingTodos`, `buildTodoFromActionItem`,
 * `applyTodoBackLinks`) own the meeting-specific logic so they unit-test without
 * a Firestore round-trip.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcMeeting, PlcPresence, PlcTodo } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { usePlcSubcollection } from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';
const MEETINGS_SUBCOLLECTION = 'meetings';

/** The lifecycle statuses a `PlcMeeting` may carry (rule-pinned). */
const MEETING_STATUSES: ReadonlySet<PlcMeeting['status']> = new Set<
  PlcMeeting['status']
>(['in-progress', 'completed']);

interface UsePlcMeetingsResult {
  meetings: PlcMeeting[];
  /** Lookup by meeting id — the map Meeting Mode reads when resuming a record. */
  meetingsById: Record<string, PlcMeeting>;
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `meetings` array is
   * "couldn't load," not "no meetings yet." Standardized on `Error | null`
   * (Decision 1.4 — error-contract unification).
   */
  error: Error | null;
}

/**
 * Parse one nested `decisions[]` entry, or `null` if malformed. The rules
 * deliberately leave the interior shape unvalidated (CEL can't `.every()` a
 * list), so the parser owns it: a malformed decision is dropped (not the whole
 * meeting) so one bad row doesn't blank an otherwise-readable record.
 * `linkedDataCard` is carried through only when its `assessmentId` is a string.
 */
function parseDecision(raw: unknown): PlcMeeting['decisions'][number] | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string' || typeof rec.text !== 'string') return null;
  const decision: PlcMeeting['decisions'][number] = {
    id: rec.id,
    text: rec.text,
  };
  const card = rec.linkedDataCard;
  if (card && typeof card === 'object') {
    const cardRec = card as Record<string, unknown>;
    if (typeof cardRec.assessmentId === 'string') {
      const linked: { assessmentId: string; questionId?: string } = {
        assessmentId: cardRec.assessmentId,
      };
      if (typeof cardRec.questionId === 'string') {
        linked.questionId = cardRec.questionId;
      }
      decision.linkedDataCard = linked;
    }
  }
  return decision;
}

/**
 * Parse one nested `actionItems[]` entry, or `null` if malformed. Same
 * rules-don't-validate-interior posture as `parseDecision`: a bad row is
 * dropped, not fatal. `assigneeUid` / `dueAt` / `todoId` are carried through
 * only when well-typed; `dueAt` tolerates an explicit `null` (no due date).
 */
function parseActionItem(
  raw: unknown
): PlcMeeting['actionItems'][number] | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string' || typeof rec.text !== 'string') return null;
  const item: PlcMeeting['actionItems'][number] = {
    id: rec.id,
    text: rec.text,
  };
  if (typeof rec.assigneeUid === 'string') item.assigneeUid = rec.assigneeUid;
  if (typeof rec.dueAt === 'number') {
    item.dueAt = rec.dueAt;
  } else if (rec.dueAt === null) {
    item.dueAt = null;
  }
  if (typeof rec.todoId === 'string') item.todoId = rec.todoId;
  return item;
}

/**
 * Parse a Firestore meeting doc into the typed `PlcMeeting`, or `null` if a
 * required field is missing/malformed (the doc is dropped rather than partially
 * parsed). Tolerant of the two time-field shapes seen during rollout (Decision
 * 1.3): `serverTimestamp()`-resolved Timestamps and legacy plain millis, via
 * `tsToMillis`. `status` is pinned to its union (mirrors the rules' enum gate).
 * The nested `decisions[]` / `actionItems[]` interiors are owned by the parser
 * (rules don't validate them); malformed rows within are dropped individually.
 * Optional fields (`agenda`, `notesBody`, `deletedAt`) are carried through only
 * when present and well-typed.
 */
export function parsePlcMeeting(
  id: string,
  data: Record<string, unknown>
): PlcMeeting | null {
  if (
    typeof data.facilitatorUid !== 'string' ||
    !Array.isArray(data.attendeeUids) ||
    !Array.isArray(data.assessmentIds) ||
    !Array.isArray(data.decisions) ||
    !Array.isArray(data.actionItems) ||
    !MEETING_STATUSES.has(data.status as PlcMeeting['status']) ||
    typeof data.createdBy !== 'string'
  ) {
    return null;
  }
  const decisions: PlcMeeting['decisions'] = [];
  for (const raw of data.decisions as unknown[]) {
    const parsed = parseDecision(raw);
    if (parsed) decisions.push(parsed);
  }
  const actionItems: PlcMeeting['actionItems'] = [];
  for (const raw of data.actionItems as unknown[]) {
    const parsed = parseActionItem(raw);
    if (parsed) actionItems.push(parsed);
  }
  const meeting: PlcMeeting = {
    id,
    // heldAt / updatedAt are serverTimestamp()-backed on write (Decision 1.3);
    // legacy docs carry plain millis. `tsToMillis` tolerates both and an
    // unresolved pending sentinel (→ 0).
    heldAt: tsToMillis(data.heldAt),
    facilitatorUid: data.facilitatorUid,
    // Keep only the string uids — a malformed array element must not poison the
    // attendee/assessment lists Meeting Mode renders.
    attendeeUids: (data.attendeeUids as unknown[]).filter(
      (u): u is string => typeof u === 'string'
    ),
    assessmentIds: (data.assessmentIds as unknown[]).filter(
      (a): a is string => typeof a === 'string'
    ),
    decisions,
    actionItems,
    status: data.status as PlcMeeting['status'],
    createdBy: data.createdBy,
    updatedAt: tsToMillis(data.updatedAt),
  };
  if (typeof data.agenda === 'string') meeting.agenda = data.agenda;
  if (typeof data.notesBody === 'string') meeting.notesBody = data.notesBody;
  // Soft-delete tombstone (Decision 3.1): optional so legacy docs parse cleanly;
  // a pending serverTimestamp resolves to 0 (still != null → filtered).
  if (typeof data.deletedAt === 'number') {
    meeting.deletedAt = data.deletedAt;
  } else if (data.deletedAt === null) {
    meeting.deletedAt = null;
  } else if (data.deletedAt != null) {
    meeting.deletedAt = tsToMillis(data.deletedAt);
  }
  return meeting;
}

// --- Pure meeting logic (unit-tested without Firestore) -------------------

/** Freshness window for "present during the meeting" presence capture (~90s). */
export const MEETING_PRESENCE_FRESH_WINDOW_MS = 90_000;

/**
 * Capture the attendee uids for a meeting from the live presence list (§6.2
 * Save, §11 — "attendees = members present during the meeting session; auto
 * from presence, editable before save"). A member counts as present when their
 * presence heartbeat falls within `MEETING_PRESENCE_FRESH_WINDOW_MS` of `now`.
 * The facilitator is always included (they are running the meeting even if their
 * heartbeat briefly lapsed). De-duplicated, order-stable (presence order, then
 * the facilitator appended if not already present). Pure — `now` is injected so
 * the capture is deterministic in tests.
 */
export function captureAttendeeUids(
  presence: readonly Pick<PlcPresence, 'uid' | 'lastActiveAt'>[],
  facilitatorUid: string,
  now: number = Date.now()
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of presence) {
    if (!p.uid || seen.has(p.uid)) continue;
    // A pending serverTimestamp resolves to 0; treat it as stale (not present)
    // rather than counting a not-yet-stamped heartbeat as fresh.
    if (p.lastActiveAt <= 0) continue;
    if (now - p.lastActiveAt <= MEETING_PRESENCE_FRESH_WINDOW_MS) {
      seen.add(p.uid);
      result.push(p.uid);
    }
  }
  if (facilitatorUid && !seen.has(facilitatorUid)) {
    result.push(facilitatorUid);
  }
  return result;
}

/**
 * The action items that should spawn a to-do: those with non-empty text and no
 * existing `todoId` back-link (Act step, §6.2). An action item already promoted
 * to a to-do is skipped so re-running the spawn after a partial failure is
 * idempotent (never double-creates). Pure.
 */
export function actionItemsNeedingTodos(
  actionItems: readonly PlcMeeting['actionItems'][number][]
): PlcMeeting['actionItems'][number][] {
  return actionItems.filter(
    (item) => item.text.trim().length > 0 && !item.todoId
  );
}

/**
 * Build the `PlcTodo`-doc field map for a spawned to-do from a meeting action
 * item (§3.9). Carries the action item's text, `assigneeUid`, and `dueAt`, plus
 * the `meetingId` provenance link. `createdAt` is intentionally NOT set here —
 * the writer stamps it with `serverTimestamp()` (Decision 1.3) — so this stays
 * a pure, testable projection. Optional fields are written only when present so
 * the schema-locked `keys().hasOnly([...])` rule accepts the doc. Pure.
 */
export function buildTodoFromActionItem(
  todoId: string,
  actionItem: PlcMeeting['actionItems'][number],
  meetingId: string,
  createdBy: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: todoId,
    text: actionItem.text.trim(),
    done: false,
    createdBy,
    meetingId,
  };
  if (actionItem.assigneeUid !== undefined) {
    payload.assigneeUid = actionItem.assigneeUid;
  }
  if (actionItem.dueAt !== undefined) {
    payload.dueAt = actionItem.dueAt;
  }
  return payload;
}

/**
 * Apply the spawned-to-do back-links onto a meeting's action items (Act step,
 * §6.2): for each `actionItemId → todoId` pairing, set `todoId` on the matching
 * action item. Returns a NEW array (immutable update) so the caller can write it
 * back as the meeting's `actionItems`. Action items absent from the map are
 * returned unchanged. Pure.
 */
export function applyTodoBackLinks(
  actionItems: readonly PlcMeeting['actionItems'][number][],
  todoIdByActionItemId: ReadonlyMap<string, string>
): PlcMeeting['actionItems'] {
  return actionItems.map((item) => {
    const todoId = todoIdByActionItemId.get(item.id);
    if (!todoId) return item;
    return { ...item, todoId };
  });
}

/**
 * Strip a meeting's `actionItems` to the rule-/storage-safe shape (drop
 * `undefined` interior fields so the Firestore write doesn't carry `undefined`
 * values, which the SDK rejects). Keeps `assigneeUid` / `dueAt` / `todoId` only
 * when defined. Pure — used by the writer before persisting an updated
 * `actionItems` array. (`dueAt: null` is meaningful and preserved.)
 */
export function sanitizeActionItemsForWrite(
  actionItems: readonly PlcMeeting['actionItems'][number][]
): PlcMeeting['actionItems'] {
  return actionItems.map((item) => {
    const out: PlcMeeting['actionItems'][number] = {
      id: item.id,
      text: item.text,
    };
    if (item.assigneeUid !== undefined) out.assigneeUid = item.assigneeUid;
    if (item.dueAt !== undefined) out.dueAt = item.dueAt;
    if (item.todoId !== undefined) out.todoId = item.todoId;
    return out;
  });
}

/** Build the by-id lookup map from the ordered list. */
function indexMeetings(list: PlcMeeting[]): Record<string, PlcMeeting> {
  const map: Record<string, PlcMeeting> = {};
  for (const m of list) map[m.id] = m;
  return map;
}

/**
 * Live subscription to a single PLC's meeting records. Returns non-soft-deleted
 * entries ordered newest-held-first by `heldAt`. Pass `null` for `plcId` to
 * disable the listener (e.g. while the dashboard is closed). Mirrors
 * `usePlcAssessments` — same parser-drops-malformed defense, same render-time
 * `prevPlcId` reset so the UI never flashes the previous PLC's records while the
 * new snapshot is in flight, and the same provider back-compat bridge.
 */
export function usePlcMeetings(plcId: string | null): UsePlcMeetingsResult {
  const { user } = useAuth();
  // Back-compat (Decision 1.4): read from a mounted PlcProvider when present.
  const fromProvider = usePlcSubcollection(plcId, (s) => s.meetings);
  const [meetings, setMeetings] = useState<PlcMeeting[]>([]);
  const [loading, setLoading] = useState<boolean>(plcId !== null);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setMeetings([]);
    setLoading(plcId !== null);
    setError(null);
  }

  useEffect(() => {
    // Provider owns the listener for this plcId — skip the standalone one.
    if (fromProvider) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setMeetings([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, MEETINGS_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('heldAt', 'desc')),
      (snap) => {
        const list: PlcMeeting[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcMeeting(
            d.id,
            d.data() as Record<string, unknown>
          );
          // Soft-deleted meetings drop out of the live list — they live in
          // Trash until restored or GC'd (Decision 3.1).
          if (parsed && parsed.deletedAt == null) list.push(parsed);
        });
        setMeetings(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcMeetings.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, fromProvider]);

  const list = fromProvider ? fromProvider.data : meetings;
  const meetingsById = useMemo(() => indexMeetings(list), [list]);

  return useMemo(() => {
    if (fromProvider) {
      return {
        meetings: fromProvider.data,
        meetingsById,
        loading: fromProvider.loading,
        error: fromProvider.error,
      };
    }
    return { meetings, meetingsById, loading, error };
  }, [fromProvider, meetings, meetingsById, loading, error]);
}

/** Re-export so the provider's spawn-todos action shares the parse shape. */
export type { PlcTodo };
