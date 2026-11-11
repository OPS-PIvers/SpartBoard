// PLC membership changes run here so firestore.rules no longer has to validate each transition.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { isRevokedMemberStatus, OPERATOR_ORG_ID } from './authz';
import { assertViewAsAllowed, readViewAsClaim } from './viewAsGuard';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Data = Record<string, unknown>;

export const PLC_ROLES = ['lead', 'coLead', 'member', 'viewer'] as const;
export type PlcRole = (typeof PLC_ROLES)[number];
export type NonLeadRole = Exclude<PlcRole, 'lead'>;
const NON_LEAD_ROLES: readonly NonLeadRole[] = ['coLead', 'member', 'viewer'];
const ADDED_BY = ['admin', 'autoRoster', 'invite'] as const;

/** Reasons the client maps to its own messages (most match `plc.errors.*`). */
export type MembershipReason =
  | 'plcNotFound'
  | 'leadCannotLeave'
  | 'leadCannotBeRemoved'
  | 'notAMember'
  | 'targetNotActiveMember'
  | 'cannotDemoteLead'
  | 'alreadyLead'
  | 'notActiveMember'
  | 'notAllowed'
  | 'inviteNotFound'
  | 'inviteWrongAccount'
  | 'inviteNotPending';

export class MembershipError extends Error {
  constructor(
    readonly reason: MembershipReason,
    readonly code:
      | 'failed-precondition'
      | 'permission-denied'
      | 'not-found' = 'failed-precondition'
  ) {
    super(reason);
  }
}

export type MembershipAction =
  | { action: 'acceptInvite'; inviteId: string }
  | { action: 'leave'; plcId: string }
  | { action: 'removeMember'; plcId: string; uid: string }
  | { action: 'setRole'; plcId: string; uid: string; role: NonLeadRole }
  | { action: 'transferLead'; plcId: string; uid: string }
  | { action: 'adminReassignLead'; plcId: string; uid: string }
  | {
      action: 'adminSetMember';
      plcId: string;
      target: { uid: string; email: string; displayName: string };
      role: NonLeadRole;
    }
  | { action: 'adminRemoveMember'; plcId: string; uid: string };

export interface MembershipResult {
  changed: boolean;
  targetName?: string;
}

type MemberWrite = {
  uid: string;
  email: string;
  displayName: string;
  role: PlcRole;
  status: 'active' | 'removed';
  joinedAt: unknown;
  addedBy?: (typeof ADDED_BY)[number];
  mentorRole?: 'mentor' | 'mentee';
};

// ── Pure helpers, ported from hooks/usePlcs.ts so the stored shape stays identical ──

function strUids(data: Data): string[] {
  return Array.isArray(data.memberUids)
    ? (data.memberUids as unknown[]).filter(
        (u): u is string => typeof u === 'string'
      )
    : [];
}

function synthesizeMembers(
  data: Data,
  ts: unknown
): Record<string, MemberWrite> {
  const leadUid = typeof data.leadUid === 'string' ? data.leadUid : '';
  const emails = (data.memberEmails ?? {}) as Data;
  const out: Record<string, MemberWrite> = {};
  for (const uid of strUids(data)) {
    const rawEmail = typeof emails[uid] === 'string' ? emails[uid] : '';
    const email = rawEmail.trim().toLowerCase();
    out[uid] = {
      uid,
      email,
      displayName: email.includes('@') ? email.split('@')[0] : email,
      role: uid === leadUid ? 'lead' : 'member',
      status: 'active',
      joinedAt: ts,
    };
  }
  return out;
}

/** The stored members map in write shape; an empty map falls back to the legacy arrays. */
export function readMembersForWrite(
  data: Data,
  ts: unknown,
  { includeArrayOnly = false }: { includeArrayOnly?: boolean } = {}
): Record<string, MemberWrite> {
  const raw =
    data.members && typeof data.members === 'object'
      ? (data.members as Data)
      : {};
  const out: Record<string, MemberWrite> = {};
  for (const [uid, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const m = value as Data;
    if (
      typeof m.role !== 'string' ||
      !(PLC_ROLES as readonly string[]).includes(m.role)
    )
      continue;
    const addedBy = ADDED_BY.find((a) => a === m.addedBy);
    out[uid] = {
      uid: typeof m.uid === 'string' ? m.uid : uid,
      email: typeof m.email === 'string' ? m.email.trim().toLowerCase() : '',
      displayName: typeof m.displayName === 'string' ? m.displayName : '',
      role: m.role as PlcRole,
      status: m.status === 'removed' ? 'removed' : 'active',
      joinedAt: m.joinedAt ?? ts,
      ...(addedBy ? { addedBy } : {}),
      ...(m.mentorRole === 'mentor' || m.mentorRole === 'mentee'
        ? { mentorRole: m.mentorRole }
        : {}),
    };
  }
  if (Object.keys(out).length === 0) return synthesizeMembers(data, ts);
  if (includeArrayOnly) {
    for (const [uid, m] of Object.entries(synthesizeMembers(data, ts))) {
      if (!out[uid]) out[uid] = m;
    }
  }
  return out;
}

function backfillArrayMember(
  members: Record<string, MemberWrite>,
  data: Data,
  uid: string,
  ts: unknown
): void {
  if (members[uid]) return;
  const synthesized = synthesizeMembers(data, ts)[uid];
  if (synthesized) members[uid] = synthesized;
}

function indexesWithout(
  data: Data,
  uid: string
): { memberUids: string[]; memberEmails: Data } {
  const memberEmails = { ...((data.memberEmails ?? {}) as Data) };
  delete memberEmails[uid];
  return { memberUids: strUids(data).filter((u) => u !== uid), memberEmails };
}

function activeIndexes(members: Record<string, MemberWrite>): {
  memberUids: string[];
  memberEmails: Record<string, string>;
} {
  const memberUids: string[] = [];
  const memberEmails: Record<string, string> = {};
  for (const m of Object.values(members)) {
    if (m.status !== 'active') continue;
    memberUids.push(m.uid);
    if (m.email) memberEmails[m.uid] = m.email;
  }
  return { memberUids, memberEmails };
}

function currentLead(data: Data, members: Record<string, MemberWrite>): string {
  return typeof data.leadUid === 'string'
    ? data.leadUid
    : (Object.values(members).find((m) => m.role === 'lead')?.uid ?? '');
}

/** Lead, or a current co-lead whose entry isn't marked removed (rules' isPlcMembershipManager). */
export function isMembershipManager(data: Data, uid: string): boolean {
  if (!strUids(data).includes(uid)) return false;
  if (data.leadUid === uid) return true;
  const entry = ((data.members ?? {}) as Record<string, Data | undefined>)[uid];
  return (
    !!entry &&
    (entry.role === 'lead' || entry.role === 'coLead') &&
    entry.status !== 'removed'
  );
}

export interface PlanContext {
  callerUid: string;
  /** Admin gate already evaluated by the caller (admin doc, verified email, same org). */
  callerIsOrgAdmin: boolean;
  ts: unknown;
}

export interface Plan {
  update: Data | null;
  result: MembershipResult;
}

/** Decides the write for a member-facing or admin action on an existing PLC doc; throws MembershipError. */
export function planPlcChange(
  data: Data,
  action: Exclude<MembershipAction, { action: 'acceptInvite' }>,
  ctx: PlanContext
): Plan {
  const { callerUid: me, ts } = ctx;
  switch (action.action) {
    case 'leave': {
      if (!strUids(data).includes(me)) throw new MembershipError('notAMember');
      const members = readMembersForWrite(data, ts);
      if (members[me]?.role === 'lead' || data.leadUid === me) {
        throw new MembershipError('leadCannotLeave');
      }
      const indexes = indexesWithout(data, me);
      if (members[me]) {
        members[me] = { ...members[me], status: 'removed' };
        return {
          update: { members, ...indexes, updatedAt: ts },
          result: { changed: true },
        };
      }
      return {
        update: { ...indexes, updatedAt: ts },
        result: { changed: true },
      };
    }
    case 'removeMember': {
      if (data.leadUid !== me || !strUids(data).includes(me)) {
        throw new MembershipError('notAllowed', 'permission-denied');
      }
      const uid = action.uid;
      const members = readMembersForWrite(data, ts);
      if (members[uid]?.role === 'lead' || uid === data.leadUid) {
        throw new MembershipError('leadCannotBeRemoved');
      }
      const indexes = indexesWithout(data, uid);
      if (members[uid]) {
        const targetName =
          members[uid].displayName || members[uid].email || uid;
        members[uid] = { ...members[uid], status: 'removed' };
        return {
          update: { members, ...indexes, updatedAt: ts },
          result: { changed: true, targetName },
        };
      }
      const emails = (data.memberEmails ?? {}) as Data;
      const email = typeof emails[uid] === 'string' ? emails[uid] : '';
      return {
        update: { ...indexes, updatedAt: ts },
        result: {
          changed: strUids(data).includes(uid),
          targetName: email || uid,
        },
      };
    }
    case 'setRole': {
      if (!isMembershipManager(data, me))
        throw new MembershipError('notAllowed', 'permission-denied');
      const { uid, role } = action;
      const members = readMembersForWrite(data, ts);
      backfillArrayMember(members, data, uid, ts);
      const target = members[uid];
      if (
        !target ||
        target.status !== 'active' ||
        !strUids(data).includes(uid)
      ) {
        throw new MembershipError('notAMember');
      }
      if (target.role === 'lead' || uid === data.leadUid)
        throw new MembershipError('cannotDemoteLead');
      members[uid] = { ...target, role };
      if (role !== 'member') delete members[uid].mentorRole;
      return {
        update: { members, updatedAt: ts },
        result: {
          changed: true,
          targetName: target.displayName || target.email || uid,
        },
      };
    }
    case 'transferLead': {
      if (!isMembershipManager(data, me))
        throw new MembershipError('notAllowed', 'permission-denied');
      const toUid = action.uid;
      const members = readMembersForWrite(data, ts);
      const fromUid = currentLead(data, members);
      backfillArrayMember(members, data, toUid, ts);
      const target = members[toUid];
      if (
        !target ||
        target.status !== 'active' ||
        !strUids(data).includes(toUid)
      ) {
        throw new MembershipError('targetNotActiveMember');
      }
      if (toUid === fromUid)
        return { update: null, result: { changed: false } };
      for (const [uid, m] of Object.entries(members)) {
        if (m.role === 'lead') members[uid] = { ...m, role: 'member' };
      }
      members[toUid] = { ...members[toUid], role: 'lead' };
      return {
        update: { members, leadUid: toUid, updatedAt: ts },
        result: {
          changed: true,
          targetName: target.displayName || target.email || toUid,
        },
      };
    }
    case 'adminReassignLead': {
      if (!ctx.callerIsOrgAdmin)
        throw new MembershipError('notAllowed', 'permission-denied');
      const toUid = action.uid;
      const members = readMembersForWrite(data, ts);
      const fromUid = currentLead(data, members);
      const target = members[toUid];
      if (!target || target.status !== 'active')
        throw new MembershipError('targetNotActiveMember');
      if (toUid === fromUid) throw new MembershipError('alreadyLead');
      for (const [uid, m] of Object.entries(members)) {
        if (m.role === 'lead') members[uid] = { ...m, role: 'member' };
      }
      members[toUid] = { ...members[toUid], role: 'lead' };
      return {
        update: {
          members,
          leadUid: toUid,
          ...activeIndexes(members),
          updatedAt: ts,
        },
        result: { changed: true },
      };
    }
    case 'adminSetMember': {
      if (!ctx.callerIsOrgAdmin)
        throw new MembershipError('notAllowed', 'permission-denied');
      const { target, role } = action;
      const members = readMembersForWrite(data, ts, { includeArrayOnly: true });
      if (target.uid === data.leadUid || members[target.uid]?.role === 'lead') {
        throw new MembershipError('cannotDemoteLead');
      }
      const existing = members[target.uid];
      members[target.uid] = {
        uid: target.uid,
        email: target.email.trim().toLowerCase(),
        displayName: existing?.displayName || target.displayName,
        role,
        joinedAt: existing?.joinedAt ?? ts,
        status: 'active',
      };
      return {
        update: { members, ...activeIndexes(members), updatedAt: ts },
        result: { changed: true },
      };
    }
    case 'adminRemoveMember': {
      if (!ctx.callerIsOrgAdmin)
        throw new MembershipError('notAllowed', 'permission-denied');
      const uid = action.uid;
      const members = readMembersForWrite(data, ts, { includeArrayOnly: true });
      if (uid === data.leadUid || members[uid]?.role === 'lead') {
        throw new MembershipError('leadCannotBeRemoved');
      }
      if (!members[uid] || members[uid].status !== 'active') {
        throw new MembershipError('notActiveMember');
      }
      members[uid] = { ...members[uid], status: 'removed' };
      return {
        update: { members, ...activeIndexes(members), updatedAt: ts },
        result: { changed: true },
      };
    }
  }
}

/** The PLC write for accepting a checked invite; null when the caller is already a member. */
export function planAcceptInvite(
  data: Data,
  uid: string,
  emailLower: string,
  displayName: string,
  ts: unknown
): Data | null {
  if (strUids(data).includes(uid)) return null;
  const existing = ((data.members ?? {}) as Data)[uid];
  return {
    memberUids: [...strUids(data), uid],
    memberEmails: { ...((data.memberEmails ?? {}) as Data), [uid]: emailLower },
    // Rejoining over a stale (removed) entry resets it to an active member; otherwise the arrays alone, as before.
    ...(existing
      ? {
          members: {
            ...((data.members ?? {}) as Data),
            [uid]: {
              uid,
              email: emailLower,
              displayName: displayName || emailLower.split('@')[0],
              role: 'member',
              status: 'active',
              joinedAt: ts,
            },
          },
        }
      : {}),
    updatedAt: ts,
  };
}

// ── Payload parsing ──

function str(raw: Data, key: string): string {
  const v = raw[key];
  if (typeof v !== 'string' || !v.trim() || v.length > 200 || v.includes('/')) {
    throw new HttpsError('invalid-argument', `${key} is required.`);
  }
  return v.trim();
}

function nonLeadRole(raw: Data): NonLeadRole {
  const r = raw.role;
  if (
    typeof r !== 'string' ||
    !(NON_LEAD_ROLES as readonly string[]).includes(r)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'role must be coLead, member or viewer.'
    );
  }
  return r as NonLeadRole;
}

export function parseMembershipAction(input: unknown): MembershipAction {
  const raw = (input ?? {}) as Data;
  switch (raw.action) {
    case 'acceptInvite':
      return { action: 'acceptInvite', inviteId: str(raw, 'inviteId') };
    case 'leave':
      return { action: 'leave', plcId: str(raw, 'plcId') };
    case 'removeMember':
    case 'transferLead':
    case 'adminReassignLead':
    case 'adminRemoveMember':
      return {
        action: raw.action,
        plcId: str(raw, 'plcId'),
        uid: str(raw, 'uid'),
      };
    case 'setRole':
      return {
        action: 'setRole',
        plcId: str(raw, 'plcId'),
        uid: str(raw, 'uid'),
        role: nonLeadRole(raw),
      };
    case 'adminSetMember': {
      const t = (raw.target ?? {}) as Data;
      const email = str(t, 'email').toLowerCase();
      const displayName =
        typeof t.displayName === 'string' ? t.displayName.slice(0, 200) : '';
      return {
        action: 'adminSetMember',
        plcId: str(raw, 'plcId'),
        target: { uid: str(t, 'uid'), email, displayName },
        role: nonLeadRole(raw),
      };
    }
    default:
      throw new HttpsError('invalid-argument', 'Unknown action.');
  }
}

// ── Transaction runner ──

export interface Caller {
  uid: string;
  emailLower: string;
  emailVerified: boolean;
  displayName: string;
  viewAs: boolean;
}

function fail(err: MembershipError): never {
  throw new HttpsError(err.code, err.reason, { reason: err.reason });
}

/** Runs one membership action in a transaction, with the same gates the rules applied. */
export async function runMembershipAction(
  db: admin.firestore.Firestore,
  caller: Caller,
  action: MembershipAction,
  ts: unknown = admin.firestore.FieldValue.serverTimestamp()
): Promise<MembershipResult> {
  // Mirrors notDeactivated(): a deactivated operator-org member changes nothing.
  if (caller.emailLower) {
    const op = await db
      .doc(`organizations/${OPERATOR_ORG_ID}/members/${caller.emailLower}`)
      .get();
    if (op.exists && isRevokedMemberStatus(op.get('status'))) {
      throw new HttpsError('permission-denied', 'notAllowed', {
        reason: 'notAllowed',
      });
    }
  }
  try {
    if (action.action === 'acceptInvite') {
      if (!caller.emailLower || !caller.emailVerified)
        throw new MembershipError('inviteWrongAccount', 'permission-denied');
      return await db.runTransaction(async (tx) => {
        const inviteRef = db.doc(`plc_invitations/${action.inviteId}`);
        const invite = await tx.get(inviteRef);
        if (!invite.exists)
          throw new MembershipError('inviteNotFound', 'not-found');
        const inv = invite.data() as Data;
        if (inv.inviteeEmailLower !== caller.emailLower)
          throw new MembershipError('inviteWrongAccount', 'permission-denied');
        if (inv.status !== 'pending')
          throw new MembershipError('inviteNotPending');
        const plcId = typeof inv.plcId === 'string' ? inv.plcId : '';
        const plcRef = db.doc(`plcs/${plcId}`);
        const plc = plcId ? await tx.get(plcRef) : null;
        if (!plc?.exists) throw new MembershipError('plcNotFound', 'not-found');
        const update = planAcceptInvite(
          plc.data() as Data,
          caller.uid,
          caller.emailLower,
          caller.displayName,
          ts
        );
        if (update) tx.update(plcRef, update);
        tx.update(inviteRef, { status: 'accepted', respondedAt: Date.now() });
        return { changed: update !== null };
      });
    }
    const isAdminAction = action.action.startsWith('admin');
    return await db.runTransaction(async (tx) => {
      const ref = db.doc(`plcs/${action.plcId}`);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new MembershipError('plcNotFound', 'not-found');
      const data = snap.data() as Data;
      let callerIsOrgAdmin = false;
      if (isAdminAction) {
        // Rules' isAdmin() && isOrgMember(plc.orgId); a View as tab never gets admin writes.
        const orgId = data.orgId;
        if (
          !caller.viewAs &&
          caller.emailVerified &&
          caller.emailLower &&
          typeof orgId === 'string' &&
          orgId
        ) {
          const [adminDoc, orgMember] = await Promise.all([
            tx.get(db.doc(`admins/${caller.emailLower}`)),
            tx.get(
              db.doc(`organizations/${orgId}/members/${caller.emailLower}`)
            ),
          ]);
          callerIsOrgAdmin = adminDoc.exists && orgMember.exists;
        }
      }
      const plan = planPlcChange(data, action, {
        callerUid: caller.uid,
        callerIsOrgAdmin,
        ts,
      });
      if (plan.update) tx.update(ref, plan.update);
      return plan.result;
    });
  } catch (err) {
    if (err instanceof MembershipError) fail(err);
    throw err;
  }
}

export const plcMembershipV1 = onCall(
  { memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 },
  async (request): Promise<MembershipResult> => {
    await assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const action = parseMembershipAction(request.data);
    const token = request.auth.token;
    const caller: Caller = {
      uid: request.auth.uid,
      emailLower:
        typeof token.email === 'string' ? token.email.trim().toLowerCase() : '',
      emailVerified: token.email_verified === true,
      displayName: typeof token.name === 'string' ? token.name : '',
      viewAs: readViewAsClaim(request) !== null,
    };
    return runMembershipAction(admin.firestore(), caller, action);
  }
);
