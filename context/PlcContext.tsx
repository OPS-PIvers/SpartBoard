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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Query,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import { parseNote } from '@/hooks/usePlcNotes';
import { parseTodo } from '@/hooks/usePlcTodos';
import { parseDoc } from '@/hooks/usePlcDocs';
import { parseContribution } from '@/hooks/usePlcContributions';
import { parsePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import { parsePlcVideoActivityEntry } from '@/hooks/usePlcVideoActivities';
import { logError } from '@/utils/logError';
import { getPlcMembers } from '@/utils/plc';
import type { PlcSectionId } from '@/components/plc/sections';
import type {
  Plc,
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

/** Incomplete-first sort matching the standalone `usePlcTodos` post-process. */
function sortTodos(list: PlcTodo[]): PlcTodo[] {
  return [...list].sort((a, b) => {
    if (a.done === b.done) return 0;
    return a.done ? 1 : -1;
  });
}

const EMPTY_MEMBERS: PlcMember[] = [];

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
    parseNote
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
    parseDoc
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
    parsePlcQuizEntry
  );
  const videoActivities = useSubcollection<PlcVideoActivityEntry>(
    plcId,
    'video_activities',
    isSectionActive('videoActivities'),
    orderByUpdatedAtDesc,
    parsePlcVideoActivityEntry
  );

  // --- Derived root + members (always on; ride the `plc` prop) ---
  const members = useMemo(
    () => (plc ? getPlcMembers(plc) : EMPTY_MEMBERS),
    [plc]
  );

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
      presence: [],
      activity: [],
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
        presence: [],
        activity: [],
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
      presence: [],
      activity: [],
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
    async (input: { title: string; body: string }): Promise<string> => {
      const u = requireUser();
      const ref = doc(
        collection(db, PLCS_COLLECTION, latest.current.plcId, 'notes')
      );
      // serverTimestamp() for the time fields (Decision 1.3); `parseNote`
      // resolves the Timestamp to millis on read via `tsToMillis`.
      await setDoc(ref, {
        id: ref.id,
        title: input.title,
        body: input.body,
        createdBy: u.uid,
        createdAt: serverTimestamp(),
        lastEditedBy: u.uid,
        lastEditedAt: serverTimestamp(),
      });
      return ref.id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const updateNote = useCallback(
    async (
      noteId: string,
      patch: { title?: string; body?: string }
    ): Promise<void> => {
      const u = requireUser();
      const fields: Record<string, unknown> = {
        lastEditedBy: u.uid,
        lastEditedAt: serverTimestamp(),
      };
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.body !== undefined) fields.body = patch.body;
      await updateDoc(noteRef(noteId), fields);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
  );
  const deleteNote = useCallback(
    async (noteId: string): Promise<void> => {
      requireUser();
      await deleteDoc(noteRef(noteId));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest]
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
  const deleteTodo = useCallback(
    async (todoId: string): Promise<void> => {
      requireUser();
      await deleteDoc(todoRef(todoId));
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
  const deleteDocAction = useCallback(
    async (docId: string): Promise<void> => {
      requireUser();
      await deleteDoc(docRef(docId));
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
      createTodo,
      toggleTodoDone,
      updateTodoText,
      deleteTodo,
      createDoc,
      updateDoc: updateDocAction,
      deleteDoc: deleteDocAction,
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
      createTodo,
      toggleTodoDone,
      updateTodoText,
      deleteTodo,
      createDoc,
      updateDocAction,
      deleteDocAction,
    ]
  );
}
