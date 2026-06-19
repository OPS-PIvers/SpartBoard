/**
 * PlcProvider — the single owner of a PLC workspace's live data (Decision 1.4).
 *
 * Mounted once at the PLC route (by the routing task) with the active `plcId`,
 * the live `Plc` root doc (already parsed by `usePlcs`), and the `activeSection`
 * the user is viewing. It subscribes ONCE to each subcollection — deduping the
 * per-component `onSnapshot` listeners that fire today when a subcollection is
 * rendered from multiple surfaces — and fans the data out through the cheap,
 * `Object.is`-bailing selector hooks in `usePlcContext.ts`.
 *
 * Listener gating (Decision: "only the active section's heavy data mounts"):
 *   - `root` + `members` are ALWAYS on — they ride the `plc` prop (no listener
 *     of our own; the route's `usePlcs` subscription is the single source).
 *   - Each heavy subcollection listener mounts only while a section that needs
 *     it is active (see `SLICE_SECTIONS`). Leaving the section tears the
 *     listener down (Firestore read-cost posture, PRD §8).
 *
 * The store is a derived MIRROR of the provider's own React state; nothing
 * writes to it except the provider. Selector consumers read commit-consistent
 * values via `useSyncExternalStore`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Query,
} from 'firebase/firestore';
import { writePlcActivityEvent } from '@/utils/plcActivity';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import { parseNote, PlcNoteVersionConflictError } from '@/hooks/usePlcNotes';
import { parseTodo } from '@/hooks/usePlcTodos';
import { parseDoc } from '@/hooks/usePlcDocs';
import { parseContribution } from '@/hooks/usePlcContributions';
import { parsePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import { parsePlcVideoActivityEntry } from '@/hooks/usePlcVideoActivities';
import { logError } from '@/utils/logError';
import { getPlcMembers } from '@/utils/plc';
import { parsePresence, type PlcPresenceEntry } from '@/hooks/usePlcPresence';
import { parseActivity } from '@/utils/plcActivity';
import type { PlcSectionId } from '@/components/plc/sections';
import type {
  Plc,
  PlcActivityEvent,
  PlcContribution,
  PlcDoc,
  PlcMember,
  PlcNote,
  PlcRole,
  PlcQuizEntry,
  PlcTodo,
  PlcVideoActivityEntry,
} from '@/types';
import {
  PlcActionsContext,
  PlcStoreContext,
  createPlcStore,
  emptyPlcSlice,
  type PlcActions,
  type PlcSlice,
  type PlcStoreState,
} from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';

/**
 * Resolve a stable display name for an activity actor: prefer the display name,
 * then the email, then the uid (empty strings treated as absent). Mirrors the
 * helper in `hooks/usePlcNotes.ts` / `usePlcTrash` so activity writers snapshot
 * names the same way.
 */
function resolveActorName(user: {
  displayName?: string | null;
  email?: string | null;
  uid: string;
}): string {
  const displayName = user.displayName?.trim() ?? '';
  const email = user.email?.trim() ?? '';
  return displayName || email || user.uid;
}

/**
 * Which heavy subcollections each section needs mounted. Sections not listed
 * (e.g. `members`, `settings`) need no heavy listener — root+members cover
 * them. A slice whose section set doesn't include the active section reports
 * `loading: false` (no pending read) until that section is opened.
 */
const SLICE_SECTIONS: Record<
  keyof Pick<
    PlcStoreState,
    'notes' | 'todos' | 'docs' | 'contributions' | 'quizzes' | 'videoActivities'
  >,
  ReadonlySet<PlcSectionId>
> = {
  // `docs` (native notes) is gated to the Docs section.
  notes: new Set<PlcSectionId>(['docs']),
  todos: new Set<PlcSectionId>(['todos']),
  docs: new Set<PlcSectionId>(['docs']),
  // Contributions feed Shared Data analytics.
  contributions: new Set<PlcSectionId>(['sharedData']),
  quizzes: new Set<PlcSectionId>(['quizzes', 'sharedData']),
  videoActivities: new Set<PlcSectionId>(['videoActivities', 'sharedData']),
};

interface PlcProviderProps {
  plcId: string;
  /** The live PLC root doc (already parsed by `usePlcs`). */
  plc: Plc | null;
  /** Section the user is viewing — gates the heavy listeners. */
  activeSection: PlcSectionId;
  children: ReactNode;
}

/** Generic ordered-subcollection listener result. */
type SnapshotState<T> = PlcSlice<T[]>;

/**
 * Subscribe to one ordered subcollection while `enabled`, parsing each doc and
 * dropping malformed ones. Returns the `{ data, loading, error }` slice. When
 * disabled it reports a settled empty slice (no pending read) so a gated-off
 * section never renders a perpetual spinner. Mirrors the standalone hooks'
 * `prevPlcId` reset via the `plcId`/`enabled` effect deps.
 */
function useSubcollection<T>(
  plcId: string,
  subcollection: string,
  enabled: boolean,
  buildQuery: (ref: ReturnType<typeof collection>) => Query,
  parse: (id: string, data: Record<string, unknown>) => T | null,
  postProcess?: (list: T[]) => T[]
): SnapshotState<T> {
  const { user } = useAuth();
  const [state, setState] = useState<SnapshotState<T>>(() =>
    emptyPlcSlice<T[]>([], enabled)
  );

  // Reset to a loading/settled empty slice whenever the gate flips or the PLC
  // changes — done in render via the prev-prop pattern (not an effect) so the
  // UI never flashes the previous section's data while the new listener spins
  // up. Matches the standalone hooks' `prevPlcId` reset.
  const [prevKey, setPrevKey] = useState(`${plcId}:${enabled}`);
  const key = `${plcId}:${enabled}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setState(emptyPlcSlice<T[]>([], enabled));
  }

  useEffect(() => {
    if (!enabled || !user || isAuthBypass) return;
    const ref = collection(db, PLCS_COLLECTION, plcId, subcollection);
    const unsub = onSnapshot(
      buildQuery(ref),
      (snap) => {
        const list: T[] = [];
        snap.forEach((d) => {
          const parsed = parse(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        const finalList = postProcess ? postProcess(list) : list;
        // `enabled: true` — this branch only runs while the listener is
        // mounted (the effect early-returns when `!enabled`), so the slice is
        // authoritative and the back-compat bridge will surface it.
        setState({
          data: finalList,
          loading: false,
          error: null,
          enabled: true,
        });
      },
      (err) => {
        logError(`PlcProvider.${subcollection}`, err, { plcId });
        setState({
          data: [],
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
          enabled: true,
        });
      }
    );
    return () => unsub();
    // `buildQuery`/`parse`/`postProcess` are module-stable callbacks passed by
    // the provider; only plcId/enabled/user drive resubscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plcId, subcollection, enabled, user]);

  return state;
}

const orderByLastEdited = (ref: ReturnType<typeof collection>): Query =>
  query(ref, orderBy('lastEditedAt', 'desc'));
const orderByCreatedAtAsc = (ref: ReturnType<typeof collection>): Query =>
  query(ref, orderBy('createdAt', 'asc'));
const orderByCreatedAtDesc = (ref: ReturnType<typeof collection>): Query =>
  query(ref, orderBy('createdAt', 'desc'));
const orderByUpdatedAtDesc = (ref: ReturnType<typeof collection>): Query =>
  query(ref, orderBy('updatedAt', 'desc'));
const noOrder = (ref: ReturnType<typeof collection>): Query => query(ref);

/**
 * Drop soft-deleted docs (Decision 3.1) from a live subcollection slice. The
 * tombstoned items move to Trash (aggregated separately by `usePlcTrash`), so
 * the normal section lists must never surface them. A pending serverTimestamp
 * resolves to 0 (still `!= null`), so a just-deleted item disappears
 * immediately. Generic over any slice carrying an optional `deletedAt`.
 */
function filterLive<T extends { deletedAt?: number | null }>(list: T[]): T[] {
  return list.filter((item) => item.deletedAt == null);
}

/** Incomplete-first sort matching the standalone `usePlcTodos` post-process,
 * applied AFTER soft-deleted to-dos are filtered out. */
function sortTodos(list: PlcTodo[]): PlcTodo[] {
  return filterLive(list).sort((a, b) => {
    if (a.done === b.done) return 0;
    return a.done ? 1 : -1;
  });
}

const EMPTY_MEMBERS: PlcMember[] = [];
const EMPTY_PRESENCE: PlcPresenceEntry[] = [];
const EMPTY_ACTIVITY: PlcActivityEvent[] = [];

/** Heartbeat cadence — re-stamp the caller's own presence doc this often. */
const PRESENCE_HEARTBEAT_MS = 45_000;

/**
 * How many of the newest activity events the always-on listener loads
 * (Decision 2.2, §3.4 — "the activity listener loads the latest N"). Bounds the
 * read cost: the feed never streams the unbounded log, and the Wave-4
 * `gcPlcOrphans` function trims events older than ~90 days server-side.
 */
const ACTIVITY_PAGE_SIZE = 50;

/**
 * ALWAYS-ON presence listener (Decision 2.1, §6.3) — NOT section-gated, because
 * the Home digest renders the "who's here" strip regardless of section. Returns
 * the parsed presence list ordered newest-heartbeat-first; malformed docs are
 * dropped. Returns the stable `EMPTY_PRESENCE` reference until the first
 * snapshot so a no-op render bails via `Object.is`.
 */
function usePresenceListener(plcId: string): PlcPresenceEntry[] {
  const { user } = useAuth();
  const [presence, setPresence] = useState<PlcPresenceEntry[]>(EMPTY_PRESENCE);

  // Reset to the stable-empty reference when the PLC changes (prev-prop pattern,
  // not an effect) so the strip never flashes the previous PLC's roster.
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setPresence(EMPTY_PRESENCE);
  }

  useEffect(() => {
    if (!user || isAuthBypass) return;
    const ref = collection(db, PLCS_COLLECTION, plcId, 'presence');
    const unsub = onSnapshot(
      query(ref, orderBy('lastActiveAt', 'desc')),
      (snap) => {
        const list: PlcPresenceEntry[] = [];
        snap.forEach((d) => {
          const parsed = parsePresence(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setPresence(list);
      },
      (err) => {
        logError('PlcProvider.presence', err, { plcId });
        setPresence(EMPTY_PRESENCE);
      }
    );
    return () => unsub();
  }, [plcId, user]);

  return presence;
}

/**
 * ALWAYS-ON activity listener (Decision 2.2, §3.4) — NOT section-gated, because
 * the unread badge + Home "since you were here" digest need the feed regardless
 * of section. Loads at most the newest `ACTIVITY_PAGE_SIZE` events ordered by
 * `createdAt` desc (bounded read cost), parsing each via `parseActivity` and
 * dropping malformed/out-of-union docs. Returns the stable `EMPTY_ACTIVITY`
 * reference until the first snapshot so a no-op render bails via `Object.is`.
 */
function useActivityListener(plcId: string): PlcActivityEvent[] {
  const { user } = useAuth();
  const [activity, setActivity] = useState<PlcActivityEvent[]>(EMPTY_ACTIVITY);

  // Reset to the stable-empty reference when the PLC changes (prev-prop pattern,
  // not an effect) so the feed never flashes the previous PLC's events.
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setActivity(EMPTY_ACTIVITY);
  }

  useEffect(() => {
    if (!user || isAuthBypass) return;
    const ref = collection(db, PLCS_COLLECTION, plcId, 'activity');
    const unsub = onSnapshot(
      query(ref, orderBy('createdAt', 'desc'), limit(ACTIVITY_PAGE_SIZE)),
      (snap) => {
        const list: PlcActivityEvent[] = [];
        snap.forEach((d) => {
          const parsed = parseActivity(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setActivity(list);
      },
      (err) => {
        logError('PlcProvider.activity', err, { plcId });
        setActivity(EMPTY_ACTIVITY);
      }
    );
    return () => unsub();
  }, [plcId, user]);

  return activity;
}

/**
 * Heartbeat writer (Decision 2.1, §3.3). Writes the caller's OWN presence doc
 * (docId == uid) on mount and re-stamps it every ~45s while the dashboard is
 * open, and whenever `activeSection` changes. Best-effort deletes the doc on
 * unmount AND on `pagehide` / `visibilitychange:hidden` (covers the tab being
 * closed/backgrounded without a clean React unmount). All writes are
 * fire-and-forget — a transient failure must never surface to the UI.
 *
 * `displayName` / `section` are read fresh from a latest-ref so the interval
 * closure always writes the current values without re-arming the timer.
 */
function usePresenceHeartbeat(
  plcId: string,
  activeSection: PlcSectionId
): void {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const displayName = user?.displayName ?? '';

  // Freshest section/displayName for the interval + section-change writes,
  // assigned in render (house rule: no effect for ref sync).
  const latest = useRef({ displayName, section: activeSection });
  // eslint-disable-next-line react-hooks/refs
  latest.current = { displayName, section: activeSection };

  useEffect(() => {
    if (!uid || isAuthBypass) return;
    const ref = doc(db, PLCS_COLLECTION, plcId, 'presence', uid);

    const beat = (): void => {
      void setDoc(ref, {
        uid,
        displayName: latest.current.displayName,
        section: latest.current.section,
        lastActiveAt: serverTimestamp(),
      }).catch((err) => {
        logError('PlcProvider.presence.heartbeat', err, { plcId });
      });
    };

    // Initial beat + steady cadence.
    beat();
    const interval = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);

    // Best-effort teardown: clear our doc when the tab goes away. `pagehide`
    // fires on navigation/close; `visibilitychange:hidden` covers mobile
    // backgrounding where `pagehide` may not. Both are idempotent.
    const clearPresence = (): void => {
      void deleteDoc(ref).catch(() => undefined);
    };
    const onPageHide = (): void => clearPresence();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') clearPresence();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      clearPresence();
    };
  }, [plcId, uid]);

  // Re-stamp immediately when the active section changes so a teammate's strip
  // reflects the move without waiting for the next ~45s beat. Separate effect so
  // a section change doesn't tear down/re-arm the heartbeat interval above.
  useEffect(() => {
    if (!uid || isAuthBypass) return;
    const ref = doc(db, PLCS_COLLECTION, plcId, 'presence', uid);
    void setDoc(ref, {
      uid,
      displayName: latest.current.displayName,
      section: activeSection,
      lastActiveAt: serverTimestamp(),
    }).catch((err) => {
      logError('PlcProvider.presence.section', err, { plcId });
    });
  }, [plcId, uid, activeSection]);
}

export function PlcProvider({
  plcId,
  plc,
  activeSection,
  children,
}: PlcProviderProps) {
  const { user } = useAuth();
  const {
    setMemberRole: setMemberRoleMut,
    transferLead: transferLeadMut,
    removeMember: removeMemberMut,
    leavePlc: leavePlcMut,
    renamePlc: renamePlcMut,
  } = usePlcs({ enabled: false });

  // --- Heavy subcollection listeners (gated on the active section) ---
  const isSectionActive = (slice: keyof typeof SLICE_SECTIONS): boolean =>
    SLICE_SECTIONS[slice].has(activeSection);

  const notes = useSubcollection<PlcNote>(
    plcId,
    'notes',
    isSectionActive('notes'),
    orderByLastEdited,
    parseNote,
    filterLive
  );
  const todos = useSubcollection<PlcTodo>(
    plcId,
    'todos',
    isSectionActive('todos'),
    orderByCreatedAtAsc,
    parseTodo,
    sortTodos
  );
  const docs = useSubcollection<PlcDoc>(
    plcId,
    'docs',
    isSectionActive('docs'),
    orderByCreatedAtDesc,
    parseDoc,
    filterLive
  );
  const contributions = useSubcollection<PlcContribution>(
    plcId,
    'contributions',
    isSectionActive('contributions'),
    noOrder,
    parseContribution
  );
  const quizzes = useSubcollection<PlcQuizEntry>(
    plcId,
    'quizzes',
    isSectionActive('quizzes'),
    orderByUpdatedAtDesc,
    parsePlcQuizEntry,
    filterLive
  );
  const videoActivities = useSubcollection<PlcVideoActivityEntry>(
    plcId,
    'video_activities',
    isSectionActive('videoActivities'),
    orderByUpdatedAtDesc,
    parsePlcVideoActivityEntry,
    filterLive
  );

  // --- Derived root + members (always on; ride the `plc` prop) ---
  const members = useMemo(
    () => (plc ? getPlcMembers(plc) : EMPTY_MEMBERS),
    [plc]
  );

  // --- Presence (always on — Home needs it; not section-gated) ---
  const presence = usePresenceListener(plcId);
  usePresenceHeartbeat(plcId, activeSection);

  // --- Activity (always on — unread badge + Home digest; not section-gated) ---
  const activity = useActivityListener(plcId);

  // --- External store ---
  // Lazy-init via useState (the repo's lint-clean store-creation pattern — see
  // DashboardProvider's `useState(() => createDashboardCanvasStore(...))`). The
  // PLC route mounts one provider per plcId, so this is created once per mount;
  // the prev-plcId guard below recreates it defensively if plcId ever changes
  // in place (adjusting-state-while-rendering, no effect).
  const [store, setStore] = useState(() =>
    createPlcStore(plcId, {
      root: plc,
      members,
      notes,
      todos,
      docs,
      contributions,
      quizzes,
      videoActivities,
      presence,
      activity,
    })
  );
  const [storedPlcId, setStoredPlcId] = useState(plcId);
  if (storedPlcId !== plcId) {
    setStoredPlcId(plcId);
    setStore(
      createPlcStore(plcId, {
        root: plc,
        members,
        notes,
        todos,
        docs,
        contributions,
        quizzes,
        videoActivities,
        presence,
        activity,
      })
    );
  }

  // Mirror the latest slices into the store on every commit. `setState`
  // notifies subscribers; selectors bail via `Object.is`, so unrelated slices
  // don't re-render their consumers. Running in an effect keeps subscribers
  // reading commit-consistent values (post-commit notify).
  useEffect(() => {
    store.setState({
      root: plc,
      members,
      notes,
      todos,
      docs,
      contributions,
      quizzes,
      videoActivities,
      presence,
      activity,
    });
  }, [
    store,
    plc,
    members,
    notes,
    todos,
    docs,
    contributions,
    quizzes,
    videoActivities,
    presence,
    activity,
  ]);

  // --- Mount-stable actions surface (latest-ref dispatch) ---
  // Subcollection mutators write directly here (the standalone hooks own the
  // non-provider path); membership mutators delegate to the disabled `usePlcs`
  // instance above. All wrapped so the actions object identity is fixed after
  // mount — action-only consumers never re-render.
  const latest = useRef({
    plcId,
    user,
    setMemberRoleMut,
    transferLeadMut,
    removeMemberMut,
    leavePlcMut,
    renamePlcMut,
  });
  // Assigned in the render body (per CLAUDE.md house rules — see usePlcs.ts's
  // `plcsRef.current = plcs`) so the stable action wrappers always dispatch to
  // the freshest plcId / user / membership-mutator without re-creating the
  // actions object (which would re-render every action consumer).
  // eslint-disable-next-line react-hooks/refs
  latest.current = {
    plcId,
    user,
    setMemberRoleMut,
    transferLeadMut,
    removeMemberMut,
    leavePlcMut,
    renamePlcMut,
  };

  const actions = useStableActions(latest);

  return (
    <PlcStoreContext.Provider value={store}>
      <PlcActionsContext.Provider value={actions}>
        {children}
      </PlcActionsContext.Provider>
    </PlcStoreContext.Provider>
  );
}

/**
 * Build the mount-stable `PlcActions` object. Every method reads the freshest
 * plcId / user / membership-mutator from the latest-ref, so the returned object
 * identity (and each method identity) never changes after mount while still
 * dispatching to the live closure — the same posture as `useDashboardActions`.
 */
function useStableActions(
  latest: React.MutableRefObject<{
    plcId: string;
    user: ReturnType<typeof useAuth>['user'];
    setMemberRoleMut: (
      plcId: string,
      uid: string,
      role: PlcRole
    ) => Promise<void>;
    transferLeadMut: (plcId: string, toUid: string) => Promise<void>;
    removeMemberMut: (plcId: string, uid: string) => Promise<void>;
    leavePlcMut: (plcId: string) => Promise<void>;
    renamePlcMut: (plcId: string, name: string) => Promise<void>;
  }>
): PlcActions {
  const noteRef = (noteId: string) =>
    doc(db, PLCS_COLLECTION, latest.current.plcId, 'notes', noteId);
  const todoRef = (todoId: string) =>
    doc(db, PLCS_COLLECTION, latest.current.plcId, 'todos', todoId);
  const docRef = (docId: string) =>
    doc(db, PLCS_COLLECTION, latest.current.plcId, 'docs', docId);

  const requireUser = () => {
    const u = latest.current.user;
    if (!u) throw new Error('Not signed in');
    return u;
  };

  // --- Membership ---
  const setMemberRole = useCallback(
    (uid: string, role: PlcRole) =>
      latest.current.setMemberRoleMut(latest.current.plcId, uid, role),
    [latest]
  );
  const transferLead = useCallback(
    (toUid: string) =>
      latest.current.transferLeadMut(latest.current.plcId, toUid),
    [latest]
  );
  const removeMember = useCallback(
    (uid: string) => latest.current.removeMemberMut(latest.current.plcId, uid),
    [latest]
  );
  const leavePlc = useCallback(
    () => latest.current.leavePlcMut(latest.current.plcId),
    [latest]
  );
  const renamePlc = useCallback(
    (name: string) => latest.current.renamePlcMut(latest.current.plcId, name),
    [latest]
  );

  // --- Notes ---
  const createNote = useCallback(
    async (input: {
      title: string;
      body: string;
      kind?: 'freeform' | 'meeting';
      meetingId?: string | null;
    }): Promise<string> => {
      const u = requireUser();
      const ref = doc(
        collection(db, PLCS_COLLECTION, latest.current.plcId, 'notes')
      );
      // serverTimestamp() for the time fields (Decision 1.3); `parseNote`
      // resolves the Timestamp to millis on read via `tsToMillis`. `version: 0`
      // seeds the optimistic-concurrency counter (Decision 2.4); `kind` /
      // `meetingId` are only written when provided (structured meeting notes).
      const payload: Record<string, unknown> = {
        id: ref.id,
        title: input.title,
        body: input.body,
        createdBy: u.uid,
        createdAt: serverTimestamp(),
        lastEditedBy: u.uid,
        lastEditedAt: serverTimestamp(),
        version: 0,
      };
      if (input.kind) payload.kind = input.kind;
      if (input.meetingId !== undefined) payload.meetingId = input.meetingId;
      await setDoc(ref, payload);

      // Activity log (Decision 2.2, §3.4) — native notes is Wave 2's headline
      // feature, so a created note must surface in the "since you were here"
      // digest + unread badge. Fire-and-forget (mirrors the comment fan-out and
      // `hooks/usePlcNotes.ts`): never blocks or fails the note write.
      const actorName = resolveActorName(u);
      void writePlcActivityEvent(latest.current.plcId, {
        type: 'note_created',
        actorUid: u.uid,
        actorName,
        targetType: 'note',
        targetId: ref.id,
        ...(input.title.trim() ? { targetTitle: input.title.trim() } : {}),
      });
      return ref.id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const updateNote = useCallback(
    async (
      noteId: string,
      patch: {
        title?: string;
        body?: string;
        kind?: 'freeform' | 'meeting';
        meetingId?: string | null;
        deletedAt?: number | null;
      },
      options?: { expectedVersion?: number }
    ): Promise<void> => {
      const u = requireUser();
      const ref = noteRef(noteId);
      const expectedVersion = options?.expectedVersion;
      // Optimistic version precondition (Decision 2.4) via a SINGLE
      // non-transactional `updateDoc` — NOT a transaction. A transaction
      // auto-retries on contention and would re-read the new canonical version,
      // recompute `latest + 1`, and silently overwrite a teammate's concurrent
      // same-field edit. Sending `version: expectedVersion + 1` (the base the
      // caller LOADED) instead makes the rule's `new == old + 1` check fail when
      // a teammate already bumped past it, surfacing
      // `PlcNoteVersionConflictError` so the caller reloads. Mirrors
      // `hooks/usePlcNotes.ts`.
      const fields: Record<string, unknown> = {
        lastEditedBy: u.uid,
        lastEditedAt: serverTimestamp(),
      };
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.body !== undefined) fields.body = patch.body;
      if (patch.kind !== undefined) fields.kind = patch.kind;
      if (patch.meetingId !== undefined) fields.meetingId = patch.meetingId;
      if (patch.deletedAt !== undefined) fields.deletedAt = patch.deletedAt;
      // Rollout escape hatch: a legacy un-versioned note omits `expectedVersion`
      // and we must NOT introduce `version` (the rule rejects it),
      // last-write-wins like pre-Wave-2.
      if (expectedVersion !== undefined) {
        fields.version = expectedVersion + 1;
      }
      await updateDoc(ref, fields).catch((err: unknown) => {
        if (err instanceof PlcNoteVersionConflictError) throw err;
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code: unknown }).code)
            : '';
        if (code === 'permission-denied' || code === 'failed-precondition') {
          throw new PlcNoteVersionConflictError(
            noteId,
            expectedVersion ?? null,
            null
          );
        }
        throw err instanceof Error ? err : new Error(String(err));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  // Soft-delete / restore route through `updateNote` so the optimistic version
  // precondition + conflict handling apply and the note drops out of / returns
  // to the filtered live list (Decision 3.1). `deletedAt` is a plain int
  // (Date.now()) — rule-valid and immediately filterable (no pending-0 window).
  // The caller passes the note's loaded `version` so the tombstone respects the
  // precondition.
  const deleteNote = useCallback(
    async (noteId: string, expectedVersion?: number): Promise<void> => {
      await updateNote(noteId, { deletedAt: Date.now() }, { expectedVersion });
    },
    [updateNote]
  );
  const restoreNote = useCallback(
    async (noteId: string, expectedVersion?: number): Promise<void> => {
      await updateNote(noteId, { deletedAt: null }, { expectedVersion });
    },
    [updateNote]
  );

  // --- To-dos ---
  const createTodo = useCallback(
    async (text: string): Promise<string> => {
      const u = requireUser();
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Todo text required');
      const ref = doc(
        collection(db, PLCS_COLLECTION, latest.current.plcId, 'todos')
      );
      // serverTimestamp() for createdAt (Decision 1.3); `parseTodo` resolves
      // the Timestamp to millis on read via `tsToMillis`.
      await setDoc(ref, {
        id: ref.id,
        text: trimmed,
        done: false,
        createdBy: u.uid,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const toggleTodoDone = useCallback(
    async (todoId: string, done: boolean): Promise<void> => {
      requireUser();
      await updateDoc(todoRef(todoId), { done });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const updateTodoText = useCallback(
    async (todoId: string, text: string): Promise<void> => {
      requireUser();
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Todo text required');
      await updateDoc(todoRef(todoId), { text: trimmed });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  // Soft-delete / restore (Decision 3.1): write the `deletedAt` tombstone via a
  // patch — identity/createdBy/createdAt stay untouched, the post-merge doc
  // passes the widened `keys().hasOnly([...])` + `plcSubDeletedAtOk()`.
  const deleteTodo = useCallback(
    async (todoId: string): Promise<void> => {
      requireUser();
      await updateDoc(todoRef(todoId), { deletedAt: serverTimestamp() });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const restoreTodo = useCallback(
    async (todoId: string): Promise<void> => {
      requireUser();
      await updateDoc(todoRef(todoId), { deletedAt: null });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );

  // --- Docs ---
  const createDoc = useCallback(
    async (input: { title: string; url: string }): Promise<string> => {
      const u = requireUser();
      const ref = doc(
        collection(db, PLCS_COLLECTION, latest.current.plcId, 'docs')
      );
      // serverTimestamp() for the time fields (Decision 1.3); `parseDoc`
      // resolves the Timestamp to millis on read via `tsToMillis`.
      await setDoc(ref, {
        id: ref.id,
        title: input.title,
        url: input.url,
        createdBy: u.uid,
        createdByName: u.displayName ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const updateDocAction = useCallback(
    async (
      docId: string,
      patch: { title?: string; url?: string }
    ): Promise<void> => {
      requireUser();
      const fields: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.url !== undefined) fields.url = patch.url;
      await updateDoc(docRef(docId), fields);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  // Soft-delete / restore (Decision 3.1): tombstone via a patch + bump
  // updatedAt; identity stays untouched.
  const deleteDocAction = useCallback(
    async (docId: string): Promise<void> => {
      requireUser();
      await updateDoc(docRef(docId), {
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const restoreDocAction = useCallback(
    async (docId: string): Promise<void> => {
      requireUser();
      await updateDoc(docRef(docId), {
        deletedAt: null,
        updatedAt: serverTimestamp(),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );

  return useMemo<PlcActions>(
    () => ({
      setMemberRole,
      transferLead,
      removeMember,
      leavePlc,
      renamePlc,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      createTodo,
      toggleTodoDone,
      updateTodoText,
      deleteTodo,
      restoreTodo,
      createDoc,
      updateDoc: updateDocAction,
      deleteDoc: deleteDocAction,
      restoreDoc: restoreDocAction,
    }),
    [
      setMemberRole,
      transferLead,
      removeMember,
      leavePlc,
      renamePlc,
      createNote,
      updateNote,
      deleteNote,
      restoreNote,
      createTodo,
      toggleTodoDone,
      updateTodoText,
      deleteTodo,
      restoreTodo,
      createDoc,
      updateDocAction,
      deleteDocAction,
      restoreDocAction,
    ]
  );
}
