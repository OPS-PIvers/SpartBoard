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
  serverTimestamp,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  DEFAULT_PLC_FEATURE_SETTINGS,
  Plc,
  PlcFeatureSettings,
  PlcMember,
  PlcRole,
} from '@/types';
import { tsToMillis } from '@/utils/plc';
import { writePlcActivityEvent } from '@/utils/plcActivity';
import i18n from '@/i18n/index';

const PLCS_COLLECTION = 'plcs';

/**
 * Resolve a stable display name for an activity actor: prefer the display name,
 * then the email, then the uid. Empty strings are treated as absent (the `||`
 * chain, not `??`) so a blank display name still falls through to the email.
 * Mirrors the helper in `usePlcComments` / `usePlcTrash` so every activity
 * writer snapshots names the same way.
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
// Cap on the admin-mode whole-collection listen. The member-mode query is
// naturally bounded by membership, but the admin picker reads ALL PLCs, so
// bound it to avoid streaming an unbounded collection (and the Firestore read
// cost that comes with it). 500 is comfortably above the real-world PLC count
// for a single district. The query relies ONLY on the automatic `__name__`
// (document-id) index — there is no server-side `orderBy('name')` — so no
// custom composite index in firestore.indexes.json is required. The
// snapshot handler sorts the (capped) result set by name client-side, so the
// user-visible admin list is still alphabetical; the only consequence of
// truncating by `__name__` rather than by name is that, in the (unrealistic)
// event the district ever exceeds 500 PLCs, the dropped tail is an arbitrary
// rather than the alphabetically-last subset.
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
  /**
   * Lead / co-lead only: set a member's role (`coLead | member | viewer`).
   * Rejects demoting/promoting the current lead — leadership only moves via
   * `transferLead` (the exactly-one-lead invariant). Maintains the `members`
   * map; `memberUids` / `leadUid` / `memberEmails` are unaffected by a role
   * change (the member stays a member). Rejected by rules if the caller is
   * not the lead.
   */
  setMemberRole: (plcId: string, uid: string, role: PlcRole) => Promise<void>;
  /**
   * Lead-only: hand the `lead` role to another active member (atomic).
   * Demotes the outgoing lead to `member`, promotes the target to `lead`,
   * and updates the denormalized `leadUid` mirror in lockstep. Rejects if the
   * target is not an active member. Enforces the exactly-one-lead invariant.
   */
  transferLead: (plcId: string, toUid: string) => Promise<void>;
  /** Lead-only: dissolve the PLC entirely. */
  deletePlc: (plcId: string) => Promise<void>;
  /**
   * Admin recovery (Decision 3.4): reassign the `lead` role of an abandoned
   * PLC to another EXISTING active member. Intended for an in-org SITE ADMIN
   * who is NOT a member of the PLC — the only mutator on this hook authorized
   * for a non-member caller. Authorized server-side by the
   * `isAdminManagingPlc` rules branch, which requires the caller be an
   * `isAdmin()` belonging to the PLC's `orgId` (org-less legacy PLCs are NOT
   * admin-recoverable).
   *
   * Moves `leadUid` + the canonical `members` lead role in LOCKSTEP (incoming
   * → 'lead', outgoing → 'member') with the membership SET unchanged, and
   * writes ONLY the `['leadUid','members','memberUids','memberEmails',
   * 'updatedAt']` fields the rule's closed diff admits — so, unlike the
   * member-facing mutators, it deliberately does NOT stamp a `roleChangeUid`
   * pointer (that extra key would fail the rule's `hasOnly` check) and does
   * NOT emit a fire-and-forget activity event (a non-member admin write to the
   * activity subcollection is denied by rules). Rejects when the target is not
   * an existing active member or is already the lead.
   *
   * Unlike the other mutators, this remains usable in `asAdmin` mode (the
   * admin picker's read mode) — it is the recovery action that mode exists to
   * support.
   */
  adminReassignLead: (plcId: string, toUid: string) => Promise<void>;
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
   * Read a PLC's sharedSheetUrl on the assignment-create path. When the
   * PLC is already in this hook's live `plcs` state (i.e. the caller is a
   * member, which is the case for every real "assign a PLC quiz" flow),
   * we read the value straight from the already-subscribed snapshot —
   * NO extra Firestore `getDoc`. The `onSnapshot` listener keeps that
   * value current, so the cached read is not stale. Only when the PLC is
   * absent from local state (e.g. an admin/non-member surface, or before
   * the first snapshot has landed) do we fall back to a one-off `getDoc`.
   *
   * Note: the transactional "set-if-empty" race guard for two teachers
   * assigning their first PLC quiz simultaneously lives in
   * `setPlcSharedSheetUrl` (which always re-reads inside its transaction);
   * this getter is just the cheap "do we already have a sheet?" probe, so
   * trading the strong-read for the live-snapshot value here is safe.
   */
  getPlcSharedSheetUrl: (plcId: string) => Promise<string | null>;
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
  /**
   * Any member: toggle the opt-in weekly email digest flag (`digestOptIn`,
   * Decision 2.3). Writes ONLY the flag + `updatedAt` so the
   * `isUpdatingPlcDigestOptIn` rules branch admits it. Rejected by rules if the
   * caller is not a current member of the PLC. The actual email is sent by the
   * scheduled `plcWeeklyDigest` Cloud Function, gated additionally by the
   * global `plc-digest.enabled` kill switch.
   */
  updatePlcDigestOptIn: (plcId: string, optIn: boolean) => Promise<void>;
}

const VALID_PLC_ROLES: ReadonlySet<PlcRole> = new Set<PlcRole>([
  'lead',
  'coLead',
  'member',
  'viewer',
]);

/**
 * Parse the canonical `members` map off a PLC doc (Decision 1.2). Tolerant of
 * a `serverTimestamp()` `joinedAt` (resolved via `tsToMillis`) and of legacy
 * numeric values during rollout. Returns `{}` when the map is absent or
 * malformed — callers (and the `getPlcMembers` helper) then fall back to the
 * denormalized `memberUids` / `memberEmails` / `leadUid` arrays.
 */
function parsePlcMembers(value: unknown): Record<string, PlcMember> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, PlcMember> = {};
  for (const [uid, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const role = m.role;
    if (typeof role !== 'string' || !VALID_PLC_ROLES.has(role as PlcRole)) {
      continue;
    }
    const status = m.status === 'removed' ? 'removed' : 'active';
    out[uid] = {
      uid: typeof m.uid === 'string' ? m.uid : uid,
      email: typeof m.email === 'string' ? m.email.trim().toLowerCase() : '',
      displayName: typeof m.displayName === 'string' ? m.displayName : '',
      role: role as PlcRole,
      joinedAt: tsToMillis(m.joinedAt),
      status,
    };
  }
  return out;
}

/**
 * A members-map entry as it is *written* to Firestore. Mirrors `PlcMember`
 * but lets `joinedAt` be the unresolved `serverTimestamp()` sentinel for a
 * fresh join (Decision 1.3) — the typed `PlcMember.joinedAt: number` is the
 * read-side shape, after the parser resolves the Timestamp.
 */
type PlcMemberWrite = Omit<PlcMember, 'joinedAt'> & { joinedAt: unknown };

/**
 * Read the canonical `members` map off raw transaction data, falling back to
 * synthesizing it from the denormalized `memberUids` / `memberEmails` /
 * `leadUid` arrays for legacy (un-migrated) PLCs. Every membership mutator
 * starts from this so a role/transfer write on a legacy PLC backfills the
 * full map (an empty `members: {}` is treated as un-migrated by the read
 * helpers, so a half-written map would silently fall back to the arrays).
 *
 * Existing members keep their stored `joinedAt` (a Firestore Timestamp on
 * read — written straight back so it isn't reset); synthesized legacy members
 * get `serverTimestamp()` so the first canonical write stamps a real join
 * time rather than freezing `0`.
 */
function readMembersForWrite(
  data: Record<string, unknown>
): Record<string, PlcMemberWrite> {
  const parsed = parsePlcMembers(data.members);
  if (Object.keys(parsed).length > 0) {
    // Preserve the raw stored joinedAt (Timestamp/number) rather than the
    // parsed millis, so writing it back does not lose precision or reset it.
    const rawMembers = (data.members ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const out: Record<string, PlcMemberWrite> = {};
    for (const [uid, m] of Object.entries(parsed)) {
      out[uid] = {
        uid: m.uid,
        email: m.email,
        displayName: m.displayName,
        role: m.role,
        status: m.status,
        joinedAt: rawMembers[uid]?.joinedAt ?? serverTimestamp(),
      };
    }
    return out;
  }

  // Legacy fallback: synthesize from the denormalized arrays.
  const leadUid = typeof data.leadUid === 'string' ? data.leadUid : '';
  const memberUids = Array.isArray(data.memberUids)
    ? (data.memberUids as unknown[]).filter(
        (u): u is string => typeof u === 'string'
      )
    : [];
  const emails = (data.memberEmails ?? {}) as Record<string, unknown>;
  const out: Record<string, PlcMemberWrite> = {};
  for (const uid of memberUids) {
    const rawEmail = typeof emails[uid] === 'string' ? emails[uid] : '';
    const email = rawEmail.trim().toLowerCase();
    const displayName = email.includes('@') ? email.split('@')[0] : email;
    out[uid] = {
      uid,
      email,
      displayName,
      role: uid === leadUid ? 'lead' : 'member',
      status: 'active',
      joinedAt: serverTimestamp(),
    };
  }
  return out;
}

/** Active member uids derived from a write-shape members map. */
function activeMemberUids(members: Record<string, PlcMemberWrite>): string[] {
  return Object.values(members)
    .filter((m) => m.status === 'active')
    .map((m) => m.uid);
}

/** Active member email map (`{ uid: email }`) derived from a members map. */
function activeMemberEmails(
  members: Record<string, PlcMemberWrite>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of Object.values(members)) {
    if (m.status === 'active' && m.email) out[m.uid] = m.email;
  }
  return out;
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
  // digestOptIn: opt-in weekly digest flag (Decision 2.3). Default false —
  // only the literal boolean `true` opts a PLC in.
  const digestOptIn = data.digestOptIn === true;
  // orgId / buildingId: optional tenancy (Decision 1.1). Absent ⇒ null.
  const orgId = typeof data.orgId === 'string' ? data.orgId : null;
  const buildingId =
    typeof data.buildingId === 'string' ? data.buildingId : null;
  // members: canonical membership map (Decision 1.2). Legacy PLCs lack it —
  // an empty map is fine; `getPlcMembers` synthesizes from the denormalized
  // arrays in that case.
  const members = parsePlcMembers(data.members);
  return {
    id,
    name: data.name,
    orgId,
    buildingId,
    members,
    leadUid: data.leadUid,
    memberUids: data.memberUids,
    memberEmails,
    sharedSheetUrl,
    digestOptIn,
    ...(features ? { features } : {}),
    // serverTimestamp-tolerant (Decision 1.3): accept a Firestore Timestamp
    // or a legacy numeric millis value.
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
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
  // `orgId` + the creator's building are stamped onto new PLCs (createPlc) so a
  // freshly created team is immediately discoverable in the org/building
  // directory (Decision 1.1). Defaults keep this safe if a consumer mocks a
  // minimal auth surface.
  const {
    user,
    orgId = null,
    selectedBuildings = [],
    buildingIds = [],
  } = useAuth();
  const [plcs, setPlcs] = useState<Plc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Latest `plcs` snapshot accessible from the stable `getPlcSharedSheetUrl`
  // callback without re-creating it (and the memoized result object) on every
  // list change. The `onSnapshot` listener keeps this current, so reading
  // `sharedSheetUrl` from here is not a stale read. Assigned directly in the
  // render body (per CLAUDE.md house rules) so it stays in sync with state
  // synchronously and is readable from the callback without an effect commit.
  const plcsRef = useRef<Plc[]>(plcs);
  // eslint-disable-next-line react-hooks/refs
  plcsRef.current = plcs;

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

    // Admin mode reads the whole collection (unfiltered apart from a bounded
    // `limit`); member mode scopes to PLCs the current user belongs to. We do
    // NOT `orderBy('name')` on the server — that would add an index dependency
    // (and the latency/index-build surprises that come with it). Instead the
    // snapshot handler sorts by name client-side, so the admin list ordering
    // the user sees is unchanged while the query relies only on the automatic
    // `__name__` index.
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
      if (!user) throw new Error(i18n.t('plc.errors.notSignedIn'));
      const trimmed = name.trim();
      if (!trimmed) throw new Error(i18n.t('plc.errors.nameRequired'));
      const email = (user.email ?? '').toLowerCase();
      if (!email) {
        throw new Error(i18n.t('plc.errors.accountEmailRequired'));
      }
      const displayName = user.displayName ?? '';
      // Inherit the creator's tenancy so the new PLC surfaces in the
      // org/building directory right away (Decision 1.1). Building resolution
      // mirrors usePlcBuildingDirectory's "my building" (explicit UI selection
      // first, else the org-assigned building). Absent ⇒ null (a teacher with
      // no org/building simply creates an untenanted PLC, as before).
      const creatorBuildingId = selectedBuildings[0] ?? buildingIds[0] ?? null;
      const ref = doc(collection(db, PLCS_COLLECTION));
      await setDoc(ref, {
        name: trimmed,
        orgId: orgId ?? null,
        buildingId: creatorBuildingId,
        // Canonical membership map (Decision 1.2). The creator is the sole
        // member and the lead. `joinedAt` is a serverTimestamp sentinel
        // resolved to millis on read by `parsePlcMembers`.
        members: {
          [user.uid]: {
            uid: user.uid,
            email,
            displayName,
            role: 'lead',
            joinedAt: serverTimestamp(),
            status: 'active',
          },
        },
        // Denormalized indexes kept in lockstep with `members` on every
        // membership write (Firestore can't array-contains-query a map; the
        // PLC list query filters on `memberUids`).
        leadUid: user.uid,
        memberUids: [user.uid],
        memberEmails: { [user.uid]: email },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    [user, orgId, selectedBuildings, buildingIds]
  );

  const renamePlc = useCallback(
    async (plcId: string, name: string) => {
      if (!user) return;
      const trimmed = name.trim();
      if (!trimmed) throw new Error(i18n.t('plc.errors.nameRequired'));
      await setDoc(
        doc(db, PLCS_COLLECTION, plcId),
        { name: trimmed, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [user]
  );

  // Transactional so concurrent edits to the members map + denormalized
  // indexes don't drop a member silently. The `members` map, `memberUids`,
  // `memberEmails`, and `leadUid` mirror all move in lockstep — diverging
  // copies would make the lead's "remove member" UI render stale state and
  // break the membership-gated rules/list query.
  const removeMember = useCallback(
    async (plcId: string, uid: string) => {
      if (!user) return;
      // Snapshot the removed member's display label inside the txn so the
      // post-commit `member_left` activity event renders without a join.
      // `didRemove` gates the emit so a no-op (member not in the map) doesn't
      // log a phantom departure.
      let removedName = '';
      let didRemove = false;
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const members = readMembersForWrite(data);
        const isRemovingLead =
          members[uid]?.role === 'lead' || uid === data.leadUid;
        // Defensive: the rules' lead-update branch requires the lead remain in
        // memberUids, so removing the lead via this hook would be rejected at
        // the server with PERMISSION_DENIED. The UI never surfaces this path,
        // but guard the public hook surface explicitly.
        if (isRemovingLead) {
          throw new Error(i18n.t('plc.errors.leadCannotBeRemoved'));
        }
        // Mark removed in the canonical map (audit trail) AND drop from the
        // denormalized indexes so the array-contains list query no longer
        // returns this PLC for the removed member.
        if (members[uid]) {
          removedName = members[uid].displayName || members[uid].email || uid;
          didRemove = true;
          members[uid] = { ...members[uid], status: 'removed' };
        }
        tx.update(ref, {
          members,
          memberUids: activeMemberUids(members),
          memberEmails: activeMemberEmails(members),
          // Transient pointer naming the single member this broad-branch write
          // removes. The rules' `plcBroadMembersOk()` uses it to confirm the
          // members-map mutation is a lone removal (not a second-lead mint) —
          // the same pointer convention `setMemberRole` uses with
          // `roleChangeUid`. Not persisted as membership data; ignored on read.
          removeMemberUid: uid,
          updatedAt: serverTimestamp(),
        });
      });
      // Activity log (Decision 2.2, §3.4) — fire-and-forget after the canonical
      // membership write commits; never blocks or fails it. The actor is the
      // lead performing the removal; `targetId`/`targetTitle` name the removed
      // member so the feed reads "{lead} removed {member}".
      if (didRemove) {
        void writePlcActivityEvent(plcId, {
          type: 'member_left',
          actorUid: user.uid,
          actorName: resolveActorName(user),
          targetType: 'member',
          targetId: uid,
          ...(removedName ? { targetTitle: removedName } : {}),
        });
      }
    },
    [user]
  );

  const leavePlc = useCallback(
    async (plcId: string) => {
      if (!user) return;
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(i18n.t('plc.errors.plcNotFound'));
        const data = snap.data() as Record<string, unknown>;
        const members = readMembersForWrite(data);
        const isLead =
          members[user.uid]?.role === 'lead' || data.leadUid === user.uid;
        if (isLead) {
          throw new Error(i18n.t('plc.errors.leadCannotLeave'));
        }
        if (members[user.uid]) {
          members[user.uid] = { ...members[user.uid], status: 'removed' };
        }
        tx.update(ref, {
          members,
          memberUids: activeMemberUids(members),
          memberEmails: activeMemberEmails(members),
          updatedAt: serverTimestamp(),
        });
      });
      // Activity log (Decision 2.2, §3.4) — fire-and-forget AFTER the leave
      // commits. The departing member is the actor (no target — the
      // `member_left` copy reads "{actor} left the PLC"). NOTE: the leave
      // transaction drops the caller from `memberUids`, and the activity-create
      // rule gates on PLC membership, so this self-authored write is rejected by
      // rules post-leave (swallowed by the fire-and-forget helper). Reliable
      // emission of a self-leave event therefore belongs to the leave Cloud
      // Function alongside `member_joined` (invite-accept) — see the deferral
      // note in the structured fix result. The attempt is left here so that, if
      // the membership write is ever moved server-side (where the actor is still
      // a member at write time), the event lands without a code change.
      void writePlcActivityEvent(plcId, {
        type: 'member_left',
        actorUid: user.uid,
        actorName: resolveActorName(user),
      });
    },
    [user]
  );

  // Lead / co-lead only (re-enforced in rules): set a member's role. Cannot
  // touch the current lead — leadership only moves through `transferLead`
  // (the exactly-one-lead invariant). A role change leaves the membership
  // sets intact, so `memberUids` / `memberEmails` are unchanged; only the
  // `members` map entry's `role` moves. We still re-write the whole map (with
  // the legacy backfill) so a role change on an un-migrated PLC populates the
  // canonical map in one shot.
  const setMemberRole = useCallback(
    async (plcId: string, uid: string, role: PlcRole) => {
      if (!user) return;
      if (role === 'lead') {
        // Promoting to lead is leadership transfer — force the atomic path so
        // the invariant (and `leadUid` mirror) can't be bypassed.
        throw new Error(i18n.t('plc.errors.cannotDemoteLead'));
      }
      // Snapshot the target's display label inside the txn for the post-commit
      // `role_changed` activity event (renders without a join).
      let targetName = '';
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(i18n.t('plc.errors.plcNotFound'));
        const data = snap.data() as Record<string, unknown>;
        const members = readMembersForWrite(data);
        const target = members[uid];
        if (!target || target.status !== 'active') {
          throw new Error(i18n.t('plc.errors.notAMember'));
        }
        if (target.role === 'lead' || uid === data.leadUid) {
          // Can't demote the sitting lead via a role change — transfer first.
          throw new Error(i18n.t('plc.errors.cannotDemoteLead'));
        }
        targetName = target.displayName || target.email || uid;
        members[uid] = { ...target, role };
        tx.update(ref, {
          members,
          // Explicit target pointer for the rules' `isChangingMemberRole`
          // branch (T6). Firestore rules cannot read a map value at a
          // dynamically-discovered key, so the changed uid is named here; the
          // rule validates `members[roleChangeUid]`. Harmless on the lead path
          // (the broad lead-update branch ignores it); REQUIRED for co-leads
          // (their only authorized path is `isChangingMemberRole`).
          roleChangeUid: uid,
          updatedAt: serverTimestamp(),
        });
      });
      // Activity log (Decision 2.2, §3.4) — fire-and-forget after commit; the
      // actor (lead/co-lead) stays a member, so this write is authorized. The
      // target member's label rides on `targetTitle` so the feed reads
      // "{actor} changed {member}'s role".
      void writePlcActivityEvent(plcId, {
        type: 'role_changed',
        actorUid: user.uid,
        actorName: resolveActorName(user),
        targetType: 'member',
        targetId: uid,
        ...(targetName ? { targetTitle: targetName } : {}),
      });
    },
    [user]
  );

  // Lead-only (re-enforced in rules): atomically hand leadership to another
  // active member. Demotes the outgoing lead to `member`, promotes the target
  // to `lead`, and moves the denormalized `leadUid` mirror in lockstep —
  // preserving the exactly-one-lead invariant. Rejects a non-member target.
  const transferLead = useCallback(
    async (plcId: string, toUid: string) => {
      if (!user) return;
      // Snapshot the new lead's display label + whether a transfer actually
      // happened (a no-op transfer to the sitting lead must not log an event).
      let targetName = '';
      let didTransfer = false;
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(i18n.t('plc.errors.plcNotFound'));
        const data = snap.data() as Record<string, unknown>;
        const members = readMembersForWrite(data);
        const fromUid =
          typeof data.leadUid === 'string'
            ? data.leadUid
            : (Object.values(members).find((m) => m.role === 'lead')?.uid ??
              '');
        const target = members[toUid];
        if (!target || target.status !== 'active') {
          throw new Error(i18n.t('plc.errors.targetNotActiveMember'));
        }
        // No-op transfer to the sitting lead — nothing to do, keep invariant.
        if (toUid === fromUid) return;
        targetName = target.displayName || target.email || toUid;
        didTransfer = true;
        // Demote every current lead (defensive: a malformed legacy map could
        // carry more than one) then promote exactly the target.
        for (const [uid, m] of Object.entries(members)) {
          if (m.role === 'lead') members[uid] = { ...m, role: 'member' };
        }
        members[toUid] = { ...members[toUid], role: 'lead' };
        tx.update(ref, {
          members,
          leadUid: toUid,
          memberUids: activeMemberUids(members),
          memberEmails: activeMemberEmails(members),
          updatedAt: serverTimestamp(),
        });
      });
      // Activity log (Decision 2.2, §3.4) — fire-and-forget after commit. A
      // leadership transfer IS a role change for the promoted member, so it
      // reuses `role_changed` (no dedicated transfer type in the union). The
      // outgoing lead (the actor) remains an active member, so the write is
      // authorized.
      if (didTransfer) {
        void writePlcActivityEvent(plcId, {
          type: 'role_changed',
          actorUid: user.uid,
          actorName: resolveActorName(user),
          targetType: 'member',
          targetId: toUid,
          ...(targetName ? { targetTitle: targetName } : {}),
        });
      }
    },
    [user]
  );

  // Admin recovery (Decision 3.4, §3.4): an in-org site admin reassigns the
  // crown of an abandoned PLC to another EXISTING active member. The caller is
  // a NON-member, so this is the one mutator that does not gate on the acting
  // user being part of the PLC — only that they are signed in (rules enforce
  // the `isAdmin()` + same-org gate). Writes EXACTLY the closed diff the
  // `isAdminManagingPlc` rule admits (`leadUid` / `members` / `memberUids` /
  // `memberEmails` / `updatedAt`): the membership SET is preserved (recovery
  // reassigns a role, never adds/drops members), the incoming lead is promoted
  // and the outgoing lead demoted in lockstep with the `leadUid` mirror, and
  // NO extra pointer field (e.g. `roleChangeUid`) or activity event is written
  // — both would either bust the rule's `hasOnly` diff or be denied as a
  // non-member subcollection write.
  const adminReassignLead = useCallback(
    async (plcId: string, toUid: string) => {
      if (!user) throw new Error(i18n.t('plc.errors.notSignedIn'));
      await runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(i18n.t('plc.errors.plcNotFound'));
        const data = snap.data() as Record<string, unknown>;
        const members = readMembersForWrite(data);
        const fromUid =
          typeof data.leadUid === 'string'
            ? data.leadUid
            : (Object.values(members).find((m) => m.role === 'lead')?.uid ??
              '');
        const target = members[toUid];
        if (!target || target.status !== 'active') {
          throw new Error(i18n.t('plc.errors.targetNotActiveMember'));
        }
        // No-op reassign to the sitting lead — the rule requires
        // `newLead != oldLead`, so a same-lead write would be rejected; bail
        // cleanly instead of issuing a doomed write.
        if (toUid === fromUid) {
          throw new Error(i18n.t('plc.errors.alreadyLead'));
        }
        // Demote every current lead (defensive against a malformed legacy map
        // carrying more than one) then promote exactly the target.
        for (const [uid, m] of Object.entries(members)) {
          if (m.role === 'lead') members[uid] = { ...m, role: 'member' };
        }
        members[toUid] = { ...members[toUid], role: 'lead' };
        tx.update(ref, {
          members,
          leadUid: toUid,
          // The membership SET is unchanged; re-derive the indexes from the
          // (role-only-mutated) map so they stay byte-for-byte the same set
          // the rule's `toSet().hasAll(...)` lockstep check expects.
          memberUids: activeMemberUids(members),
          memberEmails: activeMemberEmails(members),
          updatedAt: serverTimestamp(),
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
      if (!user) throw new Error(i18n.t('plc.errors.notSignedIn'));
      return runTransaction(db, async (tx) => {
        const ref = doc(db, PLCS_COLLECTION, plcId);
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          throw new Error(i18n.t('plc.errors.plcNotFound'));
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
          updatedAt: serverTimestamp(),
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
          updatedAt: serverTimestamp(),
        });
      });
    },
    [user]
  );

  const getPlcSharedSheetUrl = useCallback(
    async (plcId: string): Promise<string | null> => {
      // Fast path: the PLC is already in our live, snapshot-backed state
      // (true for every member-initiated assignment flow), so we can read
      // `sharedSheetUrl` without a redundant Firestore read. Normalize the
      // empty string to null to match the slow path's `raw.length > 0` check.
      const cached = plcsRef.current.find((p) => p.id === plcId);
      if (cached) {
        const url = cached.sharedSheetUrl;
        return typeof url === 'string' && url.length > 0 ? url : null;
      }
      // Slow path: PLC not in local state (non-member surface, or before
      // the first snapshot). Fall back to a one-off read.
      const snap = await getDoc(doc(db, PLCS_COLLECTION, plcId));
      if (!snap.exists()) return null;
      const raw = (snap.data() as { sharedSheetUrl?: unknown }).sharedSheetUrl;
      return typeof raw === 'string' && raw.length > 0 ? raw : null;
    },
    []
  );

  // Any current member: write the canonical features map. We always send
  // the full merged shape (defaults overlaid with the partial caller map)
  // so partial writes can't leave dangling fields, and so the rule's
  // `is map` check always sees a complete object. The `isUpdatingPlcFeatures`
  // rule branch guards the field-set so this can't be used to smuggle
  // membership/leadership/sheet-URL changes.
  const updatePlcFeatures = useCallback(
    async (plcId: string, features: PlcFeatureSettings) => {
      if (!user) throw new Error(i18n.t('plc.errors.notSignedIn'));
      const merged: PlcFeatureSettings = {
        ...DEFAULT_PLC_FEATURE_SETTINGS,
        ...features,
      };
      await setDoc(
        doc(db, PLCS_COLLECTION, plcId),
        { features: merged, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [user]
  );

  // Any current member: flip the opt-in weekly digest flag. We write ONLY
  // `digestOptIn` + `updatedAt` so the `isUpdatingPlcDigestOptIn` rule branch
  // (which closes the diff to exactly those two keys) admits the write and the
  // member can't smuggle membership/leadership/feature changes through it.
  const updatePlcDigestOptIn = useCallback(
    async (plcId: string, optIn: boolean) => {
      if (!user) throw new Error(i18n.t('plc.errors.notSignedIn'));
      await setDoc(
        doc(db, PLCS_COLLECTION, plcId),
        { digestOptIn: optIn, updatedAt: serverTimestamp() },
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
      setMemberRole,
      transferLead,
      deletePlc,
      adminReassignLead,
      setPlcSharedSheetUrl,
      clearPlcSharedSheetUrl,
      getPlcSharedSheetUrl,
      updatePlcFeatures,
      updatePlcDigestOptIn,
    }),
    [
      plcs,
      loading,
      error,
      createPlc,
      renamePlc,
      removeMember,
      leavePlc,
      setMemberRole,
      transferLead,
      deletePlc,
      adminReassignLead,
      setPlcSharedSheetUrl,
      clearPlcSharedSheetUrl,
      getPlcSharedSheetUrl,
      updatePlcFeatures,
      updatePlcDigestOptIn,
    ]
  );
};
