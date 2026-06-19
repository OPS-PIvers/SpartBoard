/**
 * PLC workspace data layer — context, external store, and selector hooks
 * (Decision 1.4). Mirrors the repo's `dashboardCanvasStore` pattern: a single
 * `PlcProvider` (mounted at the PLC route by the routing task) subscribes ONCE
 * to the PLC root + each subcollection and exposes:
 *
 * - A mount-stable **actions** surface (`usePlcActions`) — the T2 membership
 *   mutators plus the existing subcollection mutators, behind an identity that
 *   never changes after mount (latest-ref dispatch), so action-only consumers
 *   never re-render.
 * - A `useSyncExternalStore`-backed **state slice** read through cheap
 *   selectors with `Object.is` bailout (`usePlcRootDoc`, `usePlcMembers`,
 *   `usePlcRole`, `usePlcNotesData`, `usePlcTodosData`, `usePlcDocsData`,
 *   `usePlcContributionsData`, plus the Wave-2 collaboration selectors
 *   `usePlcPresence` / `usePlcWhoIsHere` / `usePlcActivity`).
 *
 * The provider DEDUPES the per-component `onSnapshot` listeners that today fire
 * once per surface, and standardizes every subcollection's error contract on
 * `Error | null`.
 *
 * Back-compat: the existing `usePlc{Notes,Todos,Docs,Contributions,Quizzes,
 * VideoActivities}` hooks read from the provider when one is mounted (via
 * `usePlcSubcollection`), and keep their standalone `onSnapshot` behavior when
 * no provider is present — so call sites that render a section body outside the
 * dashboard (Home cards, the sidebar) keep working unchanged.
 *
 * Listener/snapshot mechanics modeled on `context/dashboardCanvasStore.ts` and
 * `components/common/modalStore.ts`.
 */

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  flattenSearchGroups,
  searchPlcRecords,
  type PlcSearchGroup,
  type PlcSearchRecord,
  type PlcSearchResult,
} from '@/components/plc/search/plcSearchIndex';
import { useAuth } from '@/context/useAuth';
import { usePlcSharedBoards } from '@/hooks/usePlcSharedBoards';
import type {
  Plc,
  PlcActivityEvent,
  PlcActivityType,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcContribution,
  PlcDoc,
  PlcMeeting,
  PlcMember,
  PlcNote,
  PlcPresence,
  PlcQuizEntry,
  PlcRole,
  PlcTodo,
  PlcVideoActivityEntry,
} from '@/types';
import { getPlcMembers, getPlcRole } from '@/utils/plc';
import { filterWhoIsHere } from '@/hooks/usePlcPresence';
import type { PlcSectionId } from '@/components/plc/sections';

/**
 * One subcollection's async state. Every heavy slice in the store wears this
 * shape so a consumer can distinguish "empty because nothing yet" from "empty
 * because the read failed" (`error != null`) and "still loading" (`loading`).
 *
 * `enabled` records whether the provider currently has this slice's listener
 * MOUNTED for the active section (heavy slices gate on per `SLICE_SECTIONS`).
 * It is the marker the back-compat bridge (`usePlcSubcollection`) reads to tell
 * a "gated-off, never-listened" slice apart from a "loaded, genuinely empty"
 * one: a gated-off slice reports `{ data: [], loading: false, enabled: false }`,
 * and the bridge returns `null` for it so the standalone hook falls through to
 * its own `onSnapshot` (the data must still reach Home cards on sections where
 * the provider does not listen for that slice). The public selector hooks
 * ignore `enabled` — they read `data`/`loading`/`error` and are only used by
 * components that already render the active section.
 */
export interface PlcSlice<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  enabled: boolean;
}

/**
 * Coarse per-section presence (Decision 2.1) as carried by the store slot and
 * selectors. This is the canonical `PlcPresence` (T1, `@/types`) with its
 * `section` narrowed from the dependency-free `string` it must use in `types.ts`
 * to the component-layer `PlcSectionId | 'meeting'` union — so consumers get
 * the precise section type without forcing a `types.ts → components/` import
 * cycle. The remaining fields are inherited unchanged from `PlcPresence`.
 */
export interface PlcPresenceEntry extends Omit<PlcPresence, 'section'> {
  section: PlcSectionId | 'meeting';
}

/**
 * Minimal materialized activity event (Decision 2.2) as carried by the store
 * slot and selectors. Aliases the canonical `PlcActivityEvent` (T1, `@/types`)
 * so the store and Wave-2 activity surfaces share one shape; `type` is the
 * closed `PlcActivityType` union.
 */
export type PlcActivityEntry = PlcActivityEvent;

/** Re-exported so consumers can narrow on the activity event union. */
export type { PlcActivityType };

/**
 * The full snapshot the store exposes. Mirrored from the provider's live
 * Firestore listeners. Each subcollection is a `PlcSlice` so loading/error
 * propagate per-slice; `members` / `role` are derived from the root doc and so
 * are always "on" (no separate listener — they ride the root subscription).
 */
export interface PlcStoreState {
  /** The live PLC root doc, or null before the first snapshot / when absent. */
  root: Plc | null;
  /** Active members derived from the root doc (T1 `getPlcMembers`). */
  members: PlcMember[];
  notes: PlcSlice<PlcNote[]>;
  todos: PlcSlice<PlcTodo[]>;
  docs: PlcSlice<PlcDoc[]>;
  contributions: PlcSlice<PlcContribution[]>;
  quizzes: PlcSlice<PlcQuizEntry[]>;
  videoActivities: PlcSlice<PlcVideoActivityEntry[]>;
  /**
   * The team's designated common assessments (Decision 4.0c, §3.6). Mirrored
   * from the provider's `plcs/{id}/assessments` listener, gated to the sections
   * that surface them (home / meeting / sharedData). Soft-deleted entries are
   * filtered out; ordered newest-edit-first by `updatedAt`.
   */
  assessments: PlcSlice<PlcCommonAssessment[]>;
  /**
   * Anonymized, member-readable assessment aggregates (Decisions 6.0 + 3.3,
   * §3.6) — the FERPA-safe Meeting-Mode data spine. Mirrored from the provider's
   * `plcs/{id}/aggregates` listener (server-written; clients read-only), gated
   * to the sections that read them (sharedData / meeting / home). Ordered by
   * `assessmentId` for a stable render order.
   */
  aggregates: PlcSlice<PlcAssessmentAggregate[]>;
  /**
   * The team's archived meeting records (Decisions 4.0 / 4.0b, §3.7). Mirrored
   * from the provider's `plcs/{id}/meetings` listener, gated to the Meeting
   * section. Soft-deleted entries are filtered out; ordered newest-held-first by
   * `heldAt`.
   */
  meetings: PlcSlice<PlcMeeting[]>;
  /**
   * Coarse per-section presence (Decision 2.1). Mirrored from the provider's
   * ALWAYS-ON `plcs/{id}/presence` listener (Home needs it, so it is not
   * section-gated). Ordered newest-heartbeat-first; the `usePlcWhoIsHere`
   * selector client-filters this to the ~90s freshness window.
   */
  presence: PlcPresenceEntry[];
  /**
   * Minimal materialized activity log (Decision 2.2, §3.4). Mirrored from the
   * provider's ALWAYS-ON `plcs/{id}/activity` listener (bounded to the latest
   * 50 events, newest-first). Powers the unread badge + Home digest.
   */
  activity: PlcActivityEntry[];
}

/**
 * The mount-stable actions surface. Re-exposes the T2 membership mutators and
 * the existing subcollection mutators with identical signatures so a future
 * MembersBody / NotesBody can call them off the provider rather than threading
 * `usePlcs()` / `usePlcNotes()` through props. Identity never changes after
 * mount (latest-ref dispatch inside the provider).
 */
export interface PlcActions {
  // --- Membership (T2; rules-enforced lead/co-lead gates) ---
  setMemberRole: (uid: string, role: PlcRole) => Promise<void>;
  transferLead: (toUid: string) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  leavePlc: () => Promise<void>;
  renamePlc: (name: string) => Promise<void>;
  // --- Notes ---
  createNote: (input: {
    title: string;
    body: string;
    kind?: 'freeform' | 'meeting';
    meetingId?: string | null;
  }) => Promise<string>;
  // Patch shape mirrors `UpdateNotePatch` in `hooks/usePlcNotes.ts` (kept
  // inline to avoid a context↔hook import cycle). Enforces the optimistic
  // version precondition (Decision 2.4): the caller passes the `expectedVersion`
  // its draft was loaded from; the write sends `expectedVersion + 1` and throws
  // `PlcNoteVersionConflictError` when a teammate already bumped past it (no
  // silent overwrite). Omit `expectedVersion` only for a legacy un-versioned
  // note (rollout escape hatch, last-write-wins).
  updateNote: (
    noteId: string,
    patch: {
      title?: string;
      body?: string;
      kind?: 'freeform' | 'meeting';
      meetingId?: string | null;
      deletedAt?: number | null;
    },
    options?: { expectedVersion?: number }
  ) => Promise<void>;
  /**
   * Soft-delete a note (Decision 3.1) — sets the `deletedAt` tombstone via the
   * version-aware update path (may throw `PlcNoteVersionConflictError`). The
   * note drops out of the live list and into Trash. Restore with `restoreNote`.
   * Pass the note's loaded `version` so the tombstone write respects the
   * precondition.
   */
  deleteNote: (noteId: string, expectedVersion?: number) => Promise<void>;
  /** Restore a soft-deleted note by clearing its `deletedAt` tombstone. */
  restoreNote: (noteId: string, expectedVersion?: number) => Promise<void>;
  // --- To-dos ---
  createTodo: (text: string) => Promise<string>;
  toggleTodoDone: (todoId: string, done: boolean) => Promise<void>;
  updateTodoText: (todoId: string, text: string) => Promise<void>;
  /** Soft-delete a to-do (Decision 3.1). Restore with `restoreTodo`. */
  deleteTodo: (todoId: string) => Promise<void>;
  /** Restore a soft-deleted to-do by clearing its `deletedAt` tombstone. */
  restoreTodo: (todoId: string) => Promise<void>;
  // --- Docs ---
  createDoc: (input: { title: string; url: string }) => Promise<string>;
  updateDoc: (
    docId: string,
    patch: { title?: string; url?: string }
  ) => Promise<void>;
  /** Soft-delete a doc (Decision 3.1). Restore with `restoreDoc`. */
  deleteDoc: (docId: string) => Promise<void>;
  /** Restore a soft-deleted doc by clearing its `deletedAt` tombstone. */
  restoreDoc: (docId: string) => Promise<void>;
  // --- Common assessments (Decision 4.0c, §3.6) ---
  /**
   * Designate a new common assessment for the team (writes a
   * `PlcCommonAssessment` with `serverTimestamp()` time fields and fires an
   * `assessment_created` activity event). `status` defaults to `'planning'`.
   * Returns the new assessment id. Prefer `designateAssessment` — the
   * intention-revealing alias — at call sites.
   */
  createAssessment: (input: {
    title: string;
    kind: 'quiz' | 'video-activity';
    syncGroupId: string;
    unitLabel?: string;
    opensAt?: number | null;
    dueAt?: number | null;
    status?: PlcCommonAssessment['status'];
  }) => Promise<string>;
  /**
   * Patch a common assessment's working fields (`title` / `unitLabel` /
   * `opensAt` / `dueAt` / `status`). Identity fields (`id` / `createdBy` /
   * `createdAt` / `kind` / `syncGroupId`) are immutable in rules and never
   * written here; `updatedAt` is bumped with `serverTimestamp()`.
   */
  updateAssessment: (
    assessmentId: string,
    patch: {
      title?: string;
      unitLabel?: string;
      opensAt?: number | null;
      dueAt?: number | null;
      status?: PlcCommonAssessment['status'];
    }
  ) => Promise<void>;
  /** Soft-delete a common assessment (Decision 3.1). Restore with `restoreAssessment`. */
  deleteAssessment: (assessmentId: string) => Promise<void>;
  /** Restore a soft-deleted assessment by clearing its `deletedAt` tombstone. */
  restoreAssessment: (assessmentId: string) => Promise<void>;
  /**
   * Intention-revealing alias for `createAssessment` — "designate THIS synced
   * group as the team's common assessment." Same write + activity event;
   * identical return.
   */
  designateAssessment: (input: {
    title: string;
    kind: 'quiz' | 'video-activity';
    syncGroupId: string;
    unitLabel?: string;
    opensAt?: number | null;
    dueAt?: number | null;
    status?: PlcCommonAssessment['status'];
  }) => Promise<string>;
  // --- Meeting records (Decisions 4.0 / 4.0b, §3.7) ---
  /**
   * Create an `in-progress` meeting record (Pick step, §6.2) with
   * `serverTimestamp()` time fields. The facilitator defaults to the caller;
   * `attendeeUids` / `assessmentIds` / `decisions` / `actionItems` default to
   * empty lists (the rules require them present). Returns the new meeting id.
   */
  createMeeting: (input?: {
    facilitatorUid?: string;
    assessmentIds?: string[];
    attendeeUids?: string[];
    agenda?: string;
  }) => Promise<string>;
  /**
   * Patch a meeting's working fields (`attendeeUids` / `assessmentIds` /
   * `agenda` / `decisions` / `actionItems` / `notesBody` / `status`). Identity
   * fields (`id` / `createdBy` / `heldAt` / `facilitatorUid`) are immutable in
   * rules and never written here; `updatedAt` is bumped with `serverTimestamp()`.
   */
  updateMeeting: (
    meetingId: string,
    patch: {
      attendeeUids?: string[];
      assessmentIds?: string[];
      agenda?: string;
      decisions?: PlcMeeting['decisions'];
      actionItems?: PlcMeeting['actionItems'];
      notesBody?: string;
      status?: PlcMeeting['status'];
    }
  ) => Promise<void>;
  /**
   * Finalize a meeting (Save step, §6.2): captures `attendeeUids` from the
   * current presence list (auto from presence, editable before save via the
   * optional `attendeeUids` override per §11), marks `status: 'completed'`,
   * persists any passed working fields, and fires a `meeting_held` activity
   * event. Then spawns a `PlcTodo` for every action item lacking a `todoId`
   * (assignee/due/`meetingId` provenance) and back-links the new `todoId` onto
   * the meeting record (§3.9). Returns the spawned to-do ids.
   */
  saveMeeting: (
    meetingId: string,
    input?: {
      attendeeUids?: string[];
      assessmentIds?: string[];
      agenda?: string;
      decisions?: PlcMeeting['decisions'];
      actionItems?: PlcMeeting['actionItems'];
      notesBody?: string;
    }
  ) => Promise<string[]>;
  /** Soft-delete a meeting record (Decision 3.1). Restore with `restoreMeeting`. */
  deleteMeeting: (meetingId: string) => Promise<void>;
  /** Restore a soft-deleted meeting by clearing its `deletedAt` tombstone. */
  restoreMeeting: (meetingId: string) => Promise<void>;
  /**
   * Spawn a `PlcTodo` for each of a meeting's action items lacking a `todoId`
   * (Act step, §6.2 / §3.9) and back-link the new `todoId` onto the meeting.
   * Idempotent — already-promoted action items are skipped. Returns the spawned
   * to-do ids. (`saveMeeting` calls this; exposed standalone so Meeting Mode can
   * promote action items to to-dos mid-meeting.)
   */
  spawnTodosForMeeting: (meetingId: string) => Promise<string[]>;
}

/**
 * External-store contract for the PLC state slice. `getState` /`subscribe`
 * power `useSyncExternalStore`; `plcId` lets a back-compat hook confirm the
 * mounted provider covers the plcId it was asked about. Internal mutators
 * (`setState`, `notify`) are called only by the provider.
 */
export interface PlcStore {
  plcId: string;
  getState: () => PlcStoreState;
  subscribe: (listener: () => void) => () => void;
  /** Internal: provider-only state replace + post-commit notify. */
  setState: (next: PlcStoreState) => void;
}

export function createPlcStore(
  plcId: string,
  initial: PlcStoreState
): PlcStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    plcId,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setState: (next) => {
      state = next;
      for (const listener of listeners) listener();
    },
  };
}

/** Provided by `PlcProvider`. Null when no provider is mounted. */
export const PlcStoreContext = createContext<PlcStore | null>(null);
/** Provided by `PlcProvider`. Null when no provider is mounted. */
export const PlcActionsContext = createContext<PlcActions | null>(null);

/** No-op subscribe used when no store is mounted (fallback hosts). */
const noopSubscribe = (): (() => void) => () => undefined;
/** Constant null snapshot for the inert `useSyncExternalStore` call. */
const getNullSnapshot = (): null => null;

/**
 * Low-level store accessor. Returns the mounted `PlcStore` or null. Callers
 * almost always want a selector hook below; this exists for the back-compat
 * subcollection bridge (`usePlcSubcollection`) and tests.
 */
export function usePlcStore(): PlcStore | null {
  return useContext(PlcStoreContext);
}

/**
 * Selector hook over the PLC store with `Object.is` bailout — the heart of the
 * dedupe win. A component re-renders only when ITS selected value changes
 * (mirrors `useDashboardCanvasSelector`). Returns `undefined` when no provider
 * is mounted; the hook is ALWAYS called (hook order) and fed inert args in
 * that case, so callers can use it unconditionally.
 *
 * Selectors MUST return primitives or identity-stable references (slice fields
 * the provider replaces only on change) — a selector that allocates a fresh
 * object each call would defeat the `Object.is` cache and trip
 * `useSyncExternalStore`'s render-loop guard.
 */
export function usePlcSelector<T>(
  selector: (s: PlcStoreState) => T
): T | undefined {
  const store = useContext(PlcStoreContext);
  const lastSnapshotRef = useRef<{ value: T } | null>(null);

  return useSyncExternalStore<T | undefined>(
    store ? store.subscribe : noopSubscribe,
    store
      ? () => {
          const next = selector(store.getState());
          const cached = lastSnapshotRef.current;
          if (cached && Object.is(cached.value, next)) return cached.value;
          lastSnapshotRef.current = { value: next };
          return next;
        }
      : (getNullSnapshot as () => T | undefined)
  );
}

/**
 * Back-compat bridge for the standalone `usePlc*` subcollection hooks. Returns
 * the provider's `PlcSlice` for the requested subcollection when a provider is
 * mounted AND it covers `plcId` AND that slice's listener is gated ON for the
 * active section (`slice.enabled`); otherwise returns `null` so the caller keeps
 * its standalone `onSnapshot`. This is what lets Home cards (RecentDocsCard via
 * `usePlcDocs`, AttentionCard via `usePlcContributions`) keep showing real data:
 * the Home section gates `docs`/`contributions` OFF, so the provider seeds a
 * settled-but-DISABLED empty slice, the bridge returns `null`, and the
 * standalone hook opens its own listener. Always called (hook order); the
 * `plcId`/`enabled` guard happens after the subscription, not by skipping the
 * hook.
 */
export function usePlcSubcollection<T>(
  plcId: string | null,
  pick: (s: PlcStoreState) => PlcSlice<T> | null
): PlcSlice<T> | null {
  const store = useContext(PlcStoreContext);
  const matches = !!store && !!plcId && store.plcId === plcId;
  const slice = usePlcSelector((s) => pick(s));
  if (!matches) return null;
  // A gated-off slice is present in the store but its listener was never
  // mounted for the active section — treat it as "no provider data here" so
  // the standalone hook reads Firestore itself.
  if (!slice || !slice.enabled) return null;
  return slice;
}

// --- Public selector hooks ------------------------------------------------

/** The live PLC root doc (or null). Re-renders only when the doc changes. */
export function usePlcRootDoc(): Plc | null {
  return usePlcSelector((s) => s.root) ?? null;
}

/** Active members (T1 `getPlcMembers`). Re-renders only when membership shifts. */
export function usePlcMembers(): PlcMember[] {
  return usePlcSelector((s) => s.members) ?? EMPTY_MEMBERS;
}

/**
 * The given uid's role within the PLC, or null if not an active member.
 * Derived from the root doc via T1 `getPlcRole`. Re-computes off the stable
 * `root` reference so it bails on unrelated subcollection changes.
 */
export function usePlcRole(uid: string | null | undefined): PlcRole | null {
  const root = usePlcSelector((s) => s.root) ?? null;
  if (!root || !uid) return null;
  return getPlcRole(root, uid);
}

/**
 * True when the signed-in user may EDIT this PLC's content (author / edit /
 * delete / share assessments, notes, todos, docs, meetings, comments) — i.e.
 * any active member except a `viewer` (Decision 3.2; mirrors T1
 * `canEditPlcContent`). The viewer-role read-only UI gate (W4-T10): content
 * surfaces call this once instead of re-threading `plc` + `uid` to
 * `canEditPlcContent` at every affordance.
 *
 * Pulls the acting uid from `useAuth` and the role from the store root doc, so
 * a call site only needs the hook — no props. Returns `false` while the root
 * doc hasn't loaded, when no provider is mounted, or when the user is a viewer
 * / not a member. This is purely a defense-in-depth UI gate: the rules layer
 * (W4-T1 `plcCanEditContent`) is the source of truth and hard-denies viewer
 * writes regardless of what the client renders.
 */
export function useCanEditPlcContent(): boolean {
  const { user } = useAuth();
  const role = usePlcRole(user?.uid);
  return role !== null && role !== 'viewer';
}

/** Notes slice (data/loading/error). */
export function usePlcNotesData(): PlcSlice<PlcNote[]> {
  return usePlcSelector((s) => s.notes) ?? EMPTY_NOTES_SLICE;
}

/** To-dos slice (data/loading/error). */
export function usePlcTodosData(): PlcSlice<PlcTodo[]> {
  return usePlcSelector((s) => s.todos) ?? EMPTY_TODOS_SLICE;
}

/** Docs slice (data/loading/error). */
export function usePlcDocsData(): PlcSlice<PlcDoc[]> {
  return usePlcSelector((s) => s.docs) ?? EMPTY_DOCS_SLICE;
}

/** Contributions slice (data/loading/error). */
export function usePlcContributionsData(): PlcSlice<PlcContribution[]> {
  return usePlcSelector((s) => s.contributions) ?? EMPTY_CONTRIBUTIONS_SLICE;
}

/** Common-assessments slice (data/loading/error) — Decision 4.0c, §3.6. */
export function usePlcAssessmentsData(): PlcSlice<PlcCommonAssessment[]> {
  return usePlcSelector((s) => s.assessments) ?? EMPTY_ASSESSMENTS_SLICE;
}

/** Anonymized assessment-aggregates slice (data/loading/error) — Decisions 6.0 + 3.3. */
export function usePlcAggregatesData(): PlcSlice<PlcAssessmentAggregate[]> {
  return usePlcSelector((s) => s.aggregates) ?? EMPTY_AGGREGATES_SLICE;
}

/** Meeting-records slice (data/loading/error) — Decisions 4.0 / 4.0b, §3.7. */
export function usePlcMeetingsData(): PlcSlice<PlcMeeting[]> {
  return usePlcSelector((s) => s.meetings) ?? EMPTY_MEETINGS_SLICE;
}

/**
 * The full live presence list (every member's doc, including stale ones),
 * ordered newest-heartbeat-first. Mirrored from the provider's always-on
 * presence listener. For the rendered "who's here" strip use `usePlcWhoIsHere`
 * — it client-filters to the ~90s freshness window. Re-renders only when the
 * underlying presence array changes (the provider replaces the reference only
 * on a real snapshot).
 */
export function usePlcPresence(): PlcPresenceEntry[] {
  return usePlcSelector((s) => s.presence) ?? EMPTY_PRESENCE;
}

/**
 * The "who's here NOW" view (Decision 2.1, §6.3): presence docs heartbeated
 * within `PRESENCE_FRESH_WINDOW_MS` (~90s). Client-filtered so an abandoned tab
 * drops off the strip before the server-side GC sweep runs (Wave-4).
 *
 * Memoized on the raw `presence` reference, which the provider replaces only on
 * a real snapshot — so the returned array keeps `Object.is` identity between
 * renders (a fresh `.filter()` every render would defeat downstream
 * `useMemo`/`React.memo`). `now` is captured at filter time; because any
 * member's heartbeat (~45s) produces a new snapshot, the strip re-filters
 * frequently and a teammate who goes silent drops off at the next snapshot.
 */
export function usePlcWhoIsHere(): PlcPresenceEntry[] {
  const presence = usePlcPresence();
  return useMemo(() => filterWhoIsHere(presence), [presence]);
}

/**
 * The minimal materialized activity feed (Decision 2.2, §3.4), newest-first.
 * Mirrored from the provider's ALWAYS-ON `plcs/{id}/activity` listener (bounded
 * to the latest 50 events). Powers the Home "since you were here" digest and the
 * `usePlcUnread` derivation. Re-renders only when the underlying array changes
 * (the provider replaces the reference only on a real snapshot).
 */
export function usePlcActivity(): PlcActivityEntry[] {
  return usePlcSelector((s) => s.activity) ?? EMPTY_ACTIVITY;
}

// --- Per-PLC search (PRD §6.4, Decision 4.3) ------------------------------

/**
 * The grouped, ranked results of a per-PLC search, plus the cursor-navigable flat
 * list and a loading flag for the on-demand boards slice. Returned by
 * {@link usePlcSearch}.
 */
export interface PlcSearchState {
  /** Grouped results in fixed section order (empty when the query is too short). */
  groups: PlcSearchGroup[];
  /** The same results flattened in render order — for arrow-key navigation. */
  flat: PlcSearchResult[];
  /**
   * True while the on-demand boards query is in flight. The store-backed slices
   * (assessments / quizzes / VAs / docs / notes) are already loaded, so this only
   * reflects the boards listener spun up for search.
   */
  loadingBoards: boolean;
}

const EMPTY_SEARCH_GROUPS: PlcSearchGroup[] = [];
const EMPTY_SEARCH_FLAT: PlcSearchResult[] = [];

/**
 * Build the flat searchable record set from the provider's already-loaded slices
 * plus the on-demand boards list. Pure projection — extracted so the slice → record
 * mapping is testable and the hook body stays a thin orchestration.
 *
 * Soft-deleted entries are ALREADY filtered out of the provider slices
 * (`filterLive` in `PlcContext`), so this never re-checks `deletedAt`.
 */
function buildPlcSearchRecords(input: {
  assessments: PlcCommonAssessment[];
  quizzes: PlcQuizEntry[];
  videoActivities: PlcVideoActivityEntry[];
  docs: PlcDoc[];
  notes: PlcNote[];
  boards: { id: string; name: string }[];
}): PlcSearchRecord[] {
  const records: PlcSearchRecord[] = [];

  // Common assessments → Shared Data section (where they're designated/reviewed).
  for (const a of input.assessments) {
    records.push({
      id: a.id,
      kind: 'assessment',
      section: 'sharedData',
      title: a.title,
      ...(a.unitLabel ? { snippet: a.unitLabel } : {}),
    });
  }
  // Synced quizzes + video activities → unified Assessments section.
  for (const q of input.quizzes) {
    records.push({
      id: q.id,
      kind: 'quiz',
      section: 'assessments',
      title: q.title,
    });
  }
  for (const v of input.videoActivities) {
    records.push({
      id: v.id,
      kind: 'video-activity',
      section: 'assessments',
      title: v.title,
    });
  }
  // Shared notes + Google docs → Notes & Docs section.
  for (const n of input.notes) {
    records.push({
      id: n.id,
      kind: 'note',
      section: 'docs',
      title: n.title,
      ...(n.body ? { snippet: n.body } : {}),
    });
  }
  for (const d of input.docs) {
    records.push({
      id: d.id,
      kind: 'doc',
      section: 'docs',
      title: d.title,
      ...(d.url ? { snippet: d.url } : {}),
    });
  }
  // PLC-shared dashboards → Boards section (on-demand boards query).
  for (const b of input.boards) {
    records.push({
      id: b.id,
      kind: 'board',
      section: 'sharedBoards',
      title: b.name,
    });
  }
  return records;
}

/**
 * Per-PLC search selector (PRD §6.4, Decision 4.3). Runs client-side over the
 * provider's already-loaded slices — common assessments, synced quizzes + video
 * activities, shared notes, and Google docs — and additionally spins up a LIGHT
 * on-demand boards subscription (boards are not a provider slice for any section,
 * so they're fetched here while the search box is mounted).
 *
 * The expensive parts — slice flattening and match/rank/group — are `useMemo`'d on
 * the slice references (the provider replaces a slice reference only on a real
 * snapshot) and the trimmed query, so typing only re-runs the pure search, not the
 * record projection, when the underlying data is stable.
 *
 * `plcId` is required so the on-demand boards listener targets the right PLC; pass
 * the active PLC's id. Returns empty groups when the query is below the minimum
 * length (see `searchPlcRecords`).
 */
export function usePlcSearch(plcId: string, query: string): PlcSearchState {
  // Already-loaded slices (Object.is-stable references from the provider).
  const assessments = usePlcAssessmentsData();
  const quizzes = usePlcSelector((s) => s.quizzes) ?? EMPTY_QUIZZES_SLICE;
  const videoActivities =
    usePlcSelector((s) => s.videoActivities) ?? EMPTY_VIDEO_ACTIVITIES_SLICE;
  const docs = usePlcDocsData();
  const notes = usePlcNotesData();

  // Light on-demand boards subscription — only the header fields are read; the
  // hook tears the listener down when the search box unmounts (plcId → null).
  const { boards, loading: loadingBoards } = usePlcSharedBoards(plcId);

  const boardRecords = useMemo(
    () => boards.map((b) => ({ id: b.id, name: b.name })),
    [boards]
  );

  const records = useMemo(
    () =>
      buildPlcSearchRecords({
        assessments: assessments.data,
        quizzes: quizzes.data,
        videoActivities: videoActivities.data,
        docs: docs.data,
        notes: notes.data,
        boards: boardRecords,
      }),
    [
      assessments.data,
      quizzes.data,
      videoActivities.data,
      docs.data,
      notes.data,
      boardRecords,
    ]
  );

  const groups = useMemo(
    () => searchPlcRecords(records, query),
    [records, query]
  );
  const flat = useMemo(() => flattenSearchGroups(groups), [groups]);

  return useMemo(
    () => ({
      groups: groups.length > 0 ? groups : EMPTY_SEARCH_GROUPS,
      flat: flat.length > 0 ? flat : EMPTY_SEARCH_FLAT,
      loadingBoards,
    }),
    [groups, flat, loadingBoards]
  );
}

/**
 * Mount-stable actions surface. Throws if used outside a `PlcProvider` — every
 * caller of the actions surface lives under the provider (the subcollection
 * mutators keep their own standalone hooks for non-provider hosts).
 */
export function usePlcActions(): PlcActions {
  const actions = useContext(PlcActionsContext);
  if (!actions) {
    throw new Error('usePlcActions must be used within a PlcProvider');
  }
  return actions;
}

/**
 * Build a fully-empty initial store state for a given plcId. The empty slices
 * carry `loading: true` (the listeners haven't reported yet) so a consumer
 * never flashes an empty state before the first snapshot. Heavy slices that
 * are NOT gated on for the active section report `loading: false` (there is no
 * pending read), set by the provider when it decides which listeners to mount.
 *
 * `enabled` mirrors the gate: a slice the provider is listening on is `enabled`
 * (and starts `loading` until its first snapshot); a gated-off slice is
 * `!enabled` and settled. The back-compat bridge keys off this flag — see
 * `usePlcSubcollection`.
 */
export function emptyPlcSlice<T>(empty: T, enabled: boolean): PlcSlice<T> {
  return { data: empty, loading: enabled, error: null, enabled };
}

// Stable module-level singletons returned from the fallback (`?? X`) branches
// so a no-provider host gets a referentially-stable value every render (an
// inline literal would defeat downstream `useMemo`/`Object.is`).
const EMPTY_MEMBERS: PlcMember[] = [];
const EMPTY_PRESENCE: PlcPresenceEntry[] = [];
const EMPTY_ACTIVITY: PlcActivityEntry[] = [];
const EMPTY_NOTES_SLICE: PlcSlice<PlcNote[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_TODOS_SLICE: PlcSlice<PlcTodo[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_DOCS_SLICE: PlcSlice<PlcDoc[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_CONTRIBUTIONS_SLICE: PlcSlice<PlcContribution[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_QUIZZES_SLICE: PlcSlice<PlcQuizEntry[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_VIDEO_ACTIVITIES_SLICE: PlcSlice<PlcVideoActivityEntry[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_ASSESSMENTS_SLICE: PlcSlice<PlcCommonAssessment[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_AGGREGATES_SLICE: PlcSlice<PlcAssessmentAggregate[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};
const EMPTY_MEETINGS_SLICE: PlcSlice<PlcMeeting[]> = {
  data: [],
  loading: false,
  error: null,
  enabled: false,
};

/** Re-export so the provider can build its derived `members` slice. */
export { getPlcMembers };
