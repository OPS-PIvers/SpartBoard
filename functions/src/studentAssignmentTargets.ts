/**
 * setAssignmentTargetsV1 — M17 §5 A2. Server-side fan-out of per-student
 * assignment pointers to `/student_assignments/{studentUid}/items/{assignmentId}`.
 *
 * Teachers cannot compute a student's pseudonym uid client-side (the HMAC secret
 * is server-only), and per-student targeting cannot be expressed as a Firestore
 * query filter on the shared session doc (no remaining array-filter budget). So
 * assign-time targeting is translated here: the caller sends roster-level refs
 * (ClassLink `sourcedId` / test-class email), this function re-validates every
 * ref against a class the caller actually teaches, derives the stable uid, and
 * writes one small pointer doc per student.
 *
 * Security posture:
 *   - Ownership: the assignment must live under `users/{caller}/…` AND the
 *     session doc's `teacherUid` must be the caller.
 *   - Targeting: a valid-HMAC-but-unauthorized `sourcedId` must never produce a
 *     pointer doc. Candidate classes come from the caller's own roster docs and
 *     are then re-verified against ClassLink ("does this teacher teach it?"),
 *     mirroring `getPseudonymsForAssignmentV1`. Test classes are scoped to the
 *     org resolved from the caller's own email domain.
 *   - Ordering: the session's `individualTargeting` flag is written BEFORE the
 *     pointer docs so the exposure window stays one-sided (spec §2a).
 *   - PII: `sourcedId` / emails arrive in the payload and are used in memory
 *     only. Pointer docs carry no PII.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import './functionsInit';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from './secrets';
import {
  ALLOWED_ORIGINS,
  ONEROSTER_BASE,
  computeStudentUid,
  getOAuthHeaders,
  isSafeEmailForOneRosterFilter,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
  type ClassLinkClass,
  type ClassLinkStudent,
  type ClassLinkUser,
} from './classlinkShared';

export const STUDENT_ASSIGNMENT_KINDS = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
] as const;

export type AssignmentKind = (typeof STUDENT_ASSIGNMENT_KINDS)[number];

/** Teacher-owned assignment archive per kind (all under `users/{uid}/…`). */
export const ASSIGNMENT_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_assignments',
  'video-activity': 'video_activity_assignments',
  'guided-learning': 'guided_learning_assignments',
  'mini-app': 'miniapp_assignments',
};

/** Top-level session collection per kind (1:1 with the assignment doc). */
export const SESSION_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  'mini-app': 'mini_app_sessions',
};

export const STUDENT_ASSIGNMENTS_ROOT = 'student_assignments';
export const STUDENT_ASSIGNMENT_ITEMS = 'items';

/** Bounds — keep one call's fan-out inside a predictable cost envelope. */
export const MAX_TARGET_REFS = 250;
export const MAX_OWNED_CLASSES = 20;
const ROSTER_SCAN_LIMIT = 100;
const BATCH_OP_LIMIT = 400;
const GET_ALL_CHUNK = 100;

export type StudentTargetRef =
  | { kind: 'classlink'; sourcedId: string }
  | { kind: 'test'; email: string };

export interface StudentOverride {
  timeMultiplier?: 1.5 | 2 | 'unlimited';
  questionIds?: string[];
  hiddenOptionIdsByQuestion?: Record<string, string[]>;
  rubricOverrideByQuestion?: Record<string, unknown>;
  tabWarningThreshold?: number | 'off';
  openAt?: number;
  closeAt?: number;
}

export interface AssignmentWindow {
  openAt?: number | null;
  closeAt?: number | null;
  dueAt?: number | null;
}

export type SkipReason =
  | 'malformed-ref'
  | 'not-in-teacher-classes'
  | 'duplicate'
  | 'over-limit';

export interface SetAssignmentTargetsResult {
  written: number;
  removed: number;
  skipped: { ref: StudentTargetRef; reason: SkipReason }[];
}

/**
 * Classes the caller demonstrably teaches, with the membership needed to
 * authorize each ref kind. Resolved server-side; never taken from the payload.
 */
export interface TargetAuthorizationContext {
  /** ClassLink `sourcedId` → the classId it is enrolled in. */
  classIdBySourcedId: Map<string, string>;
  /** Lowercased test-class member email → the test class slug. */
  classIdByTestEmail: Map<string, string>;
}

export interface SetAssignmentTargetsInput {
  assignmentId: string;
  kind: AssignmentKind;
  sessionId: string;
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  overridesBySourcedId: Record<string, StudentOverride>;
  window: AssignmentWindow;
  /**
   * Explicit target mode. 'students' forces `individualTargeting: true` on the
   * session; 'class' clears it AFTER the pointer deletes. Omitted leaves the
   * flag untouched — a partial remove must never re-expose the assignment.
   */
  targetMode?: 'class' | 'students';
}

// ── ref parsing / normalization ────────────────────────────────────────────

function parseRef(raw: unknown): StudentTargetRef | null {
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

/** Stable dedupe/override key for a ref (matches `overridesBySourcedId` keys). */
export function refKey(ref: StudentTargetRef): string {
  return ref.kind === 'classlink' ? ref.sourcedId : ref.email;
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
  skipped: SetAssignmentTargetsResult['skipped'];
} {
  const resolved: ResolvedTarget[] = [];
  const skipped: SetAssignmentTargetsResult['skipped'] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) {
      skipped.push({ ref, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
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

// ── override sanitization ──────────────────────────────────────────────────

const MAX_OVERRIDE_QUESTIONS = 500;
const MAX_OVERRIDE_MAP_KEYS = 500;

function sanitizeStringList(raw: unknown, cap: number): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, cap);
  return out.length > 0 ? out : undefined;
}

/**
 * Structural sanitizer — drops unknown keys and caps sizes so a hostile payload
 * can't bloat a pointer doc. Content-level validation (never hide the correct
 * answer) needs the quiz body and lands with the override editor (§5 B2).
 */
export function sanitizeOverride(raw: unknown): StudentOverride | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const src = raw as Record<string, unknown>;
  const out: StudentOverride = {};

  const tm = src.timeMultiplier;
  if (tm === 1.5 || tm === 2 || tm === 'unlimited') out.timeMultiplier = tm;

  const questionIds = sanitizeStringList(
    src.questionIds,
    MAX_OVERRIDE_QUESTIONS
  );
  if (questionIds) out.questionIds = questionIds;

  if (
    typeof src.hiddenOptionIdsByQuestion === 'object' &&
    src.hiddenOptionIdsByQuestion !== null
  ) {
    const hidden: Record<string, string[]> = {};
    for (const [qId, value] of Object.entries(
      src.hiddenOptionIdsByQuestion as Record<string, unknown>
    ).slice(0, MAX_OVERRIDE_MAP_KEYS)) {
      const ids = sanitizeStringList(value, MAX_OVERRIDE_QUESTIONS);
      if (ids) hidden[qId] = ids;
    }
    if (Object.keys(hidden).length > 0) out.hiddenOptionIdsByQuestion = hidden;
  }

  if (
    typeof src.rubricOverrideByQuestion === 'object' &&
    src.rubricOverrideByQuestion !== null
  ) {
    const rubrics: Record<string, unknown> = {};
    for (const [qId, value] of Object.entries(
      src.rubricOverrideByQuestion as Record<string, unknown>
    ).slice(0, MAX_OVERRIDE_MAP_KEYS)) {
      if (typeof value === 'object' && value !== null) rubrics[qId] = value;
    }
    if (Object.keys(rubrics).length > 0) out.rubricOverrideByQuestion = rubrics;
  }

  const threshold = src.tabWarningThreshold;
  if (threshold === 'off') out.tabWarningThreshold = 'off';
  else if (
    typeof threshold === 'number' &&
    Number.isFinite(threshold) &&
    threshold >= 0
  )
    out.tabWarningThreshold = Math.floor(threshold);

  if (typeof src.openAt === 'number' && Number.isFinite(src.openAt))
    out.openAt = src.openAt;
  if (typeof src.closeAt === 'number' && Number.isFinite(src.closeAt))
    out.closeAt = src.closeAt;

  return Object.keys(out).length > 0 ? out : null;
}

function sanitizeWindowValue(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

// ── input parsing ──────────────────────────────────────────────────────────

function parseRefList(
  raw: unknown,
  skipped: SetAssignmentTargetsResult['skipped']
): StudentTargetRef[] {
  if (!Array.isArray(raw)) return [];
  const out: StudentTargetRef[] = [];
  for (const item of raw) {
    const ref = parseRef(item);
    if (!ref) {
      // Malformed refs are surfaced with a placeholder so the teacher sees a
      // count rather than a silent drop.
      skipped.push({
        ref: { kind: 'classlink', sourcedId: '' },
        reason: 'malformed-ref',
      });
      continue;
    }
    if (out.length >= MAX_TARGET_REFS) {
      skipped.push({ ref, reason: 'over-limit' });
      continue;
    }
    out.push(ref);
  }
  return out;
}

export function parseSetAssignmentTargetsInput(raw: unknown): {
  input: SetAssignmentTargetsInput;
  skipped: SetAssignmentTargetsResult['skipped'];
} {
  const data = (raw ?? {}) as Record<string, unknown>;
  const assignmentId =
    typeof data.assignmentId === 'string' ? data.assignmentId : '';
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  const kind = data.kind;
  if (!assignmentId || assignmentId.length > 200) {
    throw new HttpsError('invalid-argument', 'Invalid assignmentId.');
  }
  if (!sessionId || sessionId.length > 200) {
    throw new HttpsError('invalid-argument', 'Invalid sessionId.');
  }
  if (
    typeof kind !== 'string' ||
    !(STUDENT_ASSIGNMENT_KINDS as readonly string[]).includes(kind)
  ) {
    throw new HttpsError('invalid-argument', 'Invalid kind.');
  }

  const skipped: SetAssignmentTargetsResult['skipped'] = [];
  const add = parseRefList(data.add, skipped);
  const remove = parseRefList(data.remove, skipped);

  const overridesBySourcedId: Record<string, StudentOverride> = {};
  if (
    typeof data.overridesBySourcedId === 'object' &&
    data.overridesBySourcedId !== null
  ) {
    for (const [key, value] of Object.entries(
      data.overridesBySourcedId as Record<string, unknown>
    ).slice(0, MAX_TARGET_REFS)) {
      const override = sanitizeOverride(value);
      if (override) overridesBySourcedId[key.toLowerCase()] = override;
    }
  }

  const rawWindow = (
    typeof data.window === 'object' && data.window !== null ? data.window : {}
  ) as Record<string, unknown>;

  const targetMode =
    data.targetMode === 'class' || data.targetMode === 'students'
      ? data.targetMode
      : undefined;

  return {
    input: {
      assignmentId,
      kind: kind as AssignmentKind,
      sessionId,
      add,
      remove,
      overridesBySourcedId,
      window: {
        openAt: sanitizeWindowValue(rawWindow.openAt),
        closeAt: sanitizeWindowValue(rawWindow.closeAt),
        dueAt: sanitizeWindowValue(rawWindow.dueAt),
      },
      targetMode,
    },
    skipped,
  };
}

// ── handler ────────────────────────────────────────────────────────────────

/** `overridesBySourcedId` is keyed by sourcedId for ClassLink, email for test. */
function overrideForRef(
  input: SetAssignmentTargetsInput,
  target: ResolvedTarget
): StudentOverride | null {
  return input.overridesBySourcedId[target.key.toLowerCase()] ?? null;
}

async function chunkedCommit(
  db: admin.firestore.Firestore,
  ops: ((batch: admin.firestore.WriteBatch) => void)[]
): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_OP_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_OP_LIMIT)) op(batch);
    await batch.commit();
  }
}

/**
 * Core orchestration. `loadContext` is injected so unit tests can supply the
 * authorized-class map without standing up ClassLink.
 */
export async function handleSetAssignmentTargets(
  db: admin.firestore.Firestore,
  callerUid: string,
  hmacSecret: string,
  input: SetAssignmentTargetsInput,
  loadContext: () => Promise<TargetAuthorizationContext>,
  preSkipped: SetAssignmentTargetsResult['skipped'] = []
): Promise<SetAssignmentTargetsResult> {
  const assignmentRef = db
    .collection('users')
    .doc(callerUid)
    .collection(ASSIGNMENT_COLLECTION_BY_KIND[input.kind])
    .doc(input.assignmentId);
  const sessionRef = db
    .collection(SESSION_COLLECTION_BY_KIND[input.kind])
    .doc(input.sessionId);

  const [assignmentSnap, sessionSnap] = await Promise.all([
    assignmentRef.get(),
    sessionRef.get(),
  ]);
  if (!assignmentSnap.exists) {
    throw new HttpsError('not-found', 'Assignment not found.');
  }
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found.');
  }
  const sessionTeacherUid: unknown = sessionSnap.get('teacherUid');
  if (sessionTeacherUid !== callerUid) {
    throw new HttpsError('permission-denied', 'Not the owner of this session.');
  }

  const ctx = await loadContext();
  const addResult = resolveTargets(input.add, ctx, hmacSecret);
  const addedUids = new Set(addResult.resolved.map((t) => t.uid));
  // Removals are pure deletes of the caller's own fan-out, so they only need a
  // uid — an unrecognized ref simply deletes nothing. A uid present in both
  // lists keeps its pointer (add wins) and never double-writes one batch.
  const removeUids = [
    ...new Set(input.remove.map((ref) => uidForRef(ref, hmacSecret))),
  ].filter((uid) => !addedUids.has(uid));

  const itemsPath = (uid: string) =>
    db
      .collection(STUDENT_ASSIGNMENTS_ROOT)
      .doc(uid)
      .collection(STUDENT_ASSIGNMENT_ITEMS)
      .doc(input.assignmentId);

  // Session flag first: hiding an individually-targeted assignment from the
  // class channel must never lag the pointer writes (§2a one-sided window).
  const wantsIndividual =
    input.targetMode === 'students' ||
    (input.targetMode !== 'class' && addResult.resolved.length > 0);
  if (wantsIndividual) {
    await sessionRef.set({ individualTargeting: true }, { merge: true });
  }

  // Preserve `createdAt` so a re-run converges instead of churning the doc.
  const existingCreatedAt = new Map<string, number>();
  const addRefs = addResult.resolved.map((t) => itemsPath(t.uid));
  for (let i = 0; i < addRefs.length; i += GET_ALL_CHUNK) {
    const snaps = await db.getAll(...addRefs.slice(i, i + GET_ALL_CHUNK));
    for (const snap of snaps) {
      const createdAt: unknown = snap.get('createdAt');
      if (typeof createdAt === 'number') {
        existingCreatedAt.set(snap.ref.parent.parent?.id ?? '', createdAt);
      }
    }
  }

  const now = Date.now();
  const ops: ((batch: admin.firestore.WriteBatch) => void)[] = [];
  for (const target of addResult.resolved) {
    const override = overrideForRef(input, target);
    const payload: Record<string, unknown> = {
      kind: input.kind,
      sessionId: input.sessionId,
      teacherUid: callerUid,
      classId: target.classId,
      createdAt: existingCreatedAt.get(target.uid) ?? now,
      updatedAt: now,
    };
    if (input.window.openAt !== null) payload.openAt = input.window.openAt;
    if (input.window.closeAt !== null) payload.closeAt = input.window.closeAt;
    if (input.window.dueAt !== null) payload.dueAt = input.window.dueAt;
    if (override) payload.override = override;
    const ref = itemsPath(target.uid);
    ops.push((batch) => batch.set(ref, payload));
  }
  for (const uid of removeUids) {
    const ref = itemsPath(uid);
    ops.push((batch) => batch.delete(ref));
  }
  await chunkedCommit(db, ops);

  // Teardown flag last: revealing the assignment to the class channel must not
  // precede the pointer deletes.
  if (input.targetMode === 'class') {
    await sessionRef.set({ individualTargeting: false }, { merge: true });
  }

  return {
    written: addResult.resolved.length,
    removed: removeUids.length,
    skipped: [...preSkipped, ...addResult.skipped],
  };
}

// ── ClassLink-backed authorization context ─────────────────────────────────

interface OneRosterUserWithRole extends ClassLinkUser {
  role?: string;
  roles?: Array<{ role?: string; roleType?: string }>;
}

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

async function loadTestClassMembership(
  db: admin.firestore.Firestore,
  teacherEmail: string,
  testClassIds: readonly string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (testClassIds.length === 0) return out;
  // Org comes from the CALLER's own verified email domain, never the payload —
  // that is what makes cross-org test-class targeting impossible.
  const domain = normalizeEmailDomain(teacherEmail);
  const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
  if (!orgId) return out;
  const snaps = await Promise.all(
    testClassIds.map((id) =>
      db
        .doc(`organizations/${orgId}/testClasses/${id}`)
        .get()
        .catch(() => null)
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
        if (!out.has(lower)) out.set(lower, testClassIds[i]);
      }
    }
  }
  return out;
}

async function loadClassLinkMembership(
  teacherEmail: string,
  ownedClassIds: readonly string[],
  classlinkClientId: string,
  classlinkClientSecret: string,
  tenantUrl: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ownedClassIds.length === 0) return out;
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
    { params: userParams, headers: { ...userHeaders } }
  );
  const teacher = (userResp.data.users ?? [])[0];
  if (!teacher) return out;

  const classesUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users/${teacher.sourcedId}/classes`;
  const classesHeaders = getOAuthHeaders(
    classesUrl,
    {},
    'GET',
    classlinkClientId,
    classlinkClientSecret
  );
  const classesResp = await axios.get<{ classes: ClassLinkClass[] }>(
    classesUrl,
    { headers: { ...classesHeaders } }
  );
  const taught = new Set(
    (classesResp.data.classes ?? [])
      .map((c) => c.sourcedId)
      .filter((id): id is string => typeof id === 'string')
  );
  // Intersection: on the caller's roster AND actually taught by them.
  const authorized = ownedClassIds
    .filter((id) => taught.has(id))
    .slice(0, MAX_OWNED_CLASSES);

  const rosters = await Promise.all(
    authorized.map(async (classId) => {
      const studentsUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/classes/${classId}/students`;
      const headers = getOAuthHeaders(
        studentsUrl,
        {},
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const resp = await axios.get<{ users: ClassLinkStudent[] }>(studentsUrl, {
        headers: { ...headers },
      });
      return { classId, students: resp.data.users ?? [] };
    })
  );
  for (const { classId, students } of rosters) {
    for (const student of students) {
      if (student.sourcedId && !out.has(student.sourcedId)) {
        out.set(student.sourcedId, classId);
      }
    }
  }
  return out;
}

export const setAssignmentTargetsV1 = onCall(
  {
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      STUDENT_PSEUDONYM_HMAC_SECRET,
    ],
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const teacherEmail = request.auth.token.email;
    if (!teacherEmail || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const classlinkClientId = CLASSLINK_CLIENT_ID.value();
    const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    const { input, skipped } = parseSetAssignmentTargetsInput(request.data);
    const db = admin.firestore();
    const callerUid = request.auth.uid;

    const loadContext = async (): Promise<TargetAuthorizationContext> => {
      const owned = await loadOwnedRosterClasses(db, callerUid);
      const [classIdByTestEmail, classIdBySourcedId] = await Promise.all([
        loadTestClassMembership(db, teacherEmail, owned.testClassIds),
        classlinkClientId && classlinkClientSecret && tenantUrl
          ? loadClassLinkMembership(
              teacherEmail,
              owned.classlinkClassIds,
              classlinkClientId,
              classlinkClientSecret,
              tenantUrl
            ).catch((err) => {
              if (axios.isAxiosError(err)) {
                console.error(
                  '[setAssignmentTargetsV1] ClassLink request failed:',
                  err.response?.status
                );
              } else {
                console.error(
                  '[setAssignmentTargetsV1] ClassLink lookup failed.'
                );
              }
              throw new HttpsError('internal', 'Roster service unavailable.');
            })
          : new Map<string, string>(),
      ]);
      return { classIdBySourcedId, classIdByTestEmail };
    };

    return handleSetAssignmentTargets(
      db,
      callerUid,
      hmacSecret,
      input,
      loadContext,
      skipped
    );
  }
);
