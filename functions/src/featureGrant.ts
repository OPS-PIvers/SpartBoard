import type * as admin from './firebaseAdmin';
import {
  canonicalBuildingIdServer,
  canonicalizeBuildingIdsServer,
} from './buildingIds';
import { normalizeEmailDomain, resolveOrgIdForDomain } from './classlinkShared';
import { missingDocAccess } from './featureMissingDoc';
import { isExcludedFrom } from './permissionExclusion';

// Feature gates kept apart from quizMediaArchive so callers don't load quiz media to check a flag.
type Firestore = admin.firestore.Firestore;

/** Mirrors `INTERNAL_TIER_DOMAINS` in `utils/userTier.ts`. */
const INTERNAL_TIER_DOMAINS: readonly string[] = ['orono.k12.mn.us'];

/** Mirrors the `free < org < internal` ordering in `utils/userTier.ts`. */
const TIER_RANK: Readonly<Record<string, number>> = {
  free: 0,
  org: 1,
  internal: 2,
};

/** Server twin of `meetsMinTier` — an unset floor imposes no restriction. */
export function meetsMinTierServer(tier: string, minTier: unknown): boolean {
  if (typeof minTier !== 'string' || !minTier) return true;
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minTier] ?? 0);
}

/** The teacher's `selectedBuildings`, canonicalized the way AuthContext does. */
export async function loadTeacherBuildings(
  db: Firestore,
  teacherUid: string
): Promise<string[]> {
  if (!teacherUid) return [];
  const snap = await db
    .doc(`users/${teacherUid}/userProfile/profile`)
    .get()
    .catch(() => null);
  const raw: unknown = snap?.data()?.selectedBuildings;
  return Array.isArray(raw) ? canonicalizeBuildingIdsServer(raw) : [];
}

/** Server twin of `deriveUserTier` — internal domain, else org member, else free. */
export async function deriveTeacherTier(
  db: Firestore,
  teacherEmail: string
): Promise<string> {
  const domain = teacherEmail.split('@')[1] ?? '';
  if (domain && INTERNAL_TIER_DOMAINS.includes(domain)) return 'internal';
  const domainWithAt = normalizeEmailDomain(teacherEmail);
  if (!domainWithAt) return 'free';
  const orgId = await resolveOrgIdForDomain(db, domainWithAt).catch(() => null);
  if (!orgId) return 'free';
  const member = await db
    .doc(`organizations/${orgId}/members/${teacherEmail}`)
    .get()
    .catch(() => null);
  return member?.exists ? 'org' : 'free';
}

/** Server twin of `utils/betaAccess.isBetaUser` — same grant sources. */
export async function isBetaTeacher(
  db: Firestore,
  betaUsers: readonly unknown[],
  emailLower: string
): Promise<boolean> {
  if (!emailLower) return false;
  const listHas = (list: unknown): boolean =>
    Array.isArray(list) &&
    list.some((e) => typeof e === 'string' && e.toLowerCase() === emailLower);
  if (listHas(betaUsers)) return true;
  const roles = await db
    .doc('admin_settings/user_roles')
    .get()
    .catch(() => null);
  if (roles?.exists && listHas(roles.get('betaTeachers'))) return true;
  const domain = normalizeEmailDomain(emailLower);
  const orgId = domain
    ? await resolveOrgIdForDomain(db, domain).catch(() => null)
    : null;
  if (!orgId) return false;
  const member = await db
    .doc(`organizations/${orgId}/members/${emailLower}`)
    .get()
    .catch(() => null);
  const roleId: unknown = member?.exists ? member.get('roleId') : null;
  return typeof roleId === 'string' && roleId.trim() === 'super_admin';
}

/** Same gate for any `global_permissions/{featureId}` record; a missing doc follows the client's `FEATURE_DEFAULTS`. */
export async function isGlobalFeatureGranted(
  db: Firestore,
  featureId: string,
  teacherEmail: string | null,
  teacherUid: string
): Promise<boolean> {
  const snap = await db.collection('global_permissions').doc(featureId).get();
  const email = (teacherEmail ?? '').toLowerCase();
  const isAdmin = async (): Promise<boolean> =>
    !!email && (await db.collection('admins').doc(email).get()).exists;
  if (!snap.exists) {
    const access = missingDocAccess(featureId);
    if (access.audience === 'nobody') return false;
    if (await isAdmin()) return true;
    if (access.audience === 'admins') return false;
    return permissionAudienceAllows(
      db,
      { minTier: access.minTier },
      email,
      teacherUid
    );
  }
  const data = snap.data() ?? {};
  if (data.enabled !== true) return false;
  if (isExcludedFrom(data, email)) return false;
  if (await isAdmin()) return true;
  if (data.accessLevel === 'beta') {
    if (!email) return false;
    const betaUsers = Array.isArray(data.betaUsers) ? data.betaUsers : [];
    if (!(await isBetaTeacher(db, betaUsers, email))) return false;
  } else if (data.accessLevel !== 'public') {
    return false;
  }
  return permissionAudienceAllows(db, data, email, teacherUid);
}

/** A permission doc's `minTier` and `buildings` limits, applied as the client's `resolvePermissionAccess` does. */
export async function permissionAudienceAllows(
  db: Firestore,
  perm: { minTier?: unknown; buildings?: unknown },
  teacherEmail: string,
  teacherUid: string
): Promise<boolean> {
  if (perm.minTier !== undefined && perm.minTier !== null) {
    const tier = teacherEmail
      ? await deriveTeacherTier(db, teacherEmail.toLowerCase())
      : 'free';
    if (!meetsMinTierServer(tier, perm.minTier)) return false;
  }
  if (Array.isArray(perm.buildings) && perm.buildings.length > 0) {
    const allowed = new Set(canonicalizeBuildingIdsServer(perm.buildings));
    const selected = await loadTeacherBuildings(db, teacherUid);
    if (!selected.some((b) => allowed.has(b))) return false;
  }
  return true;
}

/** Server twin of the client's canAccessWidget for one `feature_permissions/{widgetType}` doc. */
export async function isWidgetGranted(
  db: Firestore,
  widgetType: string,
  teacherEmail: string | null,
  teacherUid: string,
  missingDocLevel: 'admin' | 'public'
): Promise<boolean> {
  const email = (teacherEmail ?? '').toLowerCase();
  const [snap, adminDoc] = await Promise.all([
    db.collection('feature_permissions').doc(widgetType).get(),
    email ? db.collection('admins').doc(email).get() : null,
  ]);
  const isAdmin = !!adminDoc?.exists;
  if (!snap.exists) return isAdmin || missingDocLevel === 'public';
  const data = snap.data() ?? {};
  if (data.enabled !== true) return false;
  if (isExcludedFrom(data, email)) return false;
  if (isAdmin) return true;
  if (data.accessLevel === 'beta') {
    const betaUsers = Array.isArray(data.betaUsers) ? data.betaUsers : [];
    if (!(await isBetaTeacher(db, betaUsers, email))) return false;
  } else if (data.accessLevel !== 'public') {
    return false;
  }
  if (
    !(await permissionAudienceAllows(
      db,
      { minTier: data.minTier },
      email,
      teacherUid
    ))
  )
    return false;
  const config: unknown = data.config;
  const dockDefaults: unknown =
    typeof config === 'object' && config !== null
      ? (config as Record<string, unknown>).dockDefaults
      : null;
  if (typeof dockDefaults !== 'object' || dockDefaults === null) return true;
  const selected = await loadTeacherBuildings(db, teacherUid);
  if (selected.length === 0) return true;
  const canonical = new Map<string, unknown>();
  for (const [id, on] of Object.entries(dockDefaults))
    canonical.set(canonicalBuildingIdServer(id), on);
  return !selected.every((b) => canonical.get(b) === false);
}
