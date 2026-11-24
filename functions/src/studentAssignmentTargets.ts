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
 * The same merge applies to students who are ALREADY targeted and therefore
 * absent from this call's `add` (the client sends a strict diff): an edit to
 * their override, or any window change, refreshes their existing pointer doc
 * alongside the add batch.
 *
 * A pointer's TOP-LEVEL `openAt`/`closeAt` is that student's EFFECTIVE window:
 * their `override.openAt`/`override.closeAt` shift when set, else the
 * assignment-level window. C1's pointer-wins merge delivers it to
 * `/my-assignments` and the student apps unchanged.
 *
 * Because the response-write rules bound submissions by the SESSION's
 * `closeAt`, a per-student extension past it would be rejected server-side. So
 * whenever this function writes windows it keeps
 * `session.closeAt = max(assignment closeAt, every per-student effective
 * closeAt)` — spec §3a-E: session-level is the server bound, per-student shifts
 * are client-enforced within it.
 *
 * The resolved target set is persisted back onto the teacher's assignment doc
 * (`targetStudents` + `targetMode`) in the same operation — inside a
 * transaction, since that merge is a read-compute-write and a ref lost to a
 * concurrent call would strand its pointer doc — so the doc always mirrors the
 * true pointer set that the A2b deletion triggers re-hash. Clients never write
 * those two fields themselves.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { LANGUAGE_TAG_RE } from './languageTag';
import { ttsLanguageForTranslationLocale } from './quizReadAloudVoices';
import {
  MAX_STORED_TARGET_REFS,
  MAX_TARGET_REFS,
  parseRef,
  refKey,
  resolveTargets,
  targetRefsFromAssignment,
  uidForRef,
  type ResolvedTarget,
  type SkipReason,
  type StudentTargetRef,
  type TargetAuthorizationContext,
} from './studentTargetDirectory';

export {
  MAX_OWNED_CLASSES,
  MAX_STORED_TARGET_REFS,
  MAX_TAUGHT_CLASSES,
  MAX_TARGET_REFS,
  isTestClassAuthority,
  loadClassLinkMembership,
  loadOwnedRosterClasses,
  loadTargetDirectory,
  loadTestClassMembership,
  parseRef,
  refKey,
  resolveTargets,
  targetRefsFromAssignment,
  uidForRef,
  type ClassLinkCredentials,
  type ResolvedTarget,
  type SkipReason,
  type StudentTargetRef,
  type TargetAuthorizationContext,
  type TargetDirectory,
  type TargetDirectoryName,
} from './studentTargetDirectory';

/** BCP-47 practical maximum; caps an unbounded string before it reaches Firestore. */
const LANGUAGE_TAG_MAX = 35;

export const STUDENT_ASSIGNMENT_KINDS = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'flashcards',
  'writing',
] as const;

export type AssignmentKind = (typeof STUDENT_ASSIGNMENT_KINDS)[number];

/** Teacher-owned assignment archive per kind (all under `users/{uid}/…`). */
export const ASSIGNMENT_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_assignments',
  'video-activity': 'video_activity_assignments',
  'guided-learning': 'guided_learning_assignments',
  'mini-app': 'miniapp_assignments',
  flashcards: 'flashcard_assignments',
  writing: 'writing_assignment_records',
};

/** Kinds whose rules refuse a student outside the run's classes; Flashcards and Writing also admit pointer holders. */
const CLASS_GATED_KINDS: ReadonlySet<AssignmentKind> = new Set([
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
]);

/** Top-level session collection per kind (1:1 with the assignment doc). */
export const SESSION_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  'mini-app': 'mini_app_sessions',
  flashcards: 'flashcard_sessions',
  writing: 'writing_assignment_sessions',
};

export const STUDENT_ASSIGNMENTS_ROOT = 'student_assignments';
export const STUDENT_ASSIGNMENT_ITEMS = 'items';
/** Narrowed classes per call; far above any real class list. */
export const MAX_STUDENT_TARGET_CLASSES = 100;
const POINTER_TX_CHUNK = 200;
const GET_ALL_CHUNK = 100;

export interface StudentOverride {
  timeMultiplier?: 1.5 | 2 | 'unlimited';
  questionIds?: string[];
  /** Values are option TEXT — the teacher client translates editor ids before calling. */
  hiddenOptionIdsByQuestion?: Record<string, string[]>;
  rubricOverrideByQuestion?: Record<string, unknown>;
  tabWarningThreshold?: number | 'off';
  tabAwayLimit?: number | 'off';
  answerChoices?: 2 | 3;
  readAloud?: boolean;
  blockCopyPaste?: boolean;
  /** Writing only (D22): leaves the right-click spelling menu on. */
  spellingHelp?: boolean;
  speechToText?: boolean;
  openAt?: number;
  closeAt?: number;
  /** BCP-47 code. Shape-validated only — membership in the org list is enforced elsewhere. */
  language?: string;
  supports?: QuizSupport[];
  modifiedQuestions?: boolean;
  onPaper?: boolean;
}

export type QuizSupport =
  | { kind: 'text'; title: string; text: string }
  | { kind: 'link'; title: string; url: string }
  | { kind: 'drive'; title: string; fileId: string };

const MAX_SUPPORTS = 5;
const MAX_SUPPORT_TITLE = 80;
const MAX_SUPPORT_TEXT = 1000;
const MAX_SUPPORT_URL = 2000;
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

const supportTitle = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.trim()
    ? raw.trim().slice(0, MAX_SUPPORT_TITLE)
    : null;

// Links must be https so a support can't run script or open a non-web scheme.
const httpsUrl = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || raw.length > MAX_SUPPORT_URL) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

export function sanitizeSupports(raw: unknown): QuizSupport[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: QuizSupport[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SUPPORTS) break;
    if (typeof item !== 'object' || item === null) continue;
    const src = item as Record<string, unknown>;
    const title = supportTitle(src.title);
    if (!title) continue;
    if (src.kind === 'text' && typeof src.text === 'string' && src.text.trim())
      out.push({
        kind: 'text',
        title,
        text: src.text.trim().slice(0, MAX_SUPPORT_TEXT),
      });
    else if (src.kind === 'link') {
      const url = httpsUrl(src.url);
      if (url) out.push({ kind: 'link', title, url });
    } else if (
      src.kind === 'drive' &&
      typeof src.fileId === 'string' &&
      DRIVE_FILE_ID_RE.test(src.fileId)
    )
      out.push({ kind: 'drive', title, fileId: src.fileId });
  }
  return out.length > 0 ? out : undefined;
}

/** `undefined` = key absent (preserve stored value); `null` = explicit clear. */
export interface AssignmentWindow {
  openAt?: number | null;
  closeAt?: number | null;
  dueAt?: number | null;
}

export interface SetAssignmentTargetsResult {
  written: number;
  /** Already-targeted students whose existing pointer this call refreshed. */
  updated?: number;
  removed: number;
  skipped: { ref: StudentTargetRef; reason: SkipReason }[];
  /** Subset of `skipped` whose ref the caller asked to SKIP, not to target. */
  skippedExclusions?: { ref: StudentTargetRef; reason: SkipReason }[];
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
  /**
   * Students the teacher skipped. Absent (the shape every pre-existing client
   * sends) leaves the fan-out exactly as before; present, these refs never
   * receive a pointer doc and any pointer they already hold is deleted.
   */
  excludedTargets?: StudentTargetRef[];
  /** Session classes narrowed to picked students (D5b); absent preserves, `[]` clears. */
  studentTargetClassIds?: string[];
}

/** The skipped-student refs the assignment doc already records. */
export function excludedRefsFromAssignment(
  data: Record<string, unknown> | undefined
): StudentTargetRef[] {
  const raw = Array.isArray(data?.excludedTargets) ? data.excludedTargets : [];
  const refs: StudentTargetRef[] = [];
  for (const item of raw.slice(0, MAX_STORED_TARGET_REFS)) {
    const ref = parseRef(item);
    if (ref) refs.push(ref);
  }
  return refs;
}

/** Every ref that may hold a pointer doc: targets plus skipped students. */
export function pointerRefsFromAssignment(
  data: Record<string, unknown> | undefined
): StudentTargetRef[] {
  const byKey = new Map<string, StudentTargetRef>();
  for (const ref of targetRefsFromAssignment(data)) byKey.set(refKey(ref), ref);
  for (const ref of excludedRefsFromAssignment(data))
    byKey.set(refKey(ref), ref);
  return [...byKey.values()];
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

  // Shape only: LANGUAGE_TAG_RE accepts `zz-ZZ`. Membership in the org's enabled
  // list is enforced at generation and at projection, not here.
  if (
    typeof src.language === 'string' &&
    src.language.trim().length <= LANGUAGE_TAG_MAX &&
    LANGUAGE_TAG_RE.test(src.language.trim())
  ) {
    out.language = src.language.trim();
  }

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

  const awayLimit = src.tabAwayLimit;
  if (awayLimit === 'off') out.tabAwayLimit = 'off';
  else if (typeof awayLimit === 'number' && Number.isFinite(awayLimit))
    out.tabAwayLimit = Math.min(300, Math.max(5, Math.round(awayLimit)));

  if (src.answerChoices === 2 || src.answerChoices === 3)
    out.answerChoices = src.answerChoices;

  if (src.readAloud === true) out.readAloud = true;
  if (src.modifiedQuestions === true) out.modifiedQuestions = true;
  if (src.onPaper === true) out.onPaper = true;
  const supports = sanitizeSupports(src.supports);
  if (supports) out.supports = supports;
  if (typeof src.blockCopyPaste === 'boolean')
    out.blockCopyPaste = src.blockCopyPaste;
  if (src.spellingHelp === true) out.spellingHelp = true;
  if (src.speechToText === true) out.speechToText = true;

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

  const excludedTargets = Array.isArray(data.excludedTargets)
    ? parseRefList(data.excludedTargets, skipped)
    : undefined;

  const studentTargetClassIds = parseClassIdList(data.studentTargetClassIds);
  // A narrowed class only means something next to whole classes on the class channel.
  if (studentTargetClassIds && studentTargetClassIds.length > 0) {
    if (targetMode !== 'class') {
      throw new HttpsError(
        'invalid-argument',
        "studentTargetClassIds needs targetMode 'class'."
      );
    }
  }

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
      ...(excludedTargets ? { excludedTargets } : {}),
      ...(studentTargetClassIds ? { studentTargetClassIds } : {}),
    },
    skipped,
  };
}

/** Absent ⇒ `undefined` (preserve); otherwise a deduped list of class ids. */
function parseClassIdList(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid studentTargetClassIds.');
  }
  const ids = raw.filter(
    (id): id is string =>
      typeof id === 'string' && id.length > 0 && id.length <= 200
  );
  return [...new Set(ids)].slice(0, MAX_STUDENT_TARGET_CLASSES);
}

/** The class ids a session doc targets, legacy single `classId` included. */
function sessionClassIdsOf(
  snap: admin.firestore.DocumentSnapshot
): Set<string> {
  const out = new Set<string>();
  const classIds: unknown = snap.get('classIds');
  if (Array.isArray(classIds)) {
    for (const id of classIds) if (typeof id === 'string') out.add(id);
  }
  const legacy: unknown = snap.get('classId');
  if (typeof legacy === 'string' && legacy.length > 0) out.add(legacy);
  return out;
}

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  return setA.size === new Set(b).size && b.every((id) => setA.has(id));
}

/** Scoring never reads supports, so the assignment-doc mirror leaves them out. */
function withoutSupports(override: StudentOverride): StudentOverride {
  if (!override.supports) return override;
  const rest = { ...override };
  delete rest.supports;
  return rest;
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

function numberOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * One field of a pointer's TOP-LEVEL effective window (F2). A per-student
 * shift wins; otherwise the assignment-level window applies. Reverting to the
 * assignment level is limited to the one case that needs it — a shift the
 * stored override carried and this call removed — so the ordinary
 * absent-key-preserves rule still holds everywhere else.
 */
export function effectivePointerWindowField(
  field: 'openAt' | 'closeAt',
  payload: number | null | undefined,
  assignmentLevel: number | null,
  effectiveOverride: StudentOverride | null | undefined,
  storedOverride: StudentOverride | null | undefined
): number | null | undefined {
  const shift = effectiveOverride?.[field];
  if (typeof shift === 'number' && Number.isFinite(shift)) return shift;
  if (payload !== undefined) return payload;
  const prior = storedOverride?.[field];
  return typeof prior === 'number' ? assignmentLevel : undefined;
}

/**
 * The session-level server bound (§3a-E): the assignment's own close, widened
 * to cover every per-student extension. An unbounded assignment stays
 * unbounded — a per-student close is a client-enforced shift, never a new bound.
 */
export function computeSessionCloseAt(
  assignmentCloseAt: number | null,
  perStudentCloseAt: Iterable<number | undefined>
): number | null {
  if (assignmentCloseAt === null) return null;
  let max = assignmentCloseAt;
  for (const value of perStudentCloseAt) {
    if (typeof value === 'number' && Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return max;
}

/** One pointer write (`payload`) or delete, applied only against what the transaction re-reads. */
interface PointerOp {
  uid: string;
  ref: admin.firestore.DocumentReference;
  payload?: Record<string, unknown>;
  /** A refresh edits a pointer that still exists; it never creates one. */
  requireExisting?: boolean;
}

/** Re-reads each pointer in a transaction; the uids whose pointer another teacher owns are returned untouched. */
async function commitPointerOps(
  db: admin.firestore.Firestore,
  ops: PointerOp[],
  callerUid: string,
  kind: AssignmentKind
): Promise<Set<string>> {
  const conflicts = new Set<string>();
  for (let i = 0; i < ops.length; i += POINTER_TX_CHUNK) {
    const chunk = ops.slice(i, i + POINTER_TX_CHUNK);
    const found = await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(chunk.map((op) => tx.get(op.ref)));
      const lost = new Set<string>();
      chunk.forEach((op, index) => {
        const snap = snaps[index];
        if (snap.exists) {
          const foreign =
            snap.get('teacherUid') !== callerUid ||
            (typeof snap.get('kind') === 'string' && snap.get('kind') !== kind);
          if (foreign) {
            lost.add(op.uid);
            return;
          }
        }
        if (!op.payload) {
          if (snap.exists) tx.delete(op.ref);
        } else if (snap.exists || !op.requireExisting) {
          // Named fields replace whole, so a dropped override key is removed.
          tx.set(op.ref, op.payload, { mergeFields: Object.keys(op.payload) });
        }
      });
      return lost;
    });
    for (const uid of found) conflicts.add(uid);
  }
  return conflicts;
}

/** Reads pointer docs into `into`, keyed by the student uid in each path. */
async function readPointers(
  db: admin.firestore.Firestore,
  refs: admin.firestore.DocumentReference[],
  into: Map<string, Record<string, unknown>>
): Promise<void> {
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    const snaps = await db.getAll(...refs.slice(i, i + GET_ALL_CHUNK));
    for (const snap of snaps) {
      const data = snap.data();
      if (data) into.set(snap.ref.parent.parent?.id ?? '', data);
    }
  }
}

/** The pointer key the student apps read for a session (mini-app falls back to the session id). */
export function pointerKeyForSession(
  kind: AssignmentKind,
  sessionSnap: admin.firestore.DocumentSnapshot
): string {
  const own: unknown =
    kind === 'mini-app' ? sessionSnap.get('assignmentId') : null;
  return typeof own === 'string' && own ? own : sessionSnap.id;
}

/** Page size for the scan of mini-app sessions that carry a pointer key. */
const CLAIM_SCAN_PAGE = 500;

/** Server-only record of the teacher verified to own a pointer key, so later calls skip the scan. */
export const POINTER_KEY_CLAIMS_COLLECTION = 'assignment_key_claims';

/** Refuses a pointer key another teacher owns; returns the claim to record once the call succeeds, if new. */
export async function assertPointerKeyUnclaimed(
  db: admin.firestore.Firestore,
  callerUid: string,
  key: string,
  callerSession: admin.firestore.DocumentSnapshot
): Promise<(() => Promise<unknown>) | null> {
  // A key first exists on its owner's session, so every copy is created later and can't outrank it.
  const created = (snap: admin.firestore.DocumentSnapshot): number =>
    snap.createTime?.toMillis() ?? Number.POSITIVE_INFINITY;
  const anchor = created(callerSession);
  const foreignEarlier = (snap: admin.firestore.DocumentSnapshot): boolean =>
    snap.exists &&
    snap.get('teacherUid') !== callerUid &&
    created(snap) < anchor;
  const refuse = (): never => {
    throw new HttpsError(
      'permission-denied',
      'Assignment id belongs to another teacher.'
    );
  };
  const claimRef = db.collection(POINTER_KEY_CLAIMS_COLLECTION).doc(key);
  const claim = await claimRef.get();
  if (claim.exists) {
    if (claim.get('teacherUid') !== callerUid) refuse();
    return null;
  }
  const sessionSnaps = await db.getAll(
    ...STUDENT_ASSIGNMENT_KINDS.map((k) =>
      db.collection(SESSION_COLLECTION_BY_KIND[k]).doc(key)
    )
  );
  if (sessionSnaps.some(foreignEarlier)) refuse();
  let page = db
    .collection(SESSION_COLLECTION_BY_KIND['mini-app'])
    .where('assignmentId', '==', key)
    .select('teacherUid')
    .limit(CLAIM_SCAN_PAGE);
  for (;;) {
    const { docs } = await page.get();
    if (docs.some(foreignEarlier)) refuse();
    if (docs.length < CLAIM_SCAN_PAGE) break;
    page = page.startAfter(docs[docs.length - 1]);
  }
  return () => claimRef.set({ teacherUid: callerUid, claimedAt: Date.now() });
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
  preSkipped: SetAssignmentTargetsResult['skipped'] = [],
  /** Runs after the commit when a quiz target gains `override.readAloud` (R1). */
  onReadAloudGained?: (
    sessionId: string,
    translationLocales: string[]
  ) => Promise<void>
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
  // Pointer keys must belong to this session, never another teacher's assignment id.
  if (input.assignmentId !== pointerKeyForSession(input.kind, sessionSnap)) {
    throw new HttpsError(
      'permission-denied',
      'Assignment does not belong to this session.'
    );
  }
  const recordKeyClaim = await assertPointerKeyUnclaimed(
    db,
    callerUid,
    input.assignmentId,
    sessionSnap
  );

  // D5b: only classes the session actually targets can be narrowed.
  const storedNarrowed = (() => {
    const raw: unknown = sessionSnap.get('studentTargetClassIds');
    return Array.isArray(raw)
      ? raw.filter((id): id is string => typeof id === 'string')
      : [];
  })();
  const sessionClassIds = sessionClassIdsOf(sessionSnap);
  const narrowedClassIds = input.studentTargetClassIds;
  // Refuse rather than drop an unknown id, which would leave that class's other students seeing it.
  if (narrowedClassIds?.some((id) => !sessionClassIds.has(id))) {
    throw new HttpsError(
      'failed-precondition',
      'studentTargetClassIds names a class this session does not target.'
    );
  }
  // Narrow before pointers land; un-narrow only after the pointer deletes.
  const narrowedDuringWrite =
    narrowedClassIds === undefined
      ? storedNarrowed
      : [...new Set([...storedNarrowed, ...narrowedClassIds])];

  const ctx = await loadContext();
  // Absent `excludedTargets` ⇒ an empty set ⇒ byte-identical behaviour to a
  // client that never sends the field.
  const excludedKeys = new Set((input.excludedTargets ?? []).map(refKey));
  const excludedResolved = resolveTargets(
    input.excludedTargets ?? [],
    ctx,
    hmacSecret
  );
  // Where the rules gate on the run's classes, a picked student outside all of them could never open it, so they are skipped.
  const gateClassIds =
    CLASS_GATED_KINDS.has(input.kind) &&
    ![...sessionClassIds].some((id) => id.startsWith('schoology:'))
      ? sessionClassIds
      : undefined;
  const addResolved = resolveTargets(
    input.add.filter((ref) => !excludedKeys.has(refKey(ref))),
    ctx,
    hmacSecret,
    gateClassIds
  );

  const itemsPath = (uid: string) =>
    db
      .collection(STUDENT_ASSIGNMENTS_ROOT)
      .doc(uid)
      .collection(STUDENT_ASSIGNMENT_ITEMS)
      .doc(input.assignmentId);

  // Pointers are keyed by assignment id alone, so a same-id assignment of another teacher may hold one.
  const pointerByUid = new Map<string, Record<string, unknown>>();
  const pointerReads = [
    ...new Set([
      ...addResolved.resolved.map((t) => t.uid),
      ...excludedResolved.resolved.map((t) => t.uid),
      ...input.remove.map((ref) => uidForRef(ref, hmacSecret)),
    ]),
  ].map(itemsPath);
  await readPointers(db, pointerReads, pointerByUid);
  const isForeign = (uid: string): boolean => {
    const pointer = pointerByUid.get(uid);
    if (!pointer) return false;
    return (
      pointer.teacherUid !== callerUid ||
      (typeof pointer.kind === 'string' && pointer.kind !== input.kind)
    );
  };
  const withoutForeign = (r: {
    resolved: ResolvedTarget[];
    skipped: SetAssignmentTargetsResult['skipped'];
  }) => ({
    resolved: r.resolved.filter((t) => !isForeign(t.uid)),
    skipped: [
      ...r.skipped,
      ...r.resolved
        .filter((t) => isForeign(t.uid))
        .map((t) => ({
          ref: t.ref,
          reason: 'not-in-teacher-classes' as const,
        })),
    ],
  });
  const addResult = withoutForeign(addResolved);
  const excludedResult = withoutForeign(excludedResolved);

  // The authoritative post-call target set: what the doc already recorded,
  // minus this call's removals, plus the refs that resolved. This — not the
  // caller — is what gets persisted, so the doc always mirrors the real
  // pointer set the A2b deletion triggers re-hash.
  const removeKeys = new Set([...input.remove.map(refKey), ...excludedKeys]);
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
  // An excluded student KEEPS a pointer doc — it carries the exclusion marker
  // the class channel reads — so their uid must not be deleted here.
  const excludedUids = new Set(excludedResult.resolved.map((t) => t.uid));
  const removeUids = [
    ...new Set(input.remove.map((ref) => uidForRef(ref, hmacSecret))),
  ].filter((uid) => !addedUids.has(uid) && !excludedUids.has(uid));
  // Only a pointer this caller fanned out is deleted; another teacher's survives.
  const deletableRemoveUids = removeUids.filter((uid) => !isForeign(uid));

  // F1: an already-targeted student never appears in `add` (the client sends a
  // strict diff), so an override edit or a window change would otherwise never
  // reach their pointer doc. Refresh those pointers in the same batch.
  const admittedKeys = new Set(admitted.map((t) => t.key));
  const windowSupplied =
    input.window.openAt !== undefined ||
    input.window.closeAt !== undefined ||
    input.window.dueAt !== undefined;
  const refreshTargets = [...carriedByKey.entries()]
    .filter(
      ([key]) =>
        !admittedKeys.has(key) &&
        (windowSupplied || key in input.overridesBySourcedId)
    )
    .map(([key, ref]) => ({ key, ref, uid: uidForRef(ref, hmacSecret) }))
    .filter((t) => !removeUids.includes(t.uid));

  // An empty resulting set with no explicit 'students' intent must not leave a
  // stuck `individualTargeting: true` that hides the assignment from everyone.
  // An explicitly-empty 'students' assignment is intentional and stays hidden.
  const explicitStudents = input.targetMode === 'students';
  const wantsIndividual =
    explicitStudents || (input.targetMode !== 'class' && carriedByKey.size > 0);

  // Every override this call sets or clears, keyed by pseudonym uid — the one
  // source for both the teacher-side mirror and the session-bound recompute.
  const overrideChangesByUid = new Map<string, StudentOverride | null>();
  for (const target of [...admitted, ...refreshTargets]) {
    if (target.key in input.overridesBySourcedId) {
      overrideChangesByUid.set(
        target.uid,
        input.overridesBySourcedId[target.key]
      );
    }
  }

  const assignmentData = assignmentSnap.data() ?? {};

  // Skipping is suppression, not destruction: the stored mirror keeps the
  // excluded student's override so already-submitted work still grades against
  // the locale it was served in.
  const storedExcludedUids = new Set(
    excludedRefsFromAssignment(assignmentData).map((ref) =>
      uidForRef(ref, hmacSecret)
    )
  );
  const changedKeys = new Set([
    ...input.add.map(refKey),
    ...input.remove.map(refKey),
  ]);
  const finalExcludedUids = new Set(excludedUids);
  for (const ref of excludedRefsFromAssignment(assignmentData)) {
    if (changedKeys.has(refKey(ref))) continue;
    finalExcludedUids.add(uidForRef(ref, hmacSecret));
  }
  // A suppressed or de-targeted student contributes no window and no audio.
  const inactiveUids = new Set([...finalExcludedUids, ...removeUids]);

  const assignmentWindow = {
    openAt: numberOrNull(assignmentData.openAt),
    closeAt: numberOrNull(assignmentData.closeAt),
  };

  // F3 (§3a-E): the response-write rules bound submissions by the SESSION's
  // closeAt, so a per-student extension past it would be rejected. Session
  // level is the server bound; per-student shifts are client-enforced inside it.
  const sessionCloseAtNow = numberOrNull(sessionSnap.get('closeAt'));
  const assignmentCloseAt =
    input.window.closeAt !== undefined
      ? input.window.closeAt
      : assignmentWindow.closeAt;
  const effectiveCloseAtByUid = new Map<string, number | undefined>();
  const effectiveOverrideByUid = new Map<string, StudentOverride | null>();
  const priorOverrideByUid = new Map<string, StudentOverride | null>();
  const storedMirrorByUid = new Map<string, StudentOverride | null>();
  const storedMirror: unknown = assignmentData.overridesByStudentUid;
  if (typeof storedMirror === 'object' && storedMirror !== null) {
    for (const [uid, value] of Object.entries(
      storedMirror as Record<string, StudentOverride | null | undefined>
    )) {
      const stored = value ?? null;
      storedMirrorByUid.set(uid, stored);
      // A student who was already skipped had nothing delivered or prepared,
      // so the "gained" checks must compare against that suppressed state.
      if (storedExcludedUids.has(uid)) priorOverrideByUid.set(uid, null);
      else priorOverrideByUid.set(uid, stored);
      if (inactiveUids.has(uid)) continue;
      effectiveCloseAtByUid.set(
        uid,
        numberOrNull(stored?.closeAt) ?? undefined
      );
      effectiveOverrideByUid.set(uid, stored);
    }
  }
  // Un-skipping without an explicit override edit still restores the preserved
  // accommodation, so the prepare trigger sees what the student regained.
  for (const target of admitted) {
    if (!storedExcludedUids.has(target.uid)) continue;
    if (target.key in input.overridesBySourcedId) continue;
    const stored = storedMirrorByUid.get(target.uid);
    if (stored) overrideChangesByUid.set(target.uid, stored);
  }
  // A skip that also edits the override still records it; delivery stays gated
  // by the `excluded` marker, and the gained checks ignore inactive uids.
  for (const target of excludedResult.resolved) {
    if (!(target.key in input.overridesBySourcedId)) continue;
    // Presence, not truthiness: an explicit null is a clear, not a no-op.
    overrideChangesByUid.set(
      target.uid,
      input.overridesBySourcedId[target.key] ?? null
    );
  }
  for (const uid of removeUids) overrideChangesByUid.set(uid, null);
  for (const [uid, value] of overrideChangesByUid) {
    if (inactiveUids.has(uid)) continue;
    effectiveCloseAtByUid.set(uid, numberOrNull(value?.closeAt) ?? undefined);
    effectiveOverrideByUid.set(uid, value);
  }
  // Read-aloud audio is synthesized only for locales a flagged student holds.
  const readAloudForAll = sessionSnap.get('readAloudAll') === true;
  const readAloudLocales = new Set<string>();
  for (const override of effectiveOverrideByUid.values()) {
    const language = override?.language;
    if (typeof language !== 'string' || !language) continue;
    // Voiceless locales (so, hmn) synthesize nothing; they must not scale the deadline.
    if (!ttsLanguageForTranslationLocale(language)) continue;
    if (readAloudForAll || override?.readAloud === true)
      readAloudLocales.add(language);
  }
  // Under readAloudAll a language-only change still gains audio nobody prepared yet.
  const voicedLocaleGained = [...overrideChangesByUid].some(([uid, value]) => {
    if (!readAloudForAll) return false;
    if (inactiveUids.has(uid)) return false;
    const language = value?.language;
    if (typeof language !== 'string' || !language) return false;
    if (!ttsLanguageForTranslationLocale(language)) return false;
    return priorOverrideByUid.get(uid)?.language !== language;
  });
  const desiredSessionCloseAt = computeSessionCloseAt(
    assignmentCloseAt,
    effectiveCloseAtByUid.values()
  );
  const writesSessionCloseAt =
    (input.window.closeAt !== undefined ||
      overrideChangesByUid.size > 0 ||
      excludedUids.size > 0) &&
    desiredSessionCloseAt !== sessionCloseAtNow;

  // Session flag first: hiding an individually-targeted assignment from the
  // class channel must never lag the pointer writes (§2a one-sided window).
  // The widened bound rides along, so an extended student's pointer never
  // lands before the rules would accept their submission.
  const sessionUpdate: Record<string, unknown> = {};
  if (wantsIndividual) sessionUpdate.individualTargeting = true;
  if (!sameIdSet(narrowedDuringWrite, storedNarrowed)) {
    sessionUpdate.studentTargetClassIds = narrowedDuringWrite;
  }
  if (writesSessionCloseAt) {
    sessionUpdate.closeAt =
      desiredSessionCloseAt === null
        ? admin.firestore.FieldValue.delete()
        : desiredSessionCloseAt;
  }
  if (Object.keys(sessionUpdate).length > 0) {
    await sessionRef.set(sessionUpdate, { merge: true });
  }

  // Existing pointer docs feed the two parts of the merge contract a field-level
  // write can't express on its own: `createdAt` is preserved, never rewritten,
  // and an untouched stored `override` still decides the effective window.
  const existingByUid = new Map<
    string,
    Record<string, unknown> & { override?: StudentOverride | null }
  >();
  const existingExcludedByUid = new Map<string, Record<string, unknown>>();
  const readRefs = [...admitted, ...refreshTargets, ...excludedResult.resolved]
    .filter((t) => !pointerByUid.has(t.uid))
    .map((t) => itemsPath(t.uid));
  const latestByUid = new Map(pointerByUid);
  await readPointers(db, readRefs, latestByUid);
  for (const [uid, data] of latestByUid) {
    existingByUid.set(uid, data);
    if (excludedUids.has(uid)) existingExcludedByUid.set(uid, data);
  }

  /** The mutable half of a pointer write, shared by adds and refreshes. */
  const mutableFields = (key: string, uid: string): Record<string, unknown> => {
    const overrideChanged = key in input.overridesBySourcedId;
    const storedOverride = existingByUid.get(uid)?.override ?? undefined;
    const effectiveOverride = overrideChanged
      ? input.overridesBySourcedId[key]
      : storedOverride;
    const fields: Record<string, unknown> = {};
    for (const field of ['openAt', 'closeAt'] as const) {
      const value = mergeWrite(
        effectivePointerWindowField(
          field,
          input.window[field],
          assignmentWindow[field],
          effectiveOverride,
          storedOverride
        )
      );
      if (value !== undefined) fields[field] = value;
    }
    const dueAt = mergeWrite(input.window.dueAt);
    if (dueAt !== undefined) fields.dueAt = dueAt;
    const override = mergeWrite(
      overrideChanged ? input.overridesBySourcedId[key] : undefined
    );
    if (override !== undefined) fields.override = override;
    return fields;
  };

  const now = Date.now();
  const ops: PointerOp[] = [];
  for (const target of admitted) {
    const storedCreatedAt = existingByUid.get(target.uid)?.createdAt;
    const payload: Record<string, unknown> = {
      kind: input.kind,
      sessionId: input.sessionId,
      teacherUid: callerUid,
      classId: target.classId,
      createdAt: typeof storedCreatedAt === 'number' ? storedCreatedAt : now,
      updatedAt: now,
      // Un-skipping a student who kept an override: drop the stale marker.
      excluded: admin.firestore.FieldValue.delete(),
      ...mutableFields(target.key, target.uid),
    };
    ops.push({ uid: target.uid, ref: itemsPath(target.uid), payload });
  }
  // Skipped students: a pointer doc whose only job is to hide the session from
  // the class channel for this one student. Writing it keeps `targetMode` on
  // 'class', so classmates without an SSO identity still receive the work.
  for (const target of excludedResult.resolved) {
    const storedCreatedAt = existingExcludedByUid.get(target.uid)?.createdAt;
    // Presence, not truthiness: an explicit null clears the stored override.
    const overrideWrite =
      target.key in input.overridesBySourcedId
        ? mergeWrite(input.overridesBySourcedId[target.key] ?? null)
        : undefined;
    const payload: Record<string, unknown> = {
      kind: input.kind,
      sessionId: input.sessionId,
      teacherUid: callerUid,
      classId: target.classId,
      excluded: true,
      ...(overrideWrite !== undefined ? { override: overrideWrite } : {}),
      createdAt: typeof storedCreatedAt === 'number' ? storedCreatedAt : now,
      updatedAt: now,
    };
    ops.push({ uid: target.uid, ref: itemsPath(target.uid), payload });
  }
  // A refresh only ever edits a pointer this caller already fanned out — it
  // never creates one, so a ref forged onto `targetStudents` reaches nothing.
  let updated = 0;
  for (const target of refreshTargets) {
    const existing = existingByUid.get(target.uid);
    if (!existing || existing.teacherUid !== callerUid) continue;
    const fields = mutableFields(target.key, target.uid);
    if (Object.keys(fields).length === 0) continue;
    const payload = { ...fields, updatedAt: now };
    updated += 1;
    ops.push({
      uid: target.uid,
      ref: itemsPath(target.uid),
      payload,
      requireExisting: true,
    });
  }
  for (const uid of deletableRemoveUids) {
    ops.push({ uid, ref: itemsPath(uid) });
  }
  // A pointer another teacher took since the first read is left alone and reported as skipped.
  const conflicts = await commitPointerOps(db, ops, callerUid, input.kind);
  const landed = admitted.filter((t) => !conflicts.has(t.uid));
  const landedExcluded = excludedResult.resolved.filter(
    (t) => !conflicts.has(t.uid)
  );
  const conflictSkips: SetAssignmentTargetsResult['skipped'] = [
    ...admitted,
    ...excludedResult.resolved,
  ]
    .filter((t) => conflicts.has(t.uid))
    .map((t) => ({ ref: t.ref, reason: 'not-in-teacher-classes' as const }));

  // Pseudonym-uid mirror of the per-student overrides, so teacher-side scoring
  // can match a response doc (keyed by the same uid) to its served subset.
  // Lives ONLY on the teacher's own owner-read-only assignment doc — never on a
  // session doc or any shared surface (spec §2a unlinkability rule).
  const overridesByStudentUid: Record<
    string,
    StudentOverride | admin.firestore.FieldValue
  > = {};
  for (const [uid, value] of overrideChangesByUid) {
    if (conflicts.has(uid)) continue;
    overridesByStudentUid[uid] =
      value === null
        ? admin.firestore.FieldValue.delete()
        : withoutSupports(value);
  }
  // Write-once record of the language each student was served. Never cleared,
  // so de-targeting one still grades their submitted work in the right locale.
  const servedLanguageByStudentUid: Record<string, string> = {};
  for (const [uid, value] of overrideChangesByUid) {
    const language = value?.language ?? storedMirrorByUid.get(uid)?.language;
    if (language) servedLanguageByStudentUid[uid] = language;
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
  // Only exclusions that actually landed are persisted: what the doc already
  // recorded, minus anything this call re-targeted or un-skipped, plus the
  // skips that resolved. An unresolved skip stays out of the doc and is
  // reported in `skipped` instead.
  const excludedChangeKeys = new Set([
    ...input.add.map(refKey),
    ...input.remove.map(refKey),
  ]);
  const resolvedExcludedKeys = new Set(landedExcluded.map((t) => t.key));
  const resolveFinalExcluded = (
    freshData: Record<string, unknown> | undefined
  ): StudentTargetRef[] => {
    const byKey = new Map<string, StudentTargetRef>();
    for (const ref of excludedRefsFromAssignment(freshData)) {
      const key = refKey(ref);
      if (excludedChangeKeys.has(key) || resolvedExcludedKeys.has(key))
        continue;
      byKey.set(key, ref);
    }
    for (const target of landedExcluded) byKey.set(target.key, target.ref);
    return [...byKey.values()];
  };

  const finalRefs = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(assignmentRef);
    const byKey = new Map<string, StudentTargetRef>();
    for (const ref of targetRefsFromAssignment(fresh.data())) {
      const key = refKey(ref);
      if (!removeKeys.has(key)) byKey.set(key, ref);
    }
    // A concurrent add lands in `fresh` and is kept even past MAX_TARGET_REFS:
    // its pointer doc exists, so dropping the ref would strand it.
    for (const target of landed) byKey.set(target.key, target.ref);
    const refs = [...byKey.values()];
    const data: Record<string, unknown> = {
      targetStudents: refs,
      targetMode: input.targetMode ?? (refs.length > 0 ? 'students' : 'class'),
      ...(input.excludedTargets
        ? { excludedTargets: resolveFinalExcluded(fresh.data()) }
        : {}),
      ...(narrowedClassIds !== undefined
        ? { studentTargetClassIds: narrowedClassIds }
        : {}),
      ...(Object.keys(overridesByStudentUid).length > 0
        ? { overridesByStudentUid }
        : {}),
      ...(Object.keys(servedLanguageByStudentUid).length > 0
        ? { servedLanguageByStudentUid }
        : {}),
    };
    // Each override replaces its uid's whole field so dropped nested keys don't linger.
    const mergeFields: (string | admin.firestore.FieldPath)[] = Object.keys(
      data
    ).filter((k) => k !== 'overridesByStudentUid');
    for (const uid of Object.keys(overridesByStudentUid)) {
      mergeFields.push(
        new admin.firestore.FieldPath('overridesByStudentUid', uid)
      );
    }
    tx.set(assignmentRef, data, { mergeFields });
    return refs;
  });

  // Recomputed from the transaction's fresh set, so a concurrent add is not
  // re-exposed to the class channel by this call's stale view of the targets.
  const clearsIndividual =
    input.targetMode === 'class' ||
    (!explicitStudents && finalRefs.length === 0);

  // Teardown flag last: revealing the assignment to the class channel must not
  // precede the pointer deletes.
  const teardown: Record<string, unknown> = {};
  if (clearsIndividual) teardown.individualTargeting = false;
  if (
    narrowedClassIds !== undefined &&
    !sameIdSet(narrowedClassIds, narrowedDuringWrite)
  ) {
    teardown.studentTargetClassIds =
      narrowedClassIds.length > 0
        ? narrowedClassIds
        : admin.firestore.FieldValue.delete();
  }
  if (Object.keys(teardown).length > 0) {
    await sessionRef.set(teardown, { merge: true });
  }

  const readAloudGained =
    input.kind === 'quiz' &&
    ([...overrideChangesByUid].some(
      ([uid, v]) =>
        v?.readAloud === true &&
        !inactiveUids.has(uid) &&
        priorOverrideByUid.get(uid)?.readAloud !== true
    ) ||
      voicedLocaleGained);
  if (readAloudGained && onReadAloudGained) {
    await onReadAloudGained(input.sessionId, [...readAloudLocales]);
  }
  if (recordKeyClaim) await recordKeyClaim();

  return {
    written: landed.length,
    updated,
    removed: deletableRemoveUids.filter((uid) => !conflicts.has(uid)).length,
    skipped: [
      ...preSkipped,
      ...addResult.skipped,
      ...excludedResult.skipped,
      ...conflictSkips,
      ...overLimit,
    ],
    ...(excludedResult.skipped.length > 0
      ? { skippedExclusions: excludedResult.skipped }
      : {}),
  };
}
