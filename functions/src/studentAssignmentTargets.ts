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
 *     org resolved from the caller's own email domain AND gated on the same
 *     org-admin check that governs the `testClasses` docs themselves — roster
 *     docs are client-writable, so same-org alone would let any teacher forge
 *     a `testClassId` and reach any test-class student.
 *   - Ordering: the session's `individualTargeting` flag is written BEFORE the
 *     pointer docs so the exposure window stays one-sided (spec §2a).
 *   - PII: `sourcedId` / emails arrive in the payload and are used in memory
 *     only. Pointer docs carry no PII.
 *
 * Ref keying: every ref is keyed by KIND + identifier — `classlink:{sourcedId}`
 * (case preserved; OneRoster ids are case-sensitive) or `test:{emailLower}`.
 * `overridesBySourcedId` MUST use these same namespaced keys; a bare identifier
 * is rejected, because test emails and sourcedIds share one record and an
 * unqualified key could cross kinds.
 *
 * Merge semantics for an existing pointer doc (partial payloads must never
 * erase a stored 504/IEP accommodation). Expressed as field-level writes under
 * `{merge: true}`, so an untouched field is never rewritten and a concurrent
 * call editing a different field cannot clobber it:
 *   - `override` is rewritten ONLY when this call's `overridesBySourcedId`
 *     contains the ref's key. An explicit `null` clears it; an absent key
 *     preserves whatever is stored. A present but unparseable value is refused
 *     (`malformed-override`) rather than read as a clear, so a garbled payload
 *     cannot erase an accommodation.
 *   - `openAt` / `closeAt` / `dueAt` are rewritten ONLY when the corresponding
 *     key is present in this call's `window`. A present `null` clears the
 *     field; an absent key preserves the stored value.
 *   - `createdAt` is always preserved from the existing doc.
 *
 * The resolved target set is persisted back onto the teacher's assignment doc
 * (`targetStudents` + `targetMode`) in the same operation — inside a
 * transaction, since that merge is a read-compute-write and a ref lost to a
 * concurrent call would strand its pointer doc — so the doc always mirrors the
 * true pointer set that the A2b deletion triggers re-hash. Clients never write
 * those two fields themselves.
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
/**
 * Ceiling for re-parsing an already-persisted `targetStudents` array. Set far
 * above `MAX_TARGET_REFS` and logged when exceeded: the A2b deletion trigger
 * recovers pointer uids from this field alone, so quietly cutting a stored
 * array strands every pointer past the cut with no path left to reap it.
 */
export const MAX_STORED_TARGET_REFS = 2000;
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

/** `undefined` = key absent (preserve stored value); `null` = explicit clear. */
export interface AssignmentWindow {
  openAt?: number | null;
  closeAt?: number | null;
  dueAt?: number | null;
}

export type SkipReason =
  | 'malformed-ref'
  | 'malformed-override'
  | 'not-in-teacher-classes'
  | 'test-class-not-authorized'
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
  /**
   * True only when the caller clears the same org-admin gate that governs the
   * `testClasses` docs themselves. False ⇒ every `test` ref is skipped with a
   * distinct reason rather than falling through as "not in your classes".
   */
  testClassAuthorized: boolean;
}

export interface SetAssignmentTargetsInput {
  assignmentId: string;
  kind: AssignmentKind;
  sessionId: string;
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  /** Keyed by `refKey()`; a present key with `null` clears the override. */
  overridesBySourcedId: Record<string, StudentOverride | null>;
  window: AssignmentWindow;
  /**
   * Explicit target mode. 'students' forces `individualTargeting: true` on the
   * session even when the set is empty (an intentionally empty assignment);
   * 'class' clears it AFTER the pointer deletes. Omitted derives the flag from
   * the resulting full target set.
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

/**
 * Absent key ⇒ `undefined` (preserve the stored value). Present key ⇒ the
 * number, or `null` to clear.
 */
function sanitizeWindowValue(
  window: Record<string, unknown>,
  key: 'openAt' | 'closeAt' | 'dueAt'
): number | null | undefined {
  if (!(key in window)) return undefined;
  const raw = window[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * Override keys must be kind-namespaced (`classlink:…` / `test:…`). Test keys
 * are lowercased to match `refKey`; ClassLink sourcedIds keep their case.
 */
function normalizeOverrideKey(key: string): string | null {
  if (key.startsWith('test:')) return `test:${key.slice(5).toLowerCase()}`;
  return key.startsWith('classlink:') ? key : null;
}

/** Rebuild the ref a normalized override key names, for skip reporting. */
function refFromOverrideKey(key: string): StudentTargetRef {
  return key.startsWith('test:')
    ? { kind: 'test', email: key.slice(5) }
    : { kind: 'classlink', sourcedId: key.slice('classlink:'.length) };
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

  // Only an explicit `null` lands in the record as a clear. A present but
  // unparseable value is NOT treated as one: `sanitizeOverride` returns `null`
  // for both, and collapsing them would let a garbled client payload delete a
  // stored 504/IEP accommodation. Such a key is left out entirely — the merge
  // then preserves the stored value — and reported so the drop isn't silent.
  // Unnamespaced keys are dropped, since they can't be attributed to a kind.
  const overridesBySourcedId: Record<string, StudentOverride | null> = {};
  if (
    typeof data.overridesBySourcedId === 'object' &&
    data.overridesBySourcedId !== null
  ) {
    for (const [key, value] of Object.entries(
      data.overridesBySourcedId as Record<string, unknown>
    ).slice(0, MAX_TARGET_REFS)) {
      const normalized = normalizeOverrideKey(key);
      if (!normalized) continue;
      if (value === null) {
        overridesBySourcedId[normalized] = null;
        continue;
      }
      const sanitized = sanitizeOverride(value);
      if (sanitized) overridesBySourcedId[normalized] = sanitized;
      else
        skipped.push({
          ref: refFromOverrideKey(normalized),
          reason: 'malformed-override',
        });
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
        openAt: sanitizeWindowValue(rawWindow, 'openAt'),
        closeAt: sanitizeWindowValue(rawWindow, 'closeAt'),
        dueAt: sanitizeWindowValue(rawWindow, 'dueAt'),
      },
      targetMode,
    },
    skipped,
  };
}

// ── handler ────────────────────────────────────────────────────────────────

/**
 * Resolve one field under the merge contract, as a field-level write against a
 * `{merge: true}` set: an absent payload key is omitted entirely (the stored
 * value survives untouched, so a concurrent call editing a different field
 * cannot clobber it); a present `null` deletes; anything else replaces.
 */
function mergeWrite<T>(
  supplied: T | null | undefined
): T | admin.firestore.FieldValue | undefined {
  if (supplied === undefined) return undefined;
  return supplied === null ? admin.firestore.FieldValue.delete() : supplied;
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

  const itemsPath = (uid: string) =>
    db
      .collection(STUDENT_ASSIGNMENTS_ROOT)
      .doc(uid)
      .collection(STUDENT_ASSIGNMENT_ITEMS)
      .doc(input.assignmentId);

  // The authoritative post-call target set: what the doc already recorded,
  // minus this call's removals, plus the refs that resolved. This — not the
  // caller — is what gets persisted, so the doc always mirrors the real
  // pointer set the A2b deletion triggers re-hash.
  const removeKeys = new Set(input.remove.map(refKey));
  const carriedByKey = new Map<string, StudentTargetRef>();
  for (const ref of targetRefsFromAssignment(assignmentSnap.data())) {
    const key = refKey(ref);
    if (!removeKeys.has(key)) carriedByKey.set(key, ref);
  }

  // Admission control on the PERSISTED set, not just this call's payload:
  // `MAX_TARGET_REFS` bounds each `add` list, so incremental calls could push
  // the stored array past it. A ref that cannot be recorded in
  // `targetStudents` must not get a pointer doc either — the deletion trigger
  // would never see it. Refs already carried don't consume budget.
  const admitted: ResolvedTarget[] = [];
  const overLimit: SetAssignmentTargetsResult['skipped'] = [];
  for (const target of addResult.resolved) {
    if (carriedByKey.has(target.key) || carriedByKey.size < MAX_TARGET_REFS) {
      carriedByKey.set(target.key, target.ref);
      admitted.push(target);
    } else {
      overLimit.push({ ref: target.ref, reason: 'over-limit' });
    }
  }

  const addedUids = new Set(admitted.map((t) => t.uid));
  // Removals are pure deletes of the caller's own fan-out, so they only need a
  // uid — an unrecognized ref simply deletes nothing. A uid present in both
  // lists keeps its pointer (add wins) and never double-writes one batch.
  const removeUids = [
    ...new Set(input.remove.map((ref) => uidForRef(ref, hmacSecret))),
  ].filter((uid) => !addedUids.has(uid));

  // An empty resulting set with no explicit 'students' intent must not leave a
  // stuck `individualTargeting: true` that hides the assignment from everyone.
  // An explicitly-empty 'students' assignment is intentional and stays hidden.
  const explicitStudents = input.targetMode === 'students';
  const wantsIndividual =
    explicitStudents || (input.targetMode !== 'class' && carriedByKey.size > 0);

  // Session flag first: hiding an individually-targeted assignment from the
  // class channel must never lag the pointer writes (§2a one-sided window).
  if (wantsIndividual) {
    await sessionRef.set({ individualTargeting: true }, { merge: true });
  }

  // Existing pointer docs feed the one part of the merge contract a field-level
  // write can't express on its own: `createdAt` is preserved, never rewritten.
  const existingByUid = new Map<string, Record<string, unknown>>();
  const addRefs = admitted.map((t) => itemsPath(t.uid));
  for (let i = 0; i < addRefs.length; i += GET_ALL_CHUNK) {
    const snaps = await db.getAll(...addRefs.slice(i, i + GET_ALL_CHUNK));
    for (const snap of snaps) {
      const data = snap.data();
      if (data) existingByUid.set(snap.ref.parent.parent?.id ?? '', data);
    }
  }

  const now = Date.now();
  const ops: ((batch: admin.firestore.WriteBatch) => void)[] = [];
  for (const target of admitted) {
    const storedCreatedAt = existingByUid.get(target.uid)?.createdAt;
    const payload: Record<string, unknown> = {
      kind: input.kind,
      sessionId: input.sessionId,
      teacherUid: callerUid,
      classId: target.classId,
      createdAt: typeof storedCreatedAt === 'number' ? storedCreatedAt : now,
      updatedAt: now,
    };
    const openAt = mergeWrite(input.window.openAt);
    const closeAt = mergeWrite(input.window.closeAt);
    const dueAt = mergeWrite(input.window.dueAt);
    const override = mergeWrite(
      target.key in input.overridesBySourcedId
        ? input.overridesBySourcedId[target.key]
        : undefined
    );
    if (openAt !== undefined) payload.openAt = openAt;
    if (closeAt !== undefined) payload.closeAt = closeAt;
    if (dueAt !== undefined) payload.dueAt = dueAt;
    if (override !== undefined) payload.override = override;
    const ref = itemsPath(target.uid);
    ops.push((batch) => batch.set(ref, payload, { merge: true }));
  }
  for (const uid of removeUids) {
    const ref = itemsPath(uid);
    ops.push((batch) => batch.delete(ref));
  }
  await chunkedCommit(db, ops);

  // Pseudonym-uid mirror of the per-student overrides, so teacher-side scoring
  // can match a response doc (keyed by the same uid) to its served subset.
  // Lives ONLY on the teacher's own owner-read-only assignment doc — never on a
  // session doc or any shared surface (spec §2a unlinkability rule).
  const overridesByStudentUid: Record<
    string,
    StudentOverride | admin.firestore.FieldValue
  > = {};
  for (const target of admitted) {
    const write = mergeWrite(
      target.key in input.overridesBySourcedId
        ? input.overridesBySourcedId[target.key]
        : undefined
    );
    if (write !== undefined) overridesByStudentUid[target.uid] = write;
  }
  for (const uid of removeUids) {
    overridesByStudentUid[uid] = admin.firestore.FieldValue.delete();
  }

  // Persisted after the pointer commit so the doc only ever claims targets
  // that actually landed; a failed commit throws and an identical retry
  // converges. Transactional because the merge is a read-compute-write: two
  // concurrent calls reading the same stale `targetStudents` would each write
  // their own view, and the loser's pointer docs — already committed above —
  // would be invisible to the A2b deletion trigger forever.
  // Concurrent remove+add of the SAME ref from two calls can still leave a ref
  // listed with no pointer doc (the pointer batches commit outside this tx); the
  // next edit call for that ref re-resolves it and self-heals.
  const finalRefs = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(assignmentRef);
    const byKey = new Map<string, StudentTargetRef>();
    for (const ref of targetRefsFromAssignment(fresh.data())) {
      const key = refKey(ref);
      if (!removeKeys.has(key)) byKey.set(key, ref);
    }
    // A concurrent add lands in `fresh` and is kept even past MAX_TARGET_REFS:
    // its pointer doc exists, so dropping the ref would strand it.
    for (const target of admitted) byKey.set(target.key, target.ref);
    const refs = [...byKey.values()];
    tx.set(
      assignmentRef,
      {
        targetStudents: refs,
        targetMode:
          input.targetMode ?? (refs.length > 0 ? 'students' : 'class'),
        ...(Object.keys(overridesByStudentUid).length > 0
          ? { overridesByStudentUid }
          : {}),
      },
      { merge: true }
    );
    return refs;
  });

  // Recomputed from the transaction's fresh set, so a concurrent add is not
  // re-exposed to the class channel by this call's stale view of the targets.
  const clearsIndividual =
    input.targetMode === 'class' ||
    (!explicitStudents && finalRefs.length === 0);

  // Teardown flag last: revealing the assignment to the class channel must not
  // precede the pointer deletes.
  if (clearsIndividual) {
    await sessionRef.set({ individualTargeting: false }, { merge: true });
  }

  return {
    written: admitted.length,
    removed: removeUids.length,
    skipped: [...preSkipped, ...addResult.skipped, ...overLimit],
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
 * `isSuperAdmin()` accepts EITHER source the rules accept: the legacy
 * `admin_settings/user_roles.superAdmins[]` list, or an operator-org member doc
 * with `roleId == 'super_admin'`. An `/admins/{email}` doc is deliberately NOT
 * a source — `organizationMembersSync` mirrors building_admins into it too, and
 * the rules gate excludes building admins.
 */
export async function isTestClassAuthority(
  db: admin.firestore.Firestore,
  teacherEmailLower: string,
  orgId: string
): Promise<boolean> {
  const [legacyDoc, operatorMemberDoc, memberDoc] = await Promise.all([
    db.doc('admin_settings/user_roles').get(),
    db
      .doc(`organizations/${OPERATOR_ORG_ID}/members/${teacherEmailLower}`)
      .get(),
    db.doc(`organizations/${orgId}/members/${teacherEmailLower}`).get(),
  ]);
  const legacyList: unknown = legacyDoc.exists
    ? legacyDoc.get('superAdmins')
    : null;
  if (
    Array.isArray(legacyList) &&
    legacyList.some(
      (e) => typeof e === 'string' && e.toLowerCase() === teacherEmailLower
    )
  ) {
    return true;
  }
  if (roleIdOf(operatorMemberDoc) === 'super_admin') return true;
  return roleIdOf(memberDoc) === 'domain_admin';
}

function roleIdOf(snap: admin.firestore.DocumentSnapshot): string {
  const roleId: unknown = snap.exists ? snap.get('roleId') : null;
  return typeof roleId === 'string' ? roleId.trim() : '';
}

async function loadTestClassMembership(
  db: admin.firestore.Firestore,
  teacherEmail: string,
  testClassIds: readonly string[],
  names?: Map<string, TargetDirectoryName>
): Promise<{ membership: Map<string, string>; authorized: boolean }> {
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
  return { membership: out, authorized: true };
}

async function loadClassLinkMembership(
  teacherEmail: string,
  ownedClassIds: readonly string[],
  classlinkClientId: string,
  classlinkClientSecret: string,
  tenantUrl: string,
  names?: Map<string, TargetDirectoryName>
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

    const loadContext = async (): Promise<TargetAuthorizationContext> =>
      (
        await loadTargetDirectory(
          db,
          callerUid,
          teacherEmail,
          { classlinkClientId, classlinkClientSecret, tenantUrl },
          (err) => {
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
          }
        )
      ).ctx;

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
