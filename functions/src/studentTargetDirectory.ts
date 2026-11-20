// Target refs and the teacher's target directory, kept apart from the assigning code so student sign-in doesn't redeploy with it.
import * as admin from './firebaseAdmin';
import axios from 'axios';
import './functionsInit';
import {
  isOneRosterStaff,
  type OneRosterUserWithRole,
} from './studentEmailIdentity';
import {
  CLASSLINK_TIMEOUT_MS,
  CLASSLINK_TOTAL_BUDGET_MS,
  ONEROSTER_BASE,
  computeStudentUid,
  getOAuthHeaders,
  isSafeEmailForOneRosterFilter,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
  type ClassLinkClass,
  type ClassLinkStudent,
} from './classlinkShared';
import { isRevokedMemberStatus } from './authz';

/** Bounds — keep one call's fan-out inside a predictable cost envelope. */
export const MAX_TARGET_REFS = 250;
/**
 * Ceiling for re-parsing an already-persisted `targetStudents` array. Set far
 * above `MAX_TARGET_REFS` and logged when exceeded: the A2b deletion trigger
 * recovers pointer uids from this field alone, so quietly cutting a stored
 * array strands every pointer past the cut with no path left to reap it.
 */
export const MAX_STORED_TARGET_REFS = 2000;
export const MAX_OWNED_CLASSES = 20;
/** Safety ceiling when every class a teacher teaches is read; past it the read fails rather than return part of the roster. */
export const MAX_TAUGHT_CLASSES = 200;
/** Classes whose students are fetched at once. */
const CLASS_FETCH_CONCURRENCY = 10;
const ROSTER_SCAN_LIMIT = 100;
/** OneRoster page size and ceiling (25 x 200 students) when listing a class. */
const ONEROSTER_PAGE_LIMIT = 200;
const ONEROSTER_MAX_PAGES = 25;

export type StudentTargetRef =
  { kind: 'classlink'; sourcedId: string } | { kind: 'test'; email: string };

export type SkipReason =
  | 'malformed-ref'
  | 'malformed-override'
  | 'not-in-teacher-classes'
  | 'test-class-not-authorized'
  | 'duplicate'
  | 'over-limit';

/**
 * Classes the caller demonstrably teaches, with the membership needed to
 * authorize each ref kind. Resolved server-side; never taken from the payload.
 */
export interface TargetAuthorizationContext {
  /** ClassLink `sourcedId` → the classId it is enrolled in. */
  classIdBySourcedId: Map<string, string>;
  /** Lowercased test-class member email → the test class slug. */
  classIdByTestEmail: Map<string, string>;
  /**
   * True only when the caller clears the same org-admin gate that governs the
   * `testClasses` docs themselves. False ⇒ every `test` ref is skipped with a
   * distinct reason rather than falling through as "not in your classes".
   */
  testClassAuthorized: boolean;
}

// ── ref parsing / normalization ────────────────────────────────────────────

export function parseRef(raw: unknown): StudentTargetRef | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const kind = (raw as { kind?: unknown }).kind;
  if (kind === 'classlink') {
    const sourcedId = (raw as { sourcedId?: unknown }).sourcedId;
    if (typeof sourcedId !== 'string' || sourcedId.length === 0) return null;
    if (sourcedId.length > 200) return null;
    return { kind: 'classlink', sourcedId };
  }
  if (kind === 'test') {
    const email = (raw as { email?: unknown }).email;
    if (typeof email !== 'string' || email.length === 0) return null;
    if (email.length > 320 || !email.includes('@')) return null;
    return { kind: 'test', email: email.toLowerCase() };
  }
  return null;
}

/**
 * Kind-namespaced dedupe/override key. Test emails and ClassLink sourcedIds
 * share one `overridesBySourcedId` record, so the kind is part of the key —
 * a bare identifier could otherwise collide across kinds.
 */
export function refKey(ref: StudentTargetRef): string {
  return ref.kind === 'classlink'
    ? `classlink:${ref.sourcedId}`
    : `test:${ref.email}`;
}

/**
 * Re-parse persisted `targetStudents` refs (assignment doc or trigger payload).
 * Unknown shapes are ignored, never thrown on. Reads the whole stored array —
 * `MAX_TARGET_REFS` bounds one call's incoming payload, not the doc's history,
 * and applying it here would hide pointers from the A2b deletion trigger.
 */
export function targetRefsFromAssignment(
  data: Record<string, unknown> | undefined
): StudentTargetRef[] {
  const raw = data?.targetStudents;
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_STORED_TARGET_REFS) {
    // Loud rather than silent: pointers past the cap can no longer be reaped.
    console.error(
      '[studentAssignmentTargets] targetStudents exceeds the stored cap:',
      raw.length
    );
  }
  const out: StudentTargetRef[] = [];
  for (const item of raw.slice(0, MAX_STORED_TARGET_REFS)) {
    const ref = parseRef(item);
    if (ref) out.push(ref);
  }
  return out;
}

/** uid derivation per ref kind — test students namespace as `test:{emailLower}`. */
export function uidForRef(ref: StudentTargetRef, hmacSecret: string): string {
  return ref.kind === 'classlink'
    ? computeStudentUid(ref.sourcedId, hmacSecret)
    : computeStudentUid(`test:${ref.email}`, hmacSecret);
}

export interface ResolvedTarget {
  ref: StudentTargetRef;
  key: string;
  uid: string;
  classId: string;
}

/**
 * Pure resolution: refs the caller is authorized to target become
 * `{uid, classId}`; everything else is reported in `skipped` (never dropped).
 */
export function resolveTargets(
  refs: readonly StudentTargetRef[],
  ctx: TargetAuthorizationContext,
  hmacSecret: string
): {
  resolved: ResolvedTarget[];
  skipped: { ref: StudentTargetRef; reason: SkipReason }[];
} {
  const resolved: ResolvedTarget[] = [];
  const skipped: { ref: StudentTargetRef; reason: SkipReason }[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) {
      skipped.push({ ref, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    if (ref.kind === 'test' && !ctx.testClassAuthorized) {
      skipped.push({ ref, reason: 'test-class-not-authorized' });
      continue;
    }
    const classId =
      ref.kind === 'classlink'
        ? ctx.classIdBySourcedId.get(ref.sourcedId)
        : ctx.classIdByTestEmail.get(ref.email);
    if (!classId) {
      skipped.push({ ref, reason: 'not-in-teacher-classes' });
      continue;
    }
    resolved.push({ ref, key, uid: uidForRef(ref, hmacSecret), classId });
  }
  return { resolved, skipped };
}

// ── ClassLink-backed authorization context ─────────────────────────────────

/**
 * Candidate classes = classes on the caller's OWN roster docs. Roster docs are
 * client-writable, so this is a narrowing hint only; ClassLink re-verification
 * below is the actual authorization for `classlink` refs.
 */
export async function loadOwnedRosterClasses(
  db: admin.firestore.Firestore,
  callerUid: string
): Promise<{ classlinkClassIds: string[]; testClassIds: string[] }> {
  const snap = await db
    .collection('users')
    .doc(callerUid)
    .collection('rosters')
    .limit(ROSTER_SCAN_LIMIT)
    .get();
  const classlinkClassIds = new Set<string>();
  const testClassIds = new Set<string>();
  for (const doc of snap.docs) {
    const classlinkClassId: unknown = doc.get('classlinkClassId');
    if (typeof classlinkClassId === 'string' && classlinkClassId.length > 0) {
      classlinkClassIds.add(classlinkClassId);
    }
    const testClassId: unknown = doc.get('testClassId');
    if (typeof testClassId === 'string' && testClassId.length > 0) {
      testClassIds.add(testClassId);
    }
  }
  return {
    classlinkClassIds: [...classlinkClassIds].slice(0, MAX_OWNED_CLASSES),
    testClassIds: [...testClassIds].slice(0, MAX_OWNED_CLASSES),
  };
}

// Operator org — the fixed path the rules' isMemberSuperAdmin() reads, since
// CEL cannot resolve the caller's own org dynamically.
const OPERATOR_ORG_ID = 'orono';

/**
 * Mirrors the `testClasses` rules gate (`isSuperAdmin() || isDomainAdmin(org)`)
 * exactly: only someone who may legitimately read/write those docs may target
 * their members. Same-org membership alone is NOT enough — roster docs are
 * client-writable, so a plain teacher could otherwise forge a `testClassId`
 * onto their own roster and reach any test-class student in the org.
 *
 * `isSuperAdmin()` is an active operator-org member doc with
 * `roleId == 'super_admin'`. An `/admins/{email}` doc is deliberately NOT
 * a source — `organizationMembersSync` mirrors building_admins into it too, and
 * the rules gate excludes building admins.
 */
export async function isTestClassAuthority(
  db: admin.firestore.Firestore,
  teacherEmailLower: string,
  orgId: string
): Promise<boolean> {
  const [operatorMemberDoc, memberDoc] = await Promise.all([
    db
      .doc(`organizations/${OPERATOR_ORG_ID}/members/${teacherEmailLower}`)
      .get(),
    db.doc(`organizations/${orgId}/members/${teacherEmailLower}`).get(),
  ]);
  const operatorStatus: unknown = operatorMemberDoc.get('status');
  if (
    roleIdOf(operatorMemberDoc) === 'super_admin' &&
    (operatorStatus === undefined || operatorStatus === 'active')
  ) {
    return true;
  }
  return (
    roleIdOf(memberDoc) === 'domain_admin' &&
    !isRevokedMemberStatus(memberDoc.get('status'))
  );
}

function roleIdOf(snap: admin.firestore.DocumentSnapshot): string {
  const roleId: unknown = snap.exists ? snap.get('roleId') : null;
  return typeof roleId === 'string' ? roleId.trim() : '';
}

export async function loadTestClassMembership(
  db: admin.firestore.Firestore,
  teacherEmail: string,
  testClassIds: readonly string[],
  names?: Map<string, TargetDirectoryName>
): Promise<{
  membership: Map<string, string>;
  authorized: boolean;
  /** Set when a test class doc could not be read, so an empty answer is not final. */
  readFailed?: unknown;
}> {
  const out = new Map<string, string>();
  if (testClassIds.length === 0) {
    return { membership: out, authorized: false };
  }
  // Org comes from the CALLER's own verified email domain, never the payload —
  // that is what makes cross-org test-class targeting impossible.
  const domain = normalizeEmailDomain(teacherEmail);
  const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
  if (!orgId) return { membership: out, authorized: false };
  const authorized = await isTestClassAuthority(
    db,
    teacherEmail.toLowerCase(),
    orgId
  );
  if (!authorized) return { membership: out, authorized: false };
  let readFailed: unknown = undefined;
  const snaps = await Promise.all(
    testClassIds.map((id) =>
      db
        .doc(`organizations/${orgId}/testClasses/${id}`)
        .get()
        .catch((err: unknown) => {
          readFailed ??= err;
          return null;
        })
    )
  );
  for (let i = 0; i < testClassIds.length; i++) {
    const snap = snaps[i];
    if (!snap || !snap.exists) continue;
    const memberEmails: unknown = snap.get('memberEmails');
    if (!Array.isArray(memberEmails)) continue;
    for (const email of memberEmails) {
      if (typeof email === 'string' && email.length > 0) {
        const lower = email.toLowerCase();
        if (!out.has(lower)) {
          out.set(lower, testClassIds[i]);
          // Display name = email local-part, matching the roster import dialog.
          names?.set(`test:${lower}`, {
            givenName: lower.split('@')[0] || lower,
            familyName: '',
          });
        }
      }
    }
  }
  return readFailed === undefined
    ? { membership: out, authorized: true }
    : { membership: out, authorized: true, readFailed };
}

/** Every page of a OneRoster list; a full page at the page cap throws rather than return part of it. */
async function fetchClassLinkPages<T>(
  url: string,
  key: string,
  clientId: string,
  clientSecret: string,
  label: string
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page += 1) {
    // OneRoster signs the query string, so the same params go to both.
    const params = {
      limit: String(ONEROSTER_PAGE_LIMIT),
      offset: String(page * ONEROSTER_PAGE_LIMIT),
    };
    const headers = getOAuthHeaders(url, params, 'GET', clientId, clientSecret);
    const resp = await axios.get<Record<string, T[] | undefined>>(url, {
      params,
      headers: { ...headers },
      timeout: CLASSLINK_TIMEOUT_MS,
    });
    const batch = resp.data[key] ?? [];
    out.push(...batch);
    if (batch.length < ONEROSTER_PAGE_LIMIT) return out;
    if (page + 1 >= ONEROSTER_MAX_PAGES) {
      throw new Error(`ClassLink ${label} exceeds the page cap`);
    }
  }
}

export async function loadClassLinkMembership(
  teacherEmail: string,
  /** `null` means every class the teacher teaches; more than `MAX_TAUGHT_CLASSES` throws. */
  ownedClassIds: readonly string[] | null,
  classlinkClientId: string,
  classlinkClientSecret: string,
  tenantUrl: string,
  names?: Map<string, TargetDirectoryName>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ownedClassIds?.length === 0) return out;
  if (!isSafeEmailForOneRosterFilter(teacherEmail)) return out;

  const cleanTenantUrl = tenantUrl.replace(/\/$/, '');
  const usersUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users`;
  const userParams = { filter: `email='${teacherEmail}'` };
  const userHeaders = getOAuthHeaders(
    usersUrl,
    userParams,
    'GET',
    classlinkClientId,
    classlinkClientSecret
  );
  const userResp = await axios.get<{ users: OneRosterUserWithRole[] }>(
    usersUrl,
    {
      params: userParams,
      headers: { ...userHeaders },
      timeout: CLASSLINK_TIMEOUT_MS,
    }
  );
  const teacher = (userResp.data.users ?? []).find(isOneRosterStaff);
  if (!teacher) return out;

  const classes = await fetchClassLinkPages<ClassLinkClass>(
    `${cleanTenantUrl}${ONEROSTER_BASE}/users/${teacher.sourcedId}/classes`,
    'classes',
    classlinkClientId,
    classlinkClientSecret,
    'class list'
  );
  const taught = new Set(
    classes
      .map((c) => c.sourcedId)
      .filter((id): id is string => typeof id === 'string')
  );
  // Intersection: on the caller's roster AND actually taught by them.
  const authorized = ownedClassIds
    ? ownedClassIds.filter((id) => taught.has(id)).slice(0, MAX_OWNED_CLASSES)
    : [...taught];
  if (authorized.length > MAX_TAUGHT_CLASSES) {
    throw new Error('ClassLink teacher has too many classes to read in full');
  }

  const started = Date.now();
  const rosters: { classId: string; students: ClassLinkStudent[] }[] = [];
  for (let i = 0; i < authorized.length; i += CLASS_FETCH_CONCURRENCY) {
    // Fail loudly rather than run into the function deadline with part of the roster.
    if (Date.now() - started > CLASSLINK_TOTAL_BUDGET_MS) {
      throw new Error('ClassLink read exceeded its time budget');
    }
    const group = authorized.slice(i, i + CLASS_FETCH_CONCURRENCY);
    rosters.push(
      ...(await Promise.all(
        group.map(async (classId) => ({
          classId,
          students: await fetchClassLinkPages<ClassLinkStudent>(
            `${cleanTenantUrl}${ONEROSTER_BASE}/classes/${classId}/students`,
            'users',
            classlinkClientId,
            classlinkClientSecret,
            'class roster'
          ),
        }))
      ))
    );
  }
  for (const { classId, students } of rosters) {
    for (const student of students) {
      if (student.sourcedId && !out.has(student.sourcedId)) {
        out.set(student.sourcedId, classId);
        names?.set(`classlink:${student.sourcedId}`, {
          givenName: student.givenName ?? '',
          familyName: student.familyName ?? '',
        });
      }
    }
  }
  return out;
}

/** Display-name parts for one authorized target, keyed by `refKey()`. */
export interface TargetDirectoryName {
  givenName: string;
  familyName: string;
}

export interface TargetDirectory {
  ctx: TargetAuthorizationContext;
  /** `refKey()` → names. In-memory only; never persisted anywhere. */
  namesByRefKey: Map<string, TargetDirectoryName>;
}

export interface ClassLinkCredentials {
  classlinkClientId: string;
  classlinkClientSecret: string;
  tenantUrl: string;
}

/**
 * The single authorization source for ref-level targeting. `setAssignmentTargetsV1`
 * and the ref branch of `getPseudonymsForAssignmentV1` both resolve refs through
 * this, so a teacher can never name-resolve a student they cannot target.
 */
export async function loadTargetDirectory(
  db: admin.firestore.Firestore,
  callerUid: string,
  teacherEmail: string,
  creds: ClassLinkCredentials,
  onClassLinkError: (err: unknown) => never
): Promise<TargetDirectory> {
  const namesByRefKey = new Map<string, TargetDirectoryName>();
  const owned = await loadOwnedRosterClasses(db, callerUid);
  const [testClasses, classIdBySourcedId] = await Promise.all([
    loadTestClassMembership(
      db,
      teacherEmail,
      owned.testClassIds,
      namesByRefKey
    ),
    creds.classlinkClientId && creds.classlinkClientSecret && creds.tenantUrl
      ? loadClassLinkMembership(
          teacherEmail,
          owned.classlinkClassIds,
          creds.classlinkClientId,
          creds.classlinkClientSecret,
          creds.tenantUrl,
          namesByRefKey
        ).catch(onClassLinkError)
      : new Map<string, string>(),
  ]);
  return {
    ctx: {
      classIdBySourcedId,
      classIdByTestEmail: testClasses.membership,
      testClassAuthorized: testClasses.authorized,
    },
    namesByRefKey,
  };
}
