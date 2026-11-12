// Org admin writes (organization, buildings, domains, roles, members) run here so firestore.rules no longer validates them.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { isStrictSuperAdmin } from './authz';
import { assertViewAsAllowed, readViewAsClaim } from './viewAsGuard';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Data = Record<string, unknown>;

export type OrgAdminReason =
  'notAllowed' | 'notFound' | 'alreadyExists' | 'invalidArgument';

export class OrgAdminError extends Error {
  constructor(readonly reason: OrgAdminReason) {
    super(reason);
  }
}

export interface RoleUpsert {
  id: string;
  name: string;
  blurb: string;
  color: string;
  perms: Data;
}

export type OrgAdminAction =
  | { action: 'createOrg'; record: Data }
  | { action: 'updateOrg'; orgId: string; patch: Data }
  | { action: 'addBuilding'; orgId: string; record: Data }
  | { action: 'updateBuilding'; orgId: string; id: string; patch: Data }
  | { action: 'removeBuilding'; orgId: string; id: string }
  | { action: 'addDomain'; orgId: string; record: Data }
  | { action: 'removeDomain'; orgId: string; id: string }
  | {
      action: 'saveRoles';
      orgId: string;
      upserts: RoleUpsert[];
      systemPerms: Array<{ id: string; perms: Data }>;
      deletes: string[];
    }
  | { action: 'updateMembers'; orgId: string; ids: string[]; patch: Data }
  | { action: 'removeMembers'; orgId: string; ids: string[] };

export interface Caller {
  emailLower: string;
  emailVerified: boolean;
  viewAs: boolean;
}

/** What the caller is in one org, resolved once per call. */
export interface CallerTier {
  emailLower: string;
  superAdmin: boolean;
  /** roleId of the caller's live member doc in the target org, or ''. */
  orgRole: string;
  buildingIds: string[];
}

const MAX_IDS = 5000;
const ORG_KEYS = [
  'id',
  'name',
  'shortName',
  'shortCode',
  'state',
  'plan',
  'aiEnabled',
  'primaryAdminEmail',
  'createdAt',
  'users',
  'buildings',
  'status',
  'seedColor',
  'supportUrl',
  'claudeManagedAuth',
];
const DOMAIN_ADMIN_ORG_KEYS = [
  'name',
  'shortName',
  'shortCode',
  'state',
  'primaryAdminEmail',
  'seedColor',
  'supportUrl',
];
const BUILDING_KEYS = [
  'id',
  'orgId',
  'name',
  'address',
  'grades',
  'type',
  'adminEmails',
  'users',
];
const BUILDING_EDIT_KEYS = ['name', 'address', 'grades', 'type', 'adminEmails'];
const DOMAIN_KEYS = [
  'id',
  'orgId',
  'domain',
  'authMethod',
  'status',
  'role',
  'users',
  'addedAt',
];
const ROLE_EDIT_KEYS = ['name', 'blurb', 'color', 'perms'];
const MEMBER_DOMAIN_ADMIN_KEYS = [
  'roleId',
  'buildingIds',
  'status',
  'name',
  'invitedAt',
  'lastActive',
];
const DOMAIN_PATTERN = /^@[a-z0-9.-]+[.][a-z]{2,}$/;
const ISSUER_PATTERN = /^https:\/\/[^\s?#@]+$/;

// Mirrors canonicalBuildingId()/buildingIdAliasGroup() in firestore.rules (and config/buildings.ts).
const BUILDING_ALIAS_GROUPS = [
  ['high', 'orono-high-school'],
  ['middle', 'orono-middle-school'],
  ['intermediate', 'orono-intermediate-school'],
  ['schumann', 'schumann-elementary'],
];

// ── Pure helpers ──

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => deepEqual(v, b[i]))
    );
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return (
      ak.length === bk.length &&
      ak.every(
        (k) => k in (b as Data) && deepEqual((a as Data)[k], (b as Data)[k])
      )
    );
  }
  return false;
}

/** Rules' diff().affectedKeys(): keys added, removed or changed. */
export function affectedKeys(before: Data, after: Data): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (k) => !(k in before) || !(k in after) || !deepEqual(before[k], after[k])
  );
}

function changedOnly(before: Data, after: Data, allowed: string[]): boolean {
  return affectedKeys(before, after).every((k) => allowed.includes(k));
}

function hasOnly(data: Data, allowed: string[]): boolean {
  return Object.keys(data).every((k) => allowed.includes(k));
}

/** Rules' liveStatus(): a missing status counts as active. */
export function liveStatus(d: Data | undefined): boolean {
  const s = d?.status ?? 'active';
  return s === 'active' || s === 'invited';
}

function aliasGroup(id: string): string[] {
  return BUILDING_ALIAS_GROUPS.find((g) => g.includes(id)) ?? [id];
}

export function managesBuilding(
  callerBuildingIds: string[],
  buildingId: string
): boolean {
  const group = aliasGroup(buildingId);
  return callerBuildingIds.some((b) => group.includes(b));
}

export function buildingListsOverlap(a: string[], b: string[]): boolean {
  if (a.some((x) => b.includes(x))) return true;
  return BUILDING_ALIAS_GROUPS.some(
    (g) => a.some((x) => g.includes(x)) && b.some((x) => g.includes(x))
  );
}

function strList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
}

function managedAuthShape(m: unknown): boolean {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const d = m as Data;
  return (
    hasOnly(d, ['enabled', 'issuer']) &&
    typeof d.enabled === 'boolean' &&
    typeof d.issuer === 'string' &&
    d.issuer.length <= 300 &&
    ISSUER_PATTERN.test(d.issuer)
  );
}

function deny(): never {
  throw new OrgAdminError('notAllowed');
}

function orgAdmin(t: CallerTier): boolean {
  return t.superAdmin || t.orgRole === 'domain_admin';
}

// ── Planners: one per rule, each returns the merged doc to write or throws ──

export function planOrgUpdate(
  t: CallerTier,
  existing: Data,
  patch: Data
): Data {
  const next = { ...existing, ...patch };
  if (t.superAdmin) {
    const managedOk =
      deepEqual(
        next.claudeManagedAuth ?? null,
        existing.claudeManagedAuth ?? null
      ) || managedAuthShape(next.claudeManagedAuth);
    if (managedOk) return next;
  }
  if (
    t.orgRole === 'domain_admin' &&
    changedOnly(existing, next, DOMAIN_ADMIN_ORG_KEYS)
  ) {
    return next;
  }
  return deny();
}

export function planOrgCreate(t: CallerTier, record: Data): Data {
  if (!t.superAdmin) deny();
  if (!hasOnly(record, ORG_KEYS)) throw new OrgAdminError('invalidArgument');
  if (
    record.claudeManagedAuth !== undefined &&
    !managedAuthShape(record.claudeManagedAuth)
  ) {
    throw new OrgAdminError('invalidArgument');
  }
  return record;
}

export function planBuildingCreate(
  t: CallerTier,
  orgId: string,
  record: Data
): Data {
  if (
    orgAdmin(t) &&
    record.orgId === orgId &&
    typeof record.id === 'string' &&
    record.users === 0 &&
    hasOnly(record, BUILDING_KEYS)
  ) {
    return record;
  }
  return deny();
}

export function planBuildingUpdate(
  t: CallerTier,
  buildingId: string,
  existing: Data,
  patch: Data
): Data {
  const next = { ...existing, ...patch };
  if (t.superAdmin) return next;
  const scoped =
    t.orgRole === 'domain_admin' ||
    (t.orgRole === 'building_admin' &&
      managesBuilding(t.buildingIds, buildingId));
  if (
    scoped &&
    deepEqual(next.id, existing.id) &&
    deepEqual(next.orgId, existing.orgId) &&
    changedOnly(existing, next, BUILDING_EDIT_KEYS)
  ) {
    return next;
  }
  return deny();
}

export function planDomainCreate(
  t: CallerTier,
  orgId: string,
  record: Data
): Data {
  if (
    orgAdmin(t) &&
    record.orgId === orgId &&
    typeof record.id === 'string' &&
    record.status === 'pending' &&
    record.users === 0 &&
    typeof record.domain === 'string' &&
    DOMAIN_PATTERN.test(record.domain) &&
    hasOnly(record, DOMAIN_KEYS)
  ) {
    return record;
  }
  return deny();
}

/** A custom role upsert: the create rule when absent, the update rule (full replace) when present. */
export function planRoleUpsert(
  t: CallerTier,
  role: RoleUpsert,
  existing: Data | undefined
): Data {
  const next: Data = { ...role, system: false };
  if (!existing) {
    if (orgAdmin(t)) return next;
    return deny();
  }
  if (existing.system === true) return deny();
  if (
    (t.superAdmin || t.orgRole === 'domain_admin') &&
    existing.id === role.id &&
    changedOnly(existing, next, ROLE_EDIT_KEYS)
  ) {
    return next;
  }
  return deny();
}

export function planSystemRolePerms(
  t: CallerTier,
  existing: Data | undefined,
  perms: Data
): Data {
  if (!t.superAdmin || !existing || existing.system !== true) deny();
  return { ...existing, perms };
}

export function planRoleDelete(t: CallerTier, existing: Data): void {
  if (!orgAdmin(t) || existing.system === true) deny();
}

/** Mirrors the members update rule's domain admin and building admin branches. */
export function planMemberUpdate(
  t: CallerTier,
  emailLower: string,
  existing: Data,
  patch: Data,
  legacySuperAdmins: string[]
): Data {
  const next = { ...existing, ...patch };
  const status = next.status ?? 'active';
  if (status !== 'active' && status !== 'invited' && status !== 'inactive') {
    deny();
  }
  if (t.superAdmin) return next;
  const statusSafe =
    deepEqual(next.status ?? '', existing.status ?? '') ||
    !legacySuperAdmins.includes(emailLower);
  const prevRole = existing.roleId ?? '';
  const nextRole = next.roleId ?? '';
  if (t.orgRole === 'domain_admin') {
    const self = emailLower === t.emailLower;
    const ok =
      deepEqual(next.email, existing.email) &&
      deepEqual(next.orgId, existing.orgId) &&
      changedOnly(existing, next, MEMBER_DOMAIN_ADMIN_KEYS) &&
      statusSafe &&
      (!self ||
        (deepEqual(nextRole, prevRole) &&
          deepEqual(next.status ?? '', existing.status ?? ''))) &&
      (prevRole === 'super_admin'
        ? nextRole === 'super_admin' &&
          deepEqual(next.status ?? '', existing.status ?? '')
        : nextRole !== 'super_admin');
    if (ok) return next;
  }
  if (t.orgRole === 'building_admin') {
    const ok =
      emailLower !== t.emailLower &&
      prevRole !== 'super_admin' &&
      prevRole !== 'domain_admin' &&
      buildingListsOverlap(strList(existing.buildingIds), t.buildingIds) &&
      (liveStatus(existing) || !liveStatus(next)) &&
      changedOnly(existing, next, ['status']) &&
      statusSafe;
    if (ok) return next;
  }
  return deny();
}

export function planMemberDelete(
  t: CallerTier,
  existing: Data | undefined
): void {
  if (t.superAdmin) return;
  if (
    t.orgRole === 'domain_admin' &&
    (existing?.roleId ?? '') !== 'super_admin'
  ) {
    return;
  }
  deny();
}

// ── Parsing ──

function str(raw: Data, key: string): string {
  const v = raw[key];
  if (typeof v !== 'string' || !v.trim() || v.includes('/') || v.length > 300) {
    throw new OrgAdminError('invalidArgument');
  }
  return v;
}

function obj(raw: Data, key: string): Data {
  const v = raw[key];
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new OrgAdminError('invalidArgument');
  }
  return v as Data;
}

// Firestore reads a dotted update key as a field path, which the planners' top-level merge can't see.
function patchOf(raw: Data): Data {
  const p = obj(raw, 'patch');
  if (Object.keys(p).some((k) => k.includes('.'))) {
    throw new OrgAdminError('invalidArgument');
  }
  return p;
}

function idList(raw: Data, key: string): string[] {
  const v = raw[key];
  if (!Array.isArray(v) || v.length > MAX_IDS) {
    throw new OrgAdminError('invalidArgument');
  }
  return v.map((_, i) => str(v as unknown as Data, String(i)));
}

function parseRoleUpsert(v: unknown): RoleUpsert {
  if (!v || typeof v !== 'object') throw new OrgAdminError('invalidArgument');
  const r = v as Data;
  const blurb = r.blurb ?? '';
  const color = r.color ?? '';
  if (typeof blurb !== 'string' || typeof color !== 'string') {
    throw new OrgAdminError('invalidArgument');
  }
  return {
    id: str(r, 'id'),
    name: typeof r.name === 'string' ? r.name : '',
    blurb,
    color,
    perms: r.perms === undefined ? {} : obj(r, 'perms'),
  };
}

export function parseOrgAdminAction(input: unknown): OrgAdminAction {
  const raw = (input ?? {}) as Data;
  switch (raw.action) {
    case 'createOrg':
      return { action: 'createOrg', record: obj(raw, 'record') };
    case 'updateOrg':
      return {
        action: 'updateOrg',
        orgId: str(raw, 'orgId'),
        patch: patchOf(raw),
      };
    case 'addBuilding':
    case 'addDomain':
      return {
        action: raw.action,
        orgId: str(raw, 'orgId'),
        record: obj(raw, 'record'),
      };
    case 'updateBuilding':
      return {
        action: 'updateBuilding',
        orgId: str(raw, 'orgId'),
        id: str(raw, 'id'),
        patch: patchOf(raw),
      };
    case 'removeBuilding':
    case 'removeDomain':
      return {
        action: raw.action,
        orgId: str(raw, 'orgId'),
        id: str(raw, 'id'),
      };
    case 'saveRoles': {
      const upserts = Array.isArray(raw.upserts) ? raw.upserts : [];
      const systemPerms = Array.isArray(raw.systemPerms) ? raw.systemPerms : [];
      if (upserts.length + systemPerms.length > 200) {
        throw new OrgAdminError('invalidArgument');
      }
      return {
        action: 'saveRoles',
        orgId: str(raw, 'orgId'),
        upserts: upserts.map(parseRoleUpsert),
        systemPerms: systemPerms.map((p) => {
          const d = (p ?? {}) as Data;
          return { id: str(d, 'id'), perms: obj(d, 'perms') };
        }),
        deletes: raw.deletes === undefined ? [] : idList(raw, 'deletes'),
      };
    }
    case 'updateMembers':
      return {
        action: 'updateMembers',
        orgId: str(raw, 'orgId'),
        ids: idList(raw, 'ids'),
        patch: patchOf(raw),
      };
    case 'removeMembers':
      return {
        action: 'removeMembers',
        orgId: str(raw, 'orgId'),
        ids: idList(raw, 'ids'),
      };
    default:
      throw new OrgAdminError('invalidArgument');
  }
}

// ── Runner ──

async function resolveTier(
  db: admin.firestore.Firestore,
  caller: Caller,
  orgId: string | null
): Promise<CallerTier> {
  const superAdmin = await isStrictSuperAdmin(db, caller.emailLower);
  if (!orgId)
    return {
      emailLower: caller.emailLower,
      superAdmin,
      orgRole: '',
      buildingIds: [],
    };
  const snap = await db
    .doc(`organizations/${orgId}/members/${caller.emailLower}`)
    .get();
  const data = snap.exists ? (snap.data() as Data) : undefined;
  return {
    emailLower: caller.emailLower,
    superAdmin,
    orgRole:
      data && liveStatus(data) && typeof data.roleId === 'string'
        ? data.roleId
        : '',
    buildingIds: strList(data?.buildingIds),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function readData(
  db: admin.firestore.Firestore,
  path: string
): Promise<Data | undefined> {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : undefined;
}

/** Runs one org admin action with the gates firestore.rules applied to the client write. */
export async function runOrgAdminAction(
  db: admin.firestore.Firestore,
  caller: Caller,
  action: OrgAdminAction
): Promise<{ changed: number }> {
  // Rules: email_verified, and viewAsAdminOk() keeps a View as tab out of admin writes.
  if (!caller.emailLower || !caller.emailVerified || caller.viewAs) deny();
  const orgId = action.action === 'createOrg' ? null : action.orgId;
  const tier = await resolveTier(db, caller, orgId);

  switch (action.action) {
    case 'createOrg': {
      const record = planOrgCreate(tier, action.record);
      const id = str(record, 'id');
      if (await readData(db, `organizations/${id}`)) {
        throw new OrgAdminError('alreadyExists');
      }
      await db.doc(`organizations/${id}`).create(record);
      return { changed: 1 };
    }
    case 'updateOrg': {
      const path = `organizations/${action.orgId}`;
      const existing = await readData(db, path);
      if (!existing) throw new OrgAdminError('notFound');
      planOrgUpdate(tier, existing, action.patch);
      await db.doc(path).update(action.patch);
      return { changed: 1 };
    }
    case 'addBuilding':
    case 'addDomain': {
      const record =
        action.action === 'addBuilding'
          ? planBuildingCreate(tier, action.orgId, action.record)
          : planDomainCreate(tier, action.orgId, action.record);
      const sub = action.action === 'addBuilding' ? 'buildings' : 'domains';
      const path = `organizations/${action.orgId}/${sub}/${str(record, 'id')}`;
      if (await readData(db, path)) throw new OrgAdminError('alreadyExists');
      await db.doc(path).create(record);
      return { changed: 1 };
    }
    case 'updateBuilding': {
      const path = `organizations/${action.orgId}/buildings/${action.id}`;
      const existing = await readData(db, path);
      if (!existing) throw new OrgAdminError('notFound');
      planBuildingUpdate(tier, action.id, existing, action.patch);
      await db.doc(path).update(action.patch);
      return { changed: 1 };
    }
    case 'removeBuilding':
    case 'removeDomain': {
      if (!orgAdmin(tier)) deny();
      const sub = action.action === 'removeBuilding' ? 'buildings' : 'domains';
      await db
        .doc(`organizations/${action.orgId}/${sub}/${action.id}`)
        .delete();
      return { changed: 1 };
    }
    case 'saveRoles': {
      const base = `organizations/${action.orgId}/roles`;
      return db.runTransaction(async (tx) => {
        const ids = [
          ...action.upserts.map((r) => r.id),
          ...action.systemPerms.map((r) => r.id),
          ...action.deletes,
        ];
        const snaps = await Promise.all(
          ids.map((id) => tx.get(db.doc(`${base}/${id}`)))
        );
        const byId = new Map(
          snaps.map((s, i) => [
            ids[i],
            s.exists ? (s.data() as Data) : undefined,
          ])
        );
        const writes: Array<() => void> = [];
        for (const role of action.upserts) {
          const next = planRoleUpsert(tier, role, byId.get(role.id));
          writes.push(() => tx.set(db.doc(`${base}/${role.id}`), next));
        }
        for (const p of action.systemPerms) {
          planSystemRolePerms(tier, byId.get(p.id), p.perms);
          writes.push(() =>
            tx.update(db.doc(`${base}/${p.id}`), { perms: p.perms })
          );
        }
        for (const id of action.deletes) {
          const existing = byId.get(id);
          if (!existing) continue;
          planRoleDelete(tier, existing);
          writes.push(() => tx.delete(db.doc(`${base}/${id}`)));
        }
        writes.forEach((w) => w());
        return { changed: writes.length };
      });
    }
    case 'updateMembers':
    case 'removeMembers': {
      const ids = [...new Set(action.ids)];
      const legacy = strList(
        (await readData(db, 'admin_settings/user_roles'))?.superAdmins
      );
      const base = `organizations/${action.orgId}`;
      const existing = await Promise.all(
        ids.map((id) => readData(db, `${base}/members/${id}`))
      );
      // Every target passes before anything is written, like the client's single batch did.
      if (action.action === 'updateMembers') {
        ids.forEach((id, i) => {
          const before = existing[i];
          if (!before) throw new OrgAdminError('notFound');
          planMemberUpdate(tier, id, before, action.patch, legacy);
        });
      } else {
        if (!orgAdmin(tier)) deny();
        existing.forEach((before) => planMemberDelete(tier, before));
      }
      const removedAt = new Date().toISOString();
      for (const part of chunk(ids, 200)) {
        await db.runTransaction((tx) => {
          for (const id of part) {
            const ref = db.doc(`${base}/members/${id}`);
            if (action.action === 'updateMembers') {
              tx.update(ref, action.patch);
            } else {
              tx.delete(ref);
              tx.set(db.doc(`${base}/removedMembers/${id}`), { removedAt });
            }
          }
          return Promise.resolve();
        });
      }
      return { changed: ids.length };
    }
  }
}

export const orgAdminV1 = onCall(
  { memory: '256MiB', timeoutSeconds: 120, maxInstances: 10 },
  async (request): Promise<{ changed: number }> => {
    await assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const token = request.auth.token;
    const caller: Caller = {
      emailLower:
        typeof token.email === 'string' ? token.email.trim().toLowerCase() : '',
      emailVerified: token.email_verified === true,
      viewAs: readViewAsClaim(request) !== null,
    };
    try {
      return await runOrgAdminAction(
        admin.firestore(),
        caller,
        parseOrgAdminAction(request.data)
      );
    } catch (err) {
      if (err instanceof OrgAdminError) {
        const code =
          err.reason === 'notAllowed'
            ? 'permission-denied'
            : err.reason === 'notFound'
              ? 'not-found'
              : err.reason === 'alreadyExists'
                ? 'already-exists'
                : 'invalid-argument';
        throw new HttpsError(code, err.reason, { reason: err.reason });
      }
      throw err;
    }
  }
);
