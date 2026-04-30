import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  where,
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
import { Plc } from '@/types';

const PLCS_COLLECTION = 'plcs';
// Mirrors the constant in `usePlcInvitations` — kept here so `deletePlc` can
// sweep outstanding invites in the same batch as the PLC doc.
const INVITATIONS_COLLECTION = 'plc_invitations';

interface UsePlcsResult {
  plcs: Plc[];
  loading: boolean;
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
   * snapshot tick (the snapshot is trustworthy but we want a strong-read
   * for the "already created?" check to avoid racing two teachers).
   */
  getPlcSharedSheetUrl: (plcId: string) => Promise<string | null>;
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
  return {
    id,
    name: data.name,
    leadUid: data.leadUid,
    memberUids: data.memberUids,
    memberEmails,
    sharedSheetUrl,
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
}

/**
 * Live subscription to all PLCs the current user belongs to. Backed by an
 * `array-contains` query on `memberUids` so members and the lead see the same
 * list. Mutations enforce role checks at the rules layer; the hook surfaces
 * thrown errors so callers can toast them.
 */
export const usePlcs = (options?: UsePlcsOptions): UsePlcsResult => {
  const enabled = options?.enabled ?? true;
  const { user } = useAuth();
  const [plcs, setPlcs] = useState<Plc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !user || isAuthBypass) {
      // Defer so we don't trip react-hooks/set-state-in-effect. Same pattern as
      // useRosters.ts for the signed-out branch.
      const timer = setTimeout(() => {
        setPlcs([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const q = query(
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
      },
      (err) => {
        console.error('PLC snapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user, enabled]);

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

  const getPlcSharedSheetUrl = useCallback(
    async (plcId: string): Promise<string | null> => {
      const snap = await getDoc(doc(db, PLCS_COLLECTION, plcId));
      if (!snap.exists()) return null;
      const raw = (snap.data() as { sharedSheetUrl?: unknown }).sharedSheetUrl;
      return typeof raw === 'string' && raw.length > 0 ? raw : null;
    },
    []
  );

  return useMemo(
    () => ({
      plcs,
      loading,
      createPlc,
      renamePlc,
      removeMember,
      leavePlc,
      deletePlc,
      setPlcSharedSheetUrl,
      clearPlcSharedSheetUrl,
      getPlcSharedSheetUrl,
    }),
    [
      plcs,
      loading,
      createPlc,
      renamePlc,
      removeMember,
      leavePlc,
      deletePlc,
      setPlcSharedSheetUrl,
      clearPlcSharedSheetUrl,
      getPlcSharedSheetUrl,
    ]
  );
};
