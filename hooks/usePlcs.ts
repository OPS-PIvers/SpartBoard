import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
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
  return {
    id,
    name: data.name,
    leadUid: data.leadUid,
    memberUids: data.memberUids,
    memberEmails,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

/**
 * Live subscription to all PLCs the current user belongs to. Backed by an
 * `array-contains` query on `memberUids` so members and the lead see the same
 * list. Mutations enforce role checks at the rules layer; the hook surfaces
 * thrown errors so callers can toast them.
 */
export const usePlcs = (): UsePlcsResult => {
  const { user } = useAuth();
  const [plcs, setPlcs] = useState<Plc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isAuthBypass) {
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
  }, [user]);

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

  return useMemo(
    () => ({
      plcs,
      loading,
      createPlc,
      renamePlc,
      removeMember,
      leavePlc,
      deletePlc,
    }),
    [plcs, loading, createPlc, renamePlc, removeMember, leavePlc, deletePlc]
  );
};
