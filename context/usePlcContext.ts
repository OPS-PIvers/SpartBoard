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
 *   `usePlcContributionsData`, plus the Wave-2 stub selectors `usePlcPresence`
 *   / `usePlcActivity`, which return `[]` this wave).
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

import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type {
  Plc,
  PlcContribution,
  PlcDoc,
  PlcMember,
  PlcNote,
  PlcQuizEntry,
  PlcRole,
  PlcTodo,
  PlcVideoActivityEntry,
} from '@/types';
import { getPlcMembers, getPlcRole } from '@/utils/plc';
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
 * Coarse per-section presence (Decision 2.1). Full implementation lands in
 * Wave 2; the type is declared now so the stub selector + store slot have a
 * stable shape that Wave 2 fills in without churning consumers.
 */
export interface PlcPresenceEntry {
  uid: string;
  displayName: string;
  section: PlcSectionId | 'meeting';
  lastActiveAt: number;
}

/**
 * Minimal materialized activity event (Decision 2.2). Wave-2 stub — see
 * `PlcPresenceEntry`.
 */
export interface PlcActivityEntry {
  id: string;
  type: string;
  actorUid: string;
  actorName: string;
  createdAt: number;
}

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
  /** Wave-2 stub: always `[]` this wave. */
  presence: PlcPresenceEntry[];
  /** Wave-2 stub: always `[]` this wave. */
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
  createNote: (input: { title: string; body: string }) => Promise<string>;
  updateNote: (
    noteId: string,
    patch: { title?: string; body?: string }
  ) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  // --- To-dos ---
  createTodo: (text: string) => Promise<string>;
  toggleTodoDone: (todoId: string, done: boolean) => Promise<void>;
  updateTodoText: (todoId: string, text: string) => Promise<void>;
  deleteTodo: (todoId: string) => Promise<void>;
  // --- Docs ---
  createDoc: (input: { title: string; url: string }) => Promise<string>;
  updateDoc: (
    docId: string,
    patch: { title?: string; url?: string }
  ) => Promise<void>;
  deleteDoc: (docId: string) => Promise<void>;
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

/** Wave-2 stub: coarse per-section presence. Always `[]` this wave. */
export function usePlcPresence(): PlcPresenceEntry[] {
  return usePlcSelector((s) => s.presence) ?? EMPTY_PRESENCE;
}

/** Wave-2 stub: minimal activity log. Always `[]` this wave. */
export function usePlcActivity(): PlcActivityEntry[] {
  return usePlcSelector((s) => s.activity) ?? EMPTY_ACTIVITY;
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

/** Re-export so the provider can build its derived `members` slice. */
export { getPlcMembers };
