// Admin-made building groups and their auto-roster (docs/plans/MY_GROUPS.md slices 2 and 3).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { isStrictSuperAdmin } from './authz';
import {
  buildingIdVariants,
  canonicalBuildingIdServer,
  canonicalizeBuildingIdsServer,
} from './buildingIds';
import { ADMIN_ROLE_IDS } from './organizationInvites';
import { assertViewAsAllowed } from './viewAsGuard';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Firestore = admin.firestore.Firestore;
type Data = Record<string, unknown>;

export type PlcAddedBy = 'admin' | 'autoRoster' | 'invite';

export interface AccountInfo {
  uid: string;
  email: string;
  displayName: string;
}

export interface BuildingGroupDeps {
  db: Firestore;
  getUser: (
    uid: string
  ) => Promise<{ email?: string; displayName?: string } | null>;
  getUserByEmail: (
    email: string
  ) => Promise<{ uid: string; displayName?: string } | null>;
  serverTimestamp: () => unknown;
}

/** Users added in one transaction; keeps each write well under the doc and request limits. */
export const ROSTER_CHUNK = 150;

// ── Pure helpers ─────────────────────────────────────────────────────────

/** Buildings gained and lost between two `selectedBuildings` values, canonicalized. */
export function diffSelectedBuildings(
  before: unknown,
  after: unknown
): { added: string[]; removed: string[] } {
  const b = Array.isArray(before) ? canonicalizeBuildingIdsServer(before) : [];
  const a = Array.isArray(after) ? canonicalizeBuildingIdsServer(after) : [];
  return {
    added: a.filter((id) => !b.includes(id)),
    removed: b.filter((id) => !a.includes(id)),
  };
}

/** True for a building group with auto-roster switched on. */
export function isAutoRosterGroup(data: Data | undefined): boolean {
  return (
    !!data &&
    data.groupType === 'building' &&
    data.autoRoster === true &&
    typeof data.buildingId === 'string' &&
    data.buildingId !== '' &&
    typeof data.orgId === 'string' &&
    data.orgId !== ''
  );
}

function rawMembers(data: Data): Record<string, Data> {
  const m = data.members;
  return m && typeof m === 'object' ? { ...(m as Record<string, Data>) } : {};
}

/** Candidates to add; only a building change (trigger) re-adds an earlier auto-roster removal. */
export function planAutoRosterAdds(
  data: Data,
  candidates: readonly AccountInfo[],
  mode: 'backfill' | 'trigger'
): AccountInfo[] {
  const members = rawMembers(data);
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
  const out: AccountInfo[] = [];
  for (const c of candidates) {
    if (!c.uid || !c.email || out.some((o) => o.uid === c.uid)) continue;
    const existing = members[c.uid] as Data | undefined;
    if (!existing) {
      if (memberUids.includes(c.uid)) continue;
      out.push(c);
      continue;
    }
    if (existing.status !== 'removed') continue;
    if (mode === 'trigger' && existing.addedBy === 'autoRoster') out.push(c);
  }
  return out;
}

/** True only for an active, auto-added member who is neither lead nor co-lead. */
export function shouldAutoRemove(data: Data, uid: string): boolean {
  if (uid === data.leadUid) return false;
  const m = rawMembers(data)[uid];
  if (!m) return false;
  return (
    m.status !== 'removed' &&
    m.addedBy === 'autoRoster' &&
    m.role !== 'lead' &&
    m.role !== 'coLead'
  );
}

function activeIndexes(members: Record<string, Data>): {
  memberUids: string[];
  memberEmails: Record<string, string>;
} {
  const memberUids: string[] = [];
  const memberEmails: Record<string, string> = {};
  for (const [uid, m] of Object.entries(members)) {
    if (m.status === 'removed') continue;
    memberUids.push(uid);
    if (typeof m.email === 'string') memberEmails[uid] = m.email;
  }
  return { memberUids, memberEmails };
}

/** The members map and indexes after adding `adds` as auto-rostered viewers. */
export function applyAutoRosterAdds(
  data: Data,
  adds: readonly AccountInfo[],
  joinedAt: unknown
): {
  members: Record<string, Data>;
  memberUids: string[];
  memberEmails: Record<string, string>;
} {
  const members = rawMembers(data);
  for (const a of adds) {
    members[a.uid] = {
      uid: a.uid,
      email: a.email.toLowerCase(),
      displayName: a.displayName,
      role: 'viewer',
      joinedAt,
      status: 'active',
      addedBy: 'autoRoster',
    };
  }
  return { members, ...activeIndexes(members) };
}

/** The members map and indexes after marking `uid` removed, as the client's removeMember does. */
export function applyAutoRosterRemoval(
  data: Data,
  uid: string
): {
  members: Record<string, Data>;
  memberUids: string[];
  memberEmails: Record<string, string>;
} {
  const members = rawMembers(data);
  if (members[uid]) members[uid] = { ...members[uid], status: 'removed' };
  return { members, ...activeIndexes(members) };
}

export interface CreateBuildingGroupPayload {
  orgId: string;
  buildingId: string;
  name: string;
  leadEmail: string;
  coLeadEmails: string[];
  autoRoster: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

export function parseCreateBuildingGroupPayload(
  data: unknown
): CreateBuildingGroupPayload {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload must be an object.');
  }
  const raw = data as Data;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const orgId = str(raw.orgId);
  const buildingId = canonicalBuildingIdServer(str(raw.buildingId));
  const name = str(raw.name);
  const leadEmail = str(raw.leadEmail).toLowerCase();
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required.');
  if (!buildingId) {
    throw new HttpsError('invalid-argument', 'buildingId is required.');
  }
  if (!name || name.length > 120) {
    throw new HttpsError(
      'invalid-argument',
      'A name up to 120 characters is required.'
    );
  }
  if (!EMAIL_RE.test(leadEmail)) {
    throw new HttpsError('invalid-argument', 'leadEmail must be an email.');
  }
  if (raw.coLeadEmails !== undefined && !Array.isArray(raw.coLeadEmails)) {
    throw new HttpsError('invalid-argument', 'coLeadEmails must be a list.');
  }
  const coLeadEmails: string[] = [];
  for (const v of (raw.coLeadEmails as unknown[] | undefined) ?? []) {
    const e = str(v).toLowerCase();
    if (!EMAIL_RE.test(e)) {
      throw new HttpsError(
        'invalid-argument',
        'Every co-lead must be an email.'
      );
    }
    if (e !== leadEmail && !coLeadEmails.includes(e)) coLeadEmails.push(e);
  }
  if (coLeadEmails.length > 20) {
    throw new HttpsError('invalid-argument', 'At most 20 co-leads.');
  }
  return {
    orgId,
    buildingId,
    name,
    leadEmail,
    coLeadEmails,
    autoRoster: raw.autoRoster === true,
  };
}

// ── Firestore helpers ────────────────────────────────────────────────────

/** Org member doc exists and is not deactivated. */
export async function isActiveOrgMember(
  db: Firestore,
  orgId: string,
  emailLower: string
): Promise<boolean> {
  if (!emailLower) return false;
  const snap = await db
    .doc(`organizations/${orgId}/members/${emailLower}`)
    .get();
  if (!snap.exists) return false;
  const status: unknown = snap.get('status');
  return status !== 'inactive' && status !== 'removed';
}

/** Throws unless the caller is a super/domain admin of `orgId` or the operator super admin. */
export async function assertCallerIsOrgAdmin(
  db: Firestore,
  orgId: string,
  callerEmailLower: string
): Promise<void> {
  const snap = await db
    .doc(`organizations/${orgId}/members/${callerEmailLower}`)
    .get();
  if (snap.exists) {
    const roleId: unknown = snap.get('roleId');
    const status: unknown = snap.get('status');
    if (
      typeof roleId === 'string' &&
      ADMIN_ROLE_IDS.includes(roleId) &&
      status !== 'inactive' &&
      status !== 'removed'
    ) {
      return;
    }
  }
  if (await isStrictSuperAdmin(db, callerEmailLower)) return;
  throw new HttpsError(
    'permission-denied',
    'Only an admin of this organization can manage building groups.'
  );
}

async function assertBuildingInOrg(
  db: Firestore,
  orgId: string,
  buildingId: string
): Promise<void> {
  const buildings = db.collection(`organizations/${orgId}/buildings`);
  const snap = await buildings.doc(buildingId).get();
  if (snap.exists) return;
  // An org with no building docs yet keeps any id; one with buildings must name one.
  const any = await buildings.limit(1).get();
  if (!any.empty) {
    throw new HttpsError(
      'invalid-argument',
      'That building is not in this organization.'
    );
  }
}

/** Resolve an email to a signed-in account: the org member doc's uid first, then Auth. */
export async function resolveAccount(
  deps: BuildingGroupDeps,
  orgId: string,
  emailLower: string
): Promise<AccountInfo | null> {
  const memberSnap = await deps.db
    .doc(`organizations/${orgId}/members/${emailLower}`)
    .get();
  const memberUid: unknown = memberSnap.exists ? memberSnap.get('uid') : null;
  const memberName: unknown = memberSnap.exists ? memberSnap.get('name') : null;
  if (typeof memberUid === 'string' && memberUid) {
    const user = await deps.getUser(memberUid);
    return {
      uid: memberUid,
      email: emailLower,
      displayName:
        user?.displayName ?? (typeof memberName === 'string' ? memberName : ''),
    };
  }
  const user = await deps.getUserByEmail(emailLower);
  if (!user) return null;
  return {
    uid: user.uid,
    email: emailLower,
    displayName:
      user.displayName ?? (typeof memberName === 'string' ? memberName : ''),
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/** Add candidates to one group in a transaction; returns how many were added. */
async function addToGroup(
  deps: BuildingGroupDeps,
  plcId: string,
  candidates: readonly AccountInfo[],
  mode: 'backfill' | 'trigger'
): Promise<number> {
  let total = 0;
  const ref = deps.db.collection('plcs').doc(plcId);
  for (const part of chunk(candidates, ROSTER_CHUNK)) {
    total += await deps.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (!snap.exists || !isAutoRosterGroup(data)) return 0;
      const adds = planAutoRosterAdds(data as Data, part, mode);
      if (adds.length === 0) return 0;
      const next = applyAutoRosterAdds(
        data as Data,
        adds,
        deps.serverTimestamp()
      );
      tx.update(ref, { ...next, updatedAt: deps.serverTimestamp() });
      return adds.length;
    });
  }
  return total;
}

/** Remove an auto-rostered member from one group; never touches leads or hand-added members. */
async function removeFromGroup(
  deps: BuildingGroupDeps,
  plcId: string,
  uid: string
): Promise<boolean> {
  const ref = deps.db.collection('plcs').doc(plcId);
  return deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || !isAutoRosterGroup(data)) return false;
    if (!shouldAutoRemove(data as Data, uid)) return false;
    const next = applyAutoRosterRemoval(data as Data, uid);
    tx.update(ref, { ...next, updatedAt: deps.serverTimestamp() });
    return true;
  });
}

/** Backfill: add every signed-in org member whose profile selects the group's building. */
export async function rosterBuildingGroup(
  deps: BuildingGroupDeps,
  plcId: string
): Promise<number> {
  const snap = await deps.db.collection('plcs').doc(plcId).get();
  const data = snap.data();
  if (!snap.exists || !isAutoRosterGroup(data)) return 0;
  const group = data as Data;
  const orgId = group.orgId as string;
  const buildingId = canonicalBuildingIdServer(group.buildingId as string);
  const existing = rawMembers(group);

  const profiles = await deps.db
    .collectionGroup('userProfile')
    .where(
      'selectedBuildings',
      'array-contains-any',
      buildingIdVariants(buildingId)
    )
    .get();
  const uids: string[] = [];
  for (const doc of profiles.docs) {
    const segs = doc.ref.path.split('/');
    if (segs.length !== 4 || segs[0] !== 'users' || segs[3] !== 'profile') {
      continue;
    }
    const uid = segs[1];
    if (!existing[uid] && !uids.includes(uid)) uids.push(uid);
  }

  const candidates: AccountInfo[] = [];
  for (const uid of uids) {
    const user = await deps.getUser(uid);
    const email = user?.email?.trim().toLowerCase() ?? '';
    if (!email) continue;
    if (!(await isActiveOrgMember(deps.db, orgId, email))) continue;
    candidates.push({ uid, email, displayName: user?.displayName ?? '' });
  }
  if (candidates.length === 0) return 0;
  return addToGroup(deps, plcId, candidates, 'backfill');
}

/** Trigger body: apply one user's building change to every matching auto-roster group. */
export async function applyProfileBuildingsChange(
  deps: BuildingGroupDeps,
  uid: string,
  before: unknown,
  after: unknown
): Promise<{ added: string[]; removed: string[] }> {
  const result = { added: [] as string[], removed: [] as string[] };
  const diff = diffSelectedBuildings(before, after);
  const touched = [...diff.added, ...diff.removed];
  if (touched.length === 0) return result;

  const groups: Array<{ id: string; data: Data }> = [];
  const touchedIds = [...new Set(touched.flatMap(buildingIdVariants))];
  for (const part of chunk(touchedIds, 30)) {
    const snap = await deps.db
      .collection('plcs')
      .where('buildingId', 'in', part)
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (isAutoRosterGroup(data))
        groups.push({ id: doc.id, data: data as Data });
    }
  }
  if (groups.length === 0) return result;

  let account: AccountInfo | null | undefined;
  const orgOk = new Map<string, boolean>();
  for (const g of groups) {
    const buildingId = canonicalBuildingIdServer(g.data.buildingId as string);
    if (diff.removed.includes(buildingId)) {
      if (!shouldAutoRemove(g.data, uid)) continue;
      if (await removeFromGroup(deps, g.id, uid)) result.removed.push(g.id);
      continue;
    }
    if (account === undefined) {
      const user = await deps.getUser(uid);
      const email = user?.email?.trim().toLowerCase() ?? '';
      account = email
        ? { uid, email, displayName: user?.displayName ?? '' }
        : null;
    }
    if (!account || !diff.added.includes(buildingId)) continue;
    const orgId = g.data.orgId as string;
    if (!orgOk.has(orgId)) {
      orgOk.set(orgId, await isActiveOrgMember(deps.db, orgId, account.email));
    }
    if (!orgOk.get(orgId)) continue;
    if ((await addToGroup(deps, g.id, [account], 'trigger')) > 0) {
      result.added.push(g.id);
    }
  }
  return result;
}

/** Create a building group with its lead and co-leads, then backfill if auto-roster is on. */
export async function createBuildingGroup(
  deps: BuildingGroupDeps,
  payload: CreateBuildingGroupPayload
): Promise<{ plcId: string; added: number }> {
  await assertBuildingInOrg(deps.db, payload.orgId, payload.buildingId);
  const lead = await resolveAccount(deps, payload.orgId, payload.leadEmail);
  if (!lead) {
    throw new HttpsError(
      'failed-precondition',
      `${payload.leadEmail} has not signed in to SpartBoard yet.`
    );
  }
  const coLeads: AccountInfo[] = [];
  const missing: string[] = [];
  for (const email of payload.coLeadEmails) {
    const acct = await resolveAccount(deps, payload.orgId, email);
    if (!acct) missing.push(email);
    else if (
      acct.uid !== lead.uid &&
      !coLeads.some((c) => c.uid === acct.uid)
    ) {
      coLeads.push(acct);
    }
  }
  if (missing.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `Not signed in to SpartBoard yet: ${missing.join(', ')}.`
    );
  }

  const ts = deps.serverTimestamp();
  const record = (a: AccountInfo, role: 'lead' | 'coLead') => ({
    uid: a.uid,
    email: a.email,
    displayName: a.displayName,
    role,
    joinedAt: ts,
    status: 'active',
    addedBy: 'admin',
  });
  const members: Record<string, Data> = { [lead.uid]: record(lead, 'lead') };
  for (const c of coLeads) members[c.uid] = record(c, 'coLead');
  const { memberUids, memberEmails } = activeIndexes(members);

  const ref = deps.db.collection('plcs').doc();
  await ref.set({
    name: payload.name,
    orgId: payload.orgId,
    buildingId: payload.buildingId,
    groupType: 'building',
    autoRoster: payload.autoRoster,
    members,
    leadUid: lead.uid,
    memberUids,
    memberEmails,
    createdAt: ts,
    updatedAt: ts,
  });
  const added = payload.autoRoster
    ? await rosterBuildingGroup(deps, ref.id)
    : 0;
  return { plcId: ref.id, added };
}

/** Optionally rename and switch auto-roster, then backfill; returns the backfill count. */
export async function syncBuildingGroup(
  deps: BuildingGroupDeps,
  plcId: string,
  callerEmailLower: string,
  autoRoster: boolean | undefined,
  name?: string
): Promise<{ added: number; autoRoster: boolean }> {
  const ref = deps.db.collection('plcs').doc(plcId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data || data.groupType !== 'building') {
    throw new HttpsError('not-found', 'No building group with that id.');
  }
  if (typeof data.orgId !== 'string' || !data.orgId) {
    throw new HttpsError(
      'failed-precondition',
      'This group has no organization.'
    );
  }
  await assertCallerIsOrgAdmin(deps.db, data.orgId, callerEmailLower);
  if (name !== undefined && name !== data.name) {
    await ref.update({ name, updatedAt: deps.serverTimestamp() });
  }
  let enabled = data.autoRoster === true;
  if (autoRoster !== undefined && autoRoster !== enabled) {
    await ref.update({ autoRoster, updatedAt: deps.serverTimestamp() });
    enabled = autoRoster;
  }
  const added = enabled ? await rosterBuildingGroup(deps, plcId) : 0;
  return { added, autoRoster: enabled };
}

// ── Deployed functions ───────────────────────────────────────────────────

function defaultDeps(): BuildingGroupDeps {
  const auth = admin.auth();
  const notFound = (err: unknown) =>
    (err as { code?: string }).code === 'auth/user-not-found';
  return {
    db: admin.firestore(),
    getUser: async (uid) => {
      try {
        const u = await auth.getUser(uid);
        return { email: u.email, displayName: u.displayName };
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
    },
    getUserByEmail: async (email) => {
      try {
        const u = await auth.getUserByEmail(email);
        return { uid: u.uid, displayName: u.displayName };
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
    },
    serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
  };
}

interface CallerAuth {
  auth?: {
    uid: string;
    token: { email?: string; email_verified?: boolean };
  } | null;
}

function verifiedCallerEmail(request: CallerAuth): string {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Sign in to manage building groups.'
    );
  }
  const email = request.auth.token.email?.trim().toLowerCase() ?? '';
  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'A verified email is required.');
  }
  return email;
}

export const createBuildingGroupV1 = onCall(
  { memory: '512MiB', timeoutSeconds: 300, maxInstances: 5 },
  async (request): Promise<{ plcId: string; added: number }> => {
    assertViewAsAllowed(request);
    const callerEmail = verifiedCallerEmail(request);
    const payload = parseCreateBuildingGroupPayload(request.data);
    const deps = defaultDeps();
    await assertCallerIsOrgAdmin(deps.db, payload.orgId, callerEmail);
    return createBuildingGroup(deps, payload);
  }
);

export const syncBuildingGroupV1 = onCall(
  { memory: '512MiB', timeoutSeconds: 300, maxInstances: 5 },
  async (request): Promise<{ added: number; autoRoster: boolean }> => {
    assertViewAsAllowed(request);
    const callerEmail = verifiedCallerEmail(request);
    const raw = (request.data ?? {}) as Data;
    const plcId = typeof raw.plcId === 'string' ? raw.plcId.trim() : '';
    if (!plcId) throw new HttpsError('invalid-argument', 'plcId is required.');
    if (raw.autoRoster !== undefined && typeof raw.autoRoster !== 'boolean') {
      throw new HttpsError('invalid-argument', 'autoRoster must be a boolean.');
    }
    let name: string | undefined;
    if (raw.name !== undefined) {
      name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name || name.length > 120) {
        throw new HttpsError(
          'invalid-argument',
          'A name up to 120 characters is required.'
        );
      }
    }
    return syncBuildingGroup(
      defaultDeps(),
      plcId,
      callerEmail,
      raw.autoRoster,
      name
    );
  }
);

export const onUserProfileBuildingsChangedV1 = onDocumentWritten(
  {
    document: 'users/{uid}/userProfile/profile',
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    const before: unknown = event.data?.before?.data()?.selectedBuildings;
    const after: unknown = event.data?.after?.data()?.selectedBuildings;
    const { added, removed } = diffSelectedBuildings(before, after);
    if (added.length === 0 && removed.length === 0) return;
    try {
      const out = await applyProfileBuildingsChange(
        defaultDeps(),
        event.params.uid,
        before,
        after
      );
      if (out.added.length || out.removed.length) {
        logger.info('[autoRoster] building change applied', {
          uid: event.params.uid,
          ...out,
        });
      }
    } catch (err) {
      logger.error('[autoRoster] building change failed', {
        uid: event.params.uid,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
);
