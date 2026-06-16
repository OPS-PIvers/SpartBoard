import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  getDocs,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { DEFAULT_PLC_FEATURE_SETTINGS, Plc, PlcFeatureSettings } from '@/types';

const PLCS_COLLECTION = 'plcs';
// Cap on the admin-mode whole-collection listen. The member-mode query is
// naturally bounded by membership, but the admin picker reads ALL PLCs, so
// bound it to avoid streaming an unbounded collection (and the Firestore read
// cost that comes with it). 500 is comfortably above the real-world PLC count
// for a single district. The query relies only on the automatic `__name__`
// index (no custom `orderBy`); the snapshot handler sorts by name client-side
// for the visible alphabetical order — see the `list.sort` below.
const ADMIN_PLCS_LIMIT = 500;
// Mirrors the constant in `usePlcInvitations` — kept here so `deletePlc` can
// sweep outstanding invites in the same batch as the PLC doc.
const INVITATIONS_COLLECTION = 'plc_invitations';

interface UsePlcsResult {
  plcs: Plc[];
  loading: boolean;
  /**
   * Last snapshot error, or null. Surfaced so consumers (e.g. the admin
   * PLC-target picker) can render a load-failure message instead of a
   * misleading empty list. Reset to null on each successful snapshot.
   */
  error: Error | null;
  /** Create a new PLC with the current user as lead + sole member. Returns the new doc id. */
  createPlc: (name: string) => Promise<string>;
  /** Lead-only: rename the PLC. */
  renamePlc: (plcId: string, name: string) => Promise<void>;
  /** Lead-only: remove a member by uid. Members removing themselves should call `leavePlc`. */
  removeMember: (plcId: string, uid: string) => Promise<void>;
  /** Non-lead self-removal. The lead must transfer leadership before leaving. */
  leavePlc: (plcId: string) => Promise<void>;
  /** Lead-only: dissolve the PLC entirely. */
  deletePlc: (plcId: string) => Promise<void>;
  /**
   * Any member: persist the auto-created PLC Google Sheet URL on the PLC
   * doc so teammates reuse it on subsequent assignments. Implemented as a
   * transactional "set-if-empty" so two members assigning their first
   * PLC quiz simultaneously can't both stomp `sharedSheetUrl`. The caller
   * passes the URL of the sheet they just created; the resolved URL the
   * PLC actually ended up with is returned (so the caller can detect a
   * race-loss and switch to the canonical URL — their own freshly-
   * created sheet may be orphaned in their Drive in that case, which is
   * an acceptable rare-race outcome).
   *
   * Rejected by rules if the caller is not a member of the PLC.
   */
  setPlcSharedSheetUrl: (plcId: string, url: string) => Promise<string>;
  /**
   * Any member: clear the cached sheet URL (e.g. after discovering the
   * sheet was deleted in Drive). The next PLC assignment will create a
   * fresh sheet.
   */
  clearPlcSharedSheetUrl: (plcId: string) => Promise<void>;
  /**
   * One-off read of a PLC's sharedSheetUrl. Used at assignment-create
   * time when we need the current value without waiting for the next
   * snapshot tick.
   *
   * State-first with a `getDoc` fallback (F10): when the PLC is already
   * in the live `usePlcs` subscription AND its snapshotted `sharedSheetUrl`
   * is non-null, we return that cached value and skip the network read —
   * the snapshot is the authoritative, real-time-synced copy, so a present
   * non-null value can be trusted. We fall back to a `getDoc` only when the
   * PLC is absent from state (subscription not yet hydrated, or an
   * admin-only doc the member-scoped listen never sees) OR state reports a
   * null/absent URL — in the latter case the `getDoc` re-confirms with a
   * strong read so the "already created?" race check can't be defeated by a
   * locally-stale "still empty" snapshot.
   */
  getPlcSharedSheetUrl: (plcId: string) => Promise<string | null>;
  /**
   * Synchronous selector returning the live-subscribed PLC metadata for
   * `plcId`, or `undefined` when the PLC isn't in the current subscription
   * (not yet hydrated, or out of scope for this read mode). Lets callers on
   * a hot path read `sharedSheetUrl` / `features` / etc. straight from the
   * real-time-synced state instead of issuing a per-call `getDoc`. Always
   * pair with a `getDoc` fallback when `undefined` is returned.
   */
  getPlcFromState: (plcId: string) => Plc | undefined;
  /**
   * Any member: toggle the PLC dashboard `features` map. Always writes the
   * full canonical map (defaults merged in) so partial historical writes
   * can't leave dangling fields. Rejected by rules if the caller is not a
   * current member of the PLC.
   */
  updatePlcFeatures: (
    plcId: string,
    features: PlcFeatureSettings
  ) => Promise<void>;
}

function parsePlc(id: string, data: Record<string, unknown>): Plc | null {
  if (
    typeof data.name !== 'string' ||
    typeof data.leadUid !== 'string' ||
    !Array.isArray(data.memberUids) ||
    !data.memberUids.every((u): u is string => typeof u === 'string')
  ) {
    return null;
  }
  const rawEmails = (data.memberEmails ?? {}) as Record<string, unknown>;
  const memberEmails: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawEmails)) {
    if (typeof v === 'string') memberEmails[k] = v;
  }
  // sharedSheetUrl: optional string OR explicit null. Treat any other
  // shape (including absent) as null so downstream code can rely on the
  // "absent ⇒ null" equivalence.
  let sharedSheetUrl: string | null = null;
  if (typeof data.sharedSheetUrl === 'string') {
    sharedSheetUrl = data.sharedSheetUrl;
  }
  // features: optional map of dashboard section toggles. Read consumers
  // should always merge against DEFAULT_PLC_FEATURE_SETTINGS via
  // `getPlcFeatures()` rather than reading this field directly, so an
  // absent field (legacy PLCs) and partial maps both default to enabled.
  let features: PlcFeatureSettings | undefined;
  if (data.features && typeof data.features === 'object') {
    const raw = data.features as Record<string, unknown>;
    features = {
      quizzes:
        typeof raw.quizzes === 'boolean'
          ? raw.quizzes
          : DEFAULT_PLC_FEATURE_SETTINGS.quizzes,
      videoActivities:
        typeof raw.videoActivities === 'boolean'
          ? raw.videoActivities
          : DEFAULT_PLC_FEATURE_SETTINGS.videoActivities,
      notes:
        typeof raw.notes === 'boolean'
          ? raw.notes
          : DEFAULT_PLC_FEATURE_SETTINGS.notes,
      todos:
        typeof raw.todos === 'boolean'
          ? raw.todos
          : DEFAULT_PLC_FEATURE_SETTINGS.todos,
      sharedBoards:
        typeof raw.sharedBoards === 'boolean'
          ? raw.sharedBoards
          : DEFAULT_PLC_FEATURE_SETTINGS.sharedBoards,
    };
  }
  return {
    id,
    name: data.name,
    leadUid: data.leadUid,
    memberUids: data.memberUids,
    memberEmails,
    sharedSheetUrl,
    ...(features ? { features } : {}),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

interface UsePlcsOptions {
  /**
   * Skip the Firestore `onSnapshot` subscription when false. Mutators stay
   * usable so callers can still call `createPlc` etc. from a disabled state.
   * Used by `Sidebar` to avoid keeping a listener alive while the drawer is
   * closed. Defaults to true.
   */
  enabled?: boolean;
  /**
   * Admin read mode. When true, subscribe to the WHOLE `/plcs` collection
   * (unfiltered) instead of the membership `array-contains` query, so an
   * admin who isn't a member of every PLC can still enumerate them (e.g. the
   * admin "push resource to specific PLCs" picker). Firestore rules already
   * permit admins to read `/plcs` (firestore.rules `... || isAdmin()`), so
   * the unfiltered listen is authorized.
   *
   * In this mode the mutation methods are no-ops — the picker only needs the
   * list, and admins manage PLC membership through other surfaces. Defaults
   * to false (membership-scoped list, all current callers unchanged).
   */
  asAdmin?: boolean;
}

/**
 * Live subscription to PLCs. By default this is backed by an `array-contains`
 * query on `memberUids`, so members and the lead see the same list of PLCs
 * they belong to. Mutations enforce role checks at the rules layer; the hook
 * surfaces thrown errors so callers can toast them.
 *
 * Pass `{ asAdmin: true }` to instead subscribe to the entire `/plcs`
 * collection — used by admin surfaces that must enumerate every PLC
 * regardless of membership. The mutation methods become no-ops in that mode.
 */
export const usePlcs = (options?: UsePlcsOptions): UsePlcsResult => {
  const enabled = options?.enabled ?? true;
  const asAdmin = options?.asAdmin ?? false;
  const { user } = useAuth();
  const [plcs, setPlcs] = useState<Plc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Latest `plcs` snapshot reachable from the stable `getPlcSharedSheetUrl`
  // / `getPlcFromState` callbacks without re-creating them every render.
  // Updated via `useEffect` (not during render) to keep the
  // `react-hooks/refs` lint happy — same pattern as `assignmentsRef` in
  // useQuizAssignments.ts. By the time a consumer calls one of those
  // selectors the effect has run and the ref reflects the live state.
  const plcsRef = useRef<Plc[]>(plcs);
  useEffect(() => {
    plcsRef.current = plcs;
  }, [plcs]);

  useEffect(() => {
    if (!enabled || !user || isAuthBypass) {
      // Defer so we don't trip react-hooks/set-state-in-effect. Same pattern as
      // useRosters.ts for the signed-out branch.
      const timer = setTimeout(() => {
        setPlcs([]);
        setLoading(false);
        setError(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    // Admin mode reads the whole collection (bounded only by `limit`); member
    // mode scopes to PLCs the current user belongs to. The admin query
    // deliberately omits `orderBy('name')` so it relies only on the automatic
    // `__name__` index — the snapshot handler sorts the results by name
    // client-side (see `list.sort` below), preserving the visible alphabetical
    // order without requiring a custom single-field index.
    const q = asAdmin
      ? query(collection(db, PLCS_COLLECTION), limit(ADMIN_PLCS_LIMIT))
      : query(
          collection(db, PLCS_COLLECTION),
          where('memberUids', 'array-contains', user.uid)
        );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: Plc[] = [];
        snap.forEach((d) => {
          const parsed = parsePlc(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setPlcs(list);
        setLoading(false);
        // Clear any prior error on a recovered snapshot.
        setError(null);
      },
      (err) => {
        console.error('PLC snapshot error:', err);
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsubscribe();
  }, [user, enabled, asAdmin]);

  const createPlc = useCallback(
    async (name: string): Promise<string> => {
      if (!user) throw new Error('Not signed in');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('PLC name required');
      const email = (user.email ?? '').toLowerCase();
      if (!email) throw new Error('Account email required to create a PLC');
      const now = Date.now();
      const ref = doc(collection(db, PLCS_COLLECTION));
      await setDoc(ref, {
        name: trimmed,
        leadUid: user.uid,
        memberUids: [user.uid],
        memberEmails: { [user.uid]: email },
        createdAt: now,
        updatedAt: now,
      });
      return ref.id;
    },
    [user]
  );

  const renamePlc = useCallback(
    async (plcId: string, name: string) => {
      if (!user) return;
      const trimmed = name.trim();
      if (!trimmed) throw new Error('PLC name required');
      await setDoc(
        doc(db, PLCS_COLLECTION, plcId),
        { name: trimmed, updatedAt: Date.now() },
        { merge: true }
      );
    },
    [user]
  );

  // Transactional so concurrent edits to memberUids/memberEmails don't drop
  // a member silently. Both fields must move in lockstep — diverging maps
  // would make the lead's "remove member" UI render stale state.
  const removeMember = useCallback(
    async (plcId: string, uid: string) => {
      if (!user) return;
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const data = snap.data();
        // Defensive: the rules' lead-update branch requires the lead remain in
        // memberUids, so removing the lead via this hook would be rejected at
        // the server with PERMISSION_DENIED. The UI never surfaces this path,
        // but guard the public hook surface explicitly.
        if (uid === data.leadUid) {
          throw new Error(
            'The lead cannot be removed; transfer leadership or delete the PLC'
          );
        }
        const memberUids = (data.memberUids ?? []) as string[];
        const memberEmails = {
          ...((data.memberEmails ?? {}) as Record<string, string>),
        };
        delete memberEmails[uid];
        tx.update(ref, {
          memberUids: memberUids.filter((u) => u !== uid),
          memberEmails,
          updatedAt: Date.now(),
        });
      });
    },
    [user]
  );

  const leavePlc = useCallback(
    async (plcId: string) => {
      if (!user) return;
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('PLC not found');
        const data = snap.data();
        if (data.leadUid === user.uid) {
          throw new Error(
            'Lead must transfer leadership before leaving the PLC'
          );
        }
        const memberUids = (data.memberUids ?? []) as string[];
        const memberEmails = {
          ...((data.memberEmails ?? {}) as Record<string, string>),
        };
        delete memberEmails[user.uid];
        tx.update(ref, {
          memberUids: memberUids.filter((u) => u !== user.uid),
          memberEmails,
          updatedAt: Date.now(),
        });
      });
    },
    [user]
  );

  const deletePlc = useCallback(
    async (plcId: string) => {
      if (!user) return;
      // Sweep outstanding invitations in the same atomic batch as the PLC
      // doc. The invite-delete rule does a get() on the parent PLC, so the
      // invite deletes must commit alongside (not after) the PLC delete —
      // batch operations evaluate rules against the pre-batch state, so
      // the PLC is still readable while each invite-delete is authorized.
      // Without this, pending invites would orphan in /plc_invitations and
      // become unrevokable.
      const invitesQuery = query(
        collection(db, INVITATIONS_COLLECTION),
        where('plcId', '==', plcId)
      );
      const invitesSnap = await getDocs(invitesQuery);
      const batch = writeBatch(db);
      invitesSnap.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, PLCS_COLLECTION, plcId));
      await batch.commit();
    },
    [user]
  );

  // Any member of the PLC can set sharedSheetUrl when it is currently
  // null/absent. The rule branch restricts the diff to sharedSheetUrl +
  // updatedAt so one member can't also mutate memberUids on this path.
  //
  // Transactional set-if-empty: two members concurrently assigning their
  // first PLC quiz could both call this. Without the transaction, the
  // last write wins and one teammate's freshly-created sheet would be
  // pointed at by the URL while the other's becomes a phantom in their
  // Drive. With the transaction, we read the current value first; if a
  // racing teammate has already populated `sharedSheetUrl`, we skip our
  // write and return the existing URL — the caller then uses that
  // canonical URL (and reconciles permissions for it) instead of the
  // sheet they just created.
  const setPlcSharedSheetUrl = useCallback(
    async (plcId: string, url: string): Promise<string> => {
      // Throw rather than silently no-op + return the input URL —
      // returning would mislead the caller into thinking the URL was
      // persisted, and they'd skip the auto-create retry that should
      // run on next sign-in. Mirrors the pattern in createPlc / leavePlc.
      if (!user) throw new Error('Not signed in');
      return runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          throw new Error('PLC not found');
        }
        const data = snap.data() as { sharedSheetUrl?: unknown };
        const existing =
          typeof data.sharedSheetUrl === 'string' && data.sharedSheetUrl
            ? data.sharedSheetUrl
            : null;
        if (existing) {
          // Race lost — keep the canonical URL, our own sheet becomes
          // orphaned (rare; acceptable for a true concurrent-create
          // collision).
          return existing;
        }
        tx.update(ref, {
          sharedSheetUrl: url,
          updatedAt: Date.now(),
        });
        return url;
      });
    },
    [user]
  );

  // Idempotent transactional clear: only writes when sharedSheetUrl is
  // currently a non-empty string. The tightened rule
  // `isSettingPlcSharedSheetUrl()` requires `sharedSheetUrl` to appear
  // in `affectedKeys()`, so a redundant null→null write would be
  // rejected with PERMISSION_DENIED. This guards the 404 recovery
  // flow against the case where a racing teammate already cleared the
  // URL between our 404 detection and our own clear call.
  const clearPlcSharedSheetUrl = useCallback(
    async (plcId: string) => {
      if (!user) return;
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const raw = (snap.data() as { sharedSheetUrl?: unknown })
          .sharedSheetUrl;
        const isNonEmptyString = typeof raw === 'string' && raw.length > 0;
        if (!isNonEmptyString) {
          // Already null/absent — nothing to clear. Skip the write.
          return;
        }
        tx.update(ref, {
          sharedSheetUrl: null,
          updatedAt: Date.now(),
        });
      });
    },
    [user]
  );

  // Synchronous selector over the live `plcs` subscription. Reads from the
  // ref (not `plcs` directly) so the callback identity stays stable across
  // snapshot ticks. `undefined` ⇒ the PLC isn't in scope for this read mode
  // / hasn't hydrated yet; callers must fall back to a `getDoc` in that case.
  const getPlcFromState = useCallback(
    (plcId: string): Plc | undefined =>
      plcsRef.current.find((p) => p.id === plcId),
    []
  );

  const getPlcSharedSheetUrl = useCallback(
    async (plcId: string): Promise<string | null> => {
      // State-first (F10): if the live subscription already carries this PLC
      // with a populated `sharedSheetUrl`, trust the real-time-synced value
      // and skip the network read. A present non-null URL can only have come
      // from a committed write, so it's safe for the "already created?"
      // check. We deliberately do NOT short-circuit on a state value of
      // `null`/absent — a locally-stale "still empty" snapshot must not let a
      // racing teammate's just-created sheet go unnoticed, so we re-confirm
      // with a strong `getDoc` in that case (and whenever the PLC is missing
      // from state entirely, e.g. before the subscription hydrates).
      const cached = getPlcFromState(plcId)?.sharedSheetUrl;
      if (typeof cached === 'string' && cached.length > 0) {
        return cached;
      }
      const snap = await getDoc(doc(db, PLCS_COLLECTION, plcId));
      if (!snap.exists()) return null;
      const raw = (snap.data() as { sharedSheetUrl?: unknown }).sharedSheetUrl;
      return typeof raw === 'string' && raw.length > 0 ? raw : null;
    },
    [getPlcFromState]
  );

  // Any current member: write the canonical features map. We always send
  // the full merged shape (defaults overlaid with the partial caller map)
  // so partial writes can't leave dangling fields, and so the rule's
  // `is map` check always sees a complete object. The `isUpdatingPlcFeatures`
  // rule branch guards the field-set so this can't be used to smuggle
  // membership/leadership/sheet-URL changes.
  const updatePlcFeatures = useCallback(
    async (plcId: string, features: PlcFeatureSettings) => {
      if (!user) throw new Error('Not signed in');
      const merged: PlcFeatureSettings = {
        ...DEFAULT_PLC_FEATURE_SETTINGS,
        ...features,
      };
      await setDoc(
        doc(db, PLCS_COLLECTION, plcId),
        { features: merged, updatedAt: Date.now() },
        { merge: true }
      );
    },
    [user]
  );

  return useMemo(
    () => ({
      plcs,
      loading,
      error,
      createPlc,
      renamePlc,
      removeMember,
      leavePlc,
      deletePlc,
      setPlcSharedSheetUrl,
      clearPlcSharedSheetUrl,
      getPlcSharedSheetUrl,
      getPlcFromState,
      updatePlcFeatures,
    }),
    [
      plcs,
      loading,
      error,
      createPlc,
      renamePlc,
      removeMember,
      leavePlc,
      deletePlc,
      setPlcSharedSheetUrl,
      clearPlcSharedSheetUrl,
      getPlcSharedSheetUrl,
      getPlcFromState,
      updatePlcFeatures,
    ]
  );
};
