/**
 * useQuizSession hooks
 *
 * Manages live quiz sessions in Firestore.
 *
 * useQuizSessionTeacher — Teacher creates/controls a live session.
 * useQuizSessionStudent — Student joins and submits answers.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  MutableRefObject,
} from 'react';
import {
  doc,
  collection,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  increment,
  deleteField,
  runTransaction,
  serverTimestamp,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore';
import { db, auth, functions } from '@/config/firebase';
import { signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  QuizSession,
  QuizSessionStatus,
  QuizResponse,
  QuizResponseAnswer,
  QuizQuestion,
  QuizPublicQuestion,
  QuizAttemptLedger,
  GradeResult,
} from '@/types';
import { resolvePeriodNames } from '@/utils/periodCompat';

// Re-export for backward compatibility with callers that imported
// QuizSessionOptions from this module before it was moved into types.ts.
export type { QuizSessionOptions } from '../types';

export const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';
export const RESPONSES_COLLECTION = 'responses';
/**
 * Archive subcollection for responses removed by the teacher. Holds a
 * copy of the original response doc plus archive metadata
 * (`archivedAt`, `archivedBy`, `archiveReason`). The live doc is deleted
 * so the deterministic key is freed for a fresh rejoin; the archive
 * preserves partial answers for teacher recovery + dev queries beyond
 * the 48h window the user asked for. Cleanup is intentionally not
 * scheduled — retention is currently indefinite; revisit if storage
 * cost becomes a concern.
 */
export const ARCHIVED_RESPONSES_COLLECTION = 'archived_responses';
/**
 * Append-only per-response snapshot log. Each entry captures the prior
 * value of a question's answer just before it gets overwritten in the
 * `responses/{rid}.answers` array, so a teacher (or admin) can recover
 * text that was lost to a race, a stray empty draft, or a student who
 * retyped over their own work. Writes are fire-and-forget and throttled
 * per-question (see `HISTORY_SNAPSHOT_THROTTLE_MS`) to keep storage and
 * write costs bounded — typical essay quiz has a low double-digit
 * count per student.
 */
export const RESPONSE_HISTORY_COLLECTION = 'history';
/**
 * Minimum interval between history snapshots for the same questionId on
 * the same response. The autosave debounce is 500 ms; without throttling
 * a long essay would fan out to hundreds of near-identical history docs.
 * 5 s gives "enough resolution to recover meaningful state" without
 * making history a per-keystroke audit log.
 */
const HISTORY_SNAPSHOT_THROTTLE_MS = 5000;
/**
 * Top-level cross-launch attempt ledger. Sits alongside `/quiz_sessions/`
 * and accumulates a student's completed-attempt count across every session
 * the teacher creates for the same quiz. Without this collection, the
 * per-session counter on `responses/{key}` resets every launch and a
 * teacher's "1 attempt" intent is bypassed by relaunching the quiz.
 *
 * Doc id: `${quizId}__${studentUid}` (see `quizLedgerKey`). Schema:
 * `QuizAttemptLedger` in types.ts.
 */
export const QUIZ_ATTEMPT_LEDGER_COLLECTION = 'quiz_attempt_ledger';

/**
 * Deterministic ledger doc id. Two underscores keep us safe even if a
 * future quizId or studentUid contains a single underscore (Firestore
 * doc ids allow underscores). HMAC pseudonyms are hex, current quizIds
 * are UUIDs, so collisions are not realistic, but the separator is
 * cheap insurance.
 */
export function quizLedgerKey(quizId: string, studentUid: string): string {
  return `${quizId}__${studentUid}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Is this serialized answer effectively blank? Catches the empty string,
 * whitespace-only text, and the tags-only markup the written-response
 * editor emits when a student clears an essay — `sanitizeQuizResponse`
 * keeps `<p>`/`<br>`, so a cleared essay serializes to `<p></p>` /
 * `<p><br></p>`, NOT ''. A plain `=== ''` check misses that and would let
 * the blank-draft guard be bypassed, silently clobbering a saved essay.
 *
 * For non-HTML answer types (MC option strings, FIB text, pipe-delimited
 * matching/ordering) the tag strip is a no-op, so this only reclassifies
 * genuinely text-empty values as blank.
 */
export function isBlankAnswerText(answer: string): boolean {
  return (
    answer
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim() === ''
  );
}

/**
 * Defensive predicate: refuse a draft autosave that would overwrite a
 * non-empty saved answer with a blank one. Almost always indicates a race
 * (editor briefly emitted blank markup after a remount or a hydration
 * miss) rather than a deliberate clear. Explicit submits (`isDraft=false`)
 * bypass this — a student who really wants to clear an answer can still
 * submit empty.
 */
export function isUnsafeBlankDraft(
  answer: string,
  isDraft: boolean,
  priorEntry: QuizResponseAnswer | undefined
): boolean {
  return (
    isDraft &&
    isBlankAnswerText(answer) &&
    !!priorEntry &&
    priorEntry.answer !== ''
  );
}

/**
 * Defensive predicate: refuse a draft autosave that would downgrade an
 * already-submitted answer's status to 'draft'. The cache-driven
 * autosave path can re-fire for the same question during the SSO
 * listener-fast race window (back-nav before the response listener
 * echoes the just-submitted answer back, so the local `submitted` state
 * briefly flips false), and without this guard the autosave silently
 * flips status 'submitted' → 'draft' and drops the question from the
 * teacher's "Finished" view. Explicit submits (`isDraft=false`) still
 * pass through.
 */
export function isUnsafeStatusDowngrade(
  isDraft: boolean,
  priorEntry: QuizResponseAnswer | undefined
): boolean {
  return isDraft && priorEntry?.status === 'submitted';
}

/**
 * Decide whether to snapshot the prior answer entry to the history
 * subcollection before overwriting. Captures any prior non-empty value
 * the incoming write is about to lose — either because the text
 * changed, or because the status is being destructively downgraded
 * from 'submitted' to 'draft' (which can erase grading state even
 * with identical text). The per-question throttle keeps a long essay
 * from fanning out to hundreds of near-identical docs.
 */
export function shouldSnapshotHistory(
  priorEntry: QuizResponseAnswer | undefined,
  newAnswer: string,
  newIsDraft: boolean,
  lastSnapshotAt: number,
  now: number,
  throttleMs: number = HISTORY_SNAPSHOT_THROTTLE_MS
): boolean {
  if (!priorEntry) return false;
  if (priorEntry.answer === '') return false;
  const textChanged = priorEntry.answer !== newAnswer;
  const statusDowngrade = priorEntry.status === 'submitted' && newIsDraft;
  if (!textChanged && !statusDowngrade) return false;
  return now - lastSnapshotAt >= throttleMs;
}

/** Unbiased Fisher-Yates in-place shuffle (returns new array) */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Convert a full QuizQuestion (with correctAnswer) to a student-safe
 * QuizPublicQuestion (without correctAnswer). Answer choices are pre-shuffled
 * so students can render the UI without ever seeing the answer key.
 */
export function toPublicQuestion(q: QuizQuestion): QuizPublicQuestion {
  const base: QuizPublicQuestion = {
    id: q.id,
    type: q.type,
    text: q.text,
    timeLimit: q.timeLimit,
  };
  if (q.type === 'MC') {
    base.choices = fisherYatesShuffle([
      q.correctAnswer,
      ...q.incorrectAnswers.filter(Boolean),
    ]);
  } else if (q.type === 'Matching') {
    // Use indexOf+slice (not split(':')) so a definition that itself contains
    // a colon (e.g. "9:00 AM", "H:O") survives intact. Only the FIRST colon
    // separates term from definition; everything after stays in `right`.
    const pairs = q.correctAnswer.split('|').map((p) => {
      const sep = p.indexOf(':');
      if (sep < 0) return { left: p, right: '' };
      return { left: p.slice(0, sep), right: p.slice(sep + 1) };
    });
    const distractors = (q.matchingDistractors ?? []).filter(Boolean);
    base.matchingLeft = pairs.map((p) => p.left);
    base.matchingRight = fisherYatesShuffle([
      ...pairs.map((p) => p.right),
      ...distractors,
    ]);
    // Do NOT copy `distractors` onto the public payload. The shuffled
    // `matchingRight` already mixes them in; exposing the explicit list lets
    // a student pop devtools and read off exactly which entries are wrong.
  } else if (q.type === 'Ordering') {
    base.orderingItems = fisherYatesShuffle(q.correctAnswer.split('|'));
  } else if (q.type === 'short' || q.type === 'essay') {
    if (q.placeholder) base.placeholder = q.placeholder;
    if (q.maxWords && q.maxWords > 0) base.maxWords = q.maxWords;
    if (q.points && q.points > 0) base.points = q.points;
  }
  return base;
}

// ─── Grading ──────────────────────────────────────────────────────────────────

/** Normalize an answer string for comparison (collapse whitespace, lowercase). */
export const normalizeAnswer = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Length of the longest subsequence of `given` whose items appear in
 * `correct` in correct relative order. Used for Ordering partial credit:
 * rewards a student who has items in the right order even if shifted.
 *
 * Items in `given` not present in `correct` are skipped (don't break
 * runs). Comparison is whitespace/case-insensitive (`normalizeAnswer`).
 *
 * Duplicate items in `correct` are handled positionally: each occurrence
 * is consumed at most once, in left-to-right order, so a perfect student
 * answer to `[A,B,A]` produces seq `[0,1,2]` (LIS = 3) rather than
 * `[2,1,2]` (LIS = 2) which a value→index map would produce.
 *
 * O(n × m) for the pairing pass plus O(n log n) for the patience-sort
 * tails — n is small enough (≤ 50 ordering items in practice) that the
 * constant matters more than asymptotics.
 */
function longestOrderedSubsequenceLength(
  correct: string[],
  given: string[]
): number {
  const correctNorm = correct.map(normalizeAnswer);
  const used = new Array<boolean>(correct.length).fill(false);
  const seq: number[] = [];
  for (const g of given) {
    const target = normalizeAnswer(g);
    // Pick the leftmost unused occurrence — left-to-right consumption is
    // what produces the intuitive "perfect answer scores full credit"
    // behavior on inputs with duplicates.
    let chosen = -1;
    for (let i = 0; i < correctNorm.length; i++) {
      if (!used[i] && correctNorm[i] === target) {
        chosen = i;
        break;
      }
    }
    if (chosen >= 0) {
      used[chosen] = true;
      seq.push(chosen);
    }
  }
  const tails: number[] = [];
  for (const x of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

export function gradeAnswer(
  question: QuizQuestion,
  studentAnswer: string,
  /**
   * Optional teacher-written manual grade for the response — pulled from
   * `QuizResponse.grading[question.id]`. Only consulted for written
   * question types (`short`, `essay`); ignored for auto-graded types.
   */
  manualGrade?: import('@/types').WrittenAnswerGrade
): GradeResult {
  const max = question.points ?? 1;
  const partial = question.allowPartialCredit === true;

  // Written question types are graded manually by the teacher. If no
  // grade has been entered yet, the answer is reported as "not yet
  // graded" — zero points awarded, isCorrect=false — so downstream stats
  // (which weight by isCorrect) don't credit ungraded essays as correct.
  if (question.type === 'short' || question.type === 'essay') {
    if (!manualGrade) {
      return { isCorrect: false, pointsEarned: 0, pointsMax: max };
    }
    const awarded = Math.min(max, Math.max(0, manualGrade.pointsAwarded));
    return {
      isCorrect: awarded === max && max > 0,
      pointsEarned: awarded,
      pointsMax: max,
    };
  }

  const correct = normalizeAnswer(question.correctAnswer);
  const given = normalizeAnswer(studentAnswer);

  if (question.type === 'MC' || question.type === 'FIB') {
    const isCorrect = correct === given;
    return { isCorrect, pointsEarned: isCorrect ? max : 0, pointsMax: max };
  }
  if (question.type === 'Matching') {
    const correctPairs = correct.split('|').map(normalizeAnswer);
    const givenPairs = given.split('|').map(normalizeAnswer);
    // Build a left→right map from the answer key. Counting by full pair
    // membership in a Set lets a student score full credit by repeating one
    // correct pair (e.g. correct "a:1|b:2", given "a:1|a:1" → 2/2). Keying by
    // left term ensures each prompt is graded at most once.
    const splitPair = (p: string): [string, string] => {
      const sep = p.indexOf(':');
      return sep < 0 ? [p, ''] : [p.slice(0, sep), p.slice(sep + 1)];
    };
    const correctMap = new Map<string, string>();
    for (const p of correctPairs) {
      const [left, right] = splitPair(p);
      correctMap.set(left, right);
    }
    const seenLefts = new Set<string>();
    let matched = 0;
    for (const p of givenPairs) {
      const [left, right] = splitPair(p);
      if (seenLefts.has(left)) continue;
      seenLefts.add(left);
      if (correctMap.has(left) && correctMap.get(left) === right) {
        matched++;
      }
    }
    const total = correctPairs.length;
    const isCorrect = matched === total && givenPairs.length === total;
    if (!partial) {
      return { isCorrect, pointsEarned: isCorrect ? max : 0, pointsMax: max };
    }
    const pointsEarned = total === 0 ? 0 : (matched / total) * max;
    return { isCorrect, pointsEarned, pointsMax: max };
  }
  if (question.type === 'Ordering') {
    const isCorrect = correct === given;
    if (!partial) {
      return { isCorrect, pointsEarned: isCorrect ? max : 0, pointsMax: max };
    }
    const correctItems = question.correctAnswer.split('|');
    const givenItems = studentAnswer.split('|');
    const lis = longestOrderedSubsequenceLength(correctItems, givenItems);
    const pointsEarned =
      correctItems.length === 0 ? 0 : (lis / correctItems.length) * max;
    return { isCorrect, pointsEarned, pointsMax: max };
  }
  return { isCorrect: false, pointsEarned: 0, pointsMax: max };
}

/**
 * Thrown by `joinQuizSession` when a student attempts to join a session they've
 * already completed and the assignment's attempt limit has been reached. The
 * UI should catch this and render a friendly "ask your teacher" message; the
 * teacher can reset by removing the student from the live monitor.
 */
export class AttemptLimitReachedError extends Error {
  constructor() {
    super(
      "You've already submitted this quiz. Talk to your teacher if you need another attempt."
    );
    this.name = 'AttemptLimitReachedError';
  }
}

/**
 * Thrown by `joinQuizSession` when the resolved code maps only to ended
 * sessions. Callers (notably the SSO auto-join in `QuizStudentApp`) use
 * this as a sentinel to fall back to read-only review mode via
 * `subscribeForReview`, rather than string-matching the error message.
 */
export class SessionEndedError extends Error {
  constructor() {
    super('This quiz session has already ended.');
    this.name = 'SessionEndedError';
  }
}

/**
 * Normalize a string for use as a segment inside a Firestore response doc id.
 *
 * Roster period names and pins are teacher-defined free text and can contain
 * `/`, whitespace, or other characters that would either split the doc path
 * or break the `pin-{period}-{pin}` parse contract enforced by
 * `firestore.rules`. We collapse everything non-alphanumeric to `_` and
 * lowercase the result so the encoding is stable across the client and the
 * rules predicate (`^pin-[a-z0-9_]+-[a-z0-9_]+$`).
 *
 * Empty / all-separator inputs fall back to `'default'` rather than producing
 * a zero-length segment that would collapse the doc path.
 *
 * Exported so firestore rules tests can assert the same mapping.
 */
export function encodeResponseKeySegment(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'default';
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const stripped = normalized.replace(/^_+|_+$/g, '');
  return stripped || 'default';
}

/**
 * Compute the deterministic response-doc key.
 *
 * For studentRole (real SSO) auth, we continue to key by `auth.uid` because
 * the uid is stable per-user. For anonymous PIN auth the uid rotates every
 * time the student clears storage or switches device, which would let them
 * bypass attempt limits — so we derive a key from `pin + classPeriod` that
 * is stable per-roster-student.
 *
 * Known limitation: two rosters assigned to the same session with overlapping
 * PINs under the same (normalized) classPeriod would collide on the same doc
 * key. Rosters are normally period-scoped, so this is expected to be rare.
 */
export function computeResponseKey(
  authUid: string,
  isAnonymous: boolean,
  pin: string,
  classPeriod: string | undefined
): string {
  if (!isAnonymous) return authUid;
  return `pin-${encodeResponseKeySegment(classPeriod)}-${encodeResponseKeySegment(pin)}`;
}

/**
 * Branded type for the deterministic response-doc key (computed by
 * `computeResponseKey` / read off `_responseKey`). Pure type-level brand —
 * no wire-format change. Lets call sites (delete-confirm state, exported-id
 * sets) enforce that they never accidentally store a raw `string` where a
 * keyed-by-response-doc value is expected.
 *
 * The Firestore wire format stays `string[]` for backwards compatibility;
 * cast at the boundary (read from / write to assignment doc).
 */
export type ResponseDocKey = string & { readonly __brand: 'ResponseDocKey' };

/**
 * Resolve the Firestore doc id for a given response. The snapshot listeners
 * attach `_responseKey` to every row so teacher-side UI can target the
 * underlying doc without knowing the keying scheme; legacy rows predating
 * that field still equate the key with `studentUid`, hence the fallback.
 */
export function getResponseDocKey(response: QuizResponse): ResponseDocKey {
  return (response._responseKey ?? response.studentUid) as ResponseDocKey;
}

// Safe extraction of FirestoreError.code (or any error-like object's `code`
// field). Returns undefined when err isn't an object or has no string `code`,
// so callers don't blow up on non-Error throws or stringly-typed values.
function getErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

// Phase-A diagnostic helper: when a Firestore op inside joinQuizSession
// rejects, emit a structured breadcrumb naming the op + the join's auth/PIN
// state, then re-throw. The outer catch in joinQuizSession only sees
// `err.message`, which is "Missing or insufficient permissions" verbatim —
// the breadcrumb is the only place we can correlate the denial back to which
// of the (lookup / read-existing / create / update-reset / update-period /
// update-classid) operations actually tripped, and what the request shape
// looked like at that moment.
//
// Always re-throws so callers' control flow is unchanged. Type is `never`
// so TS narrows correctly when used in `catch` blocks that don't want a
// dangling promise return path.
function logQuizJoinFirestoreError(
  op: string,
  err: unknown,
  ctx: Record<string, unknown>
): never {
  const code = getErrorCode(err);
  if (code === 'permission-denied') {
    console.warn(
      `[useQuizSession] permission-denied during joinQuizSession op=${op}:`,
      { op, code, ...ctx, err }
    );
  }
  throw err;
}

/**
 * Look up the student's response doc for a session, trying the deterministic
 * key first and falling back to the legacy auth-uid key for anonymous PIN
 * joiners whose in-progress doc was written under the old keying scheme.
 * Returns the resolved key and the snapshot (existent or not) so the caller
 * can branch on `snap.exists()` without re-fetching.
 */
async function findExistingResponseDoc(
  sessionId: string,
  authUid: string,
  isAnonymous: boolean,
  deterministicKey: string
): Promise<{ key: string; snap: DocumentSnapshot | null }> {
  // Probe the deterministic key. For anonymous joiners, `permission-denied`
  // here means a doc exists at this key but was written by a different anon
  // UID — either a real PIN collision (two students sharing pin+period) or
  // the same student rejoining from a fresh browser session. The response
  // read rule denies because `request.auth.uid != resource.data.studentUid`.
  // Treat that as "doc inaccessible from here" so the caller falls through
  // to the legacy probe / setDoc path; the rule denial on the subsequent
  // setDoc/updateDoc surfaces a coherent UI error via joinQuizSession's
  // outer catch instead of an unhandled rejection.
  //
  // For SSO/studentRole users, `permission-denied` is a legitimate
  // class-gate denial (and `deterministicKey === authUid`, so the legacy
  // probe wouldn't run anyway) — let it propagate so the join fails fast
  // instead of attempting a doomed write. The breadcrumb log catches
  // anything else permission-denied could mask (App Check misconfig,
  // emulator vs prod rules drift) on the anon path.
  let deterministicSnap: DocumentSnapshot | null = null;
  try {
    deterministicSnap = await getDoc(
      doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        deterministicKey
      )
    );
  } catch (err) {
    if (!isAnonymous || getErrorCode(err) !== 'permission-denied') throw err;
    console.warn(
      '[useQuizSession] permission-denied on deterministic response probe; falling through to legacy/create path.',
      { sessionId, deterministicKey, err }
    );
  }
  if (deterministicSnap?.exists()) {
    return { key: deterministicKey, snap: deterministicSnap };
  }
  if (isAnonymous && deterministicKey !== authUid) {
    // Probe the legacy authUid-keyed slot. The doc, if it exists, was created
    // by a previous device/session whose anon UID is no longer ours, so its
    // `studentUid` field will not match `request.auth.uid` — and the response
    // read rule rejects with permission-denied. Treat that rejection as
    // "no legacy doc here" rather than letting it bubble out as a generic
    // joinQuizSession error toast on the student side.
    try {
      const legacySnap = await getDoc(
        doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_COLLECTION,
          authUid
        )
      );
      if (legacySnap.exists()) {
        return { key: authUid, snap: legacySnap };
      }
    } catch (err) {
      if (getErrorCode(err) !== 'permission-denied') throw err;
      console.warn(
        '[useQuizSession] permission-denied on legacy response probe; treating as no doc.',
        { sessionId, authUid, err }
      );
    }
  }
  return { key: deterministicKey, snap: deterministicSnap };
}

// ─── Teacher hook ─────────────────────────────────────────────────────────────

export interface UseQuizSessionTeacherResult {
  session: QuizSession | null;
  responses: QuizResponse[];
  loading: boolean;
  advanceQuestion: () => Promise<void>;
  /**
   * Transitions the session to `ended` state and finalizes any in-flight
   * student responses. The underlying assignment document is NOT touched — use
   * `useQuizAssignments.deactivateAssignment(sessionId)` if you also want the
   * assignment's lifecycle state flipped to `inactive`.
   */
  endQuizSession: () => Promise<void>;
  /**
   * Remove a student from the live session roster by deleting their response
   * doc. `responseKey` is the Firestore doc key (e.g. `pin-{period}-{pin}`
   * for PIN auth, or the student's auth uid for studentRole auth) — NOT the
   * `studentUid` field inside the doc. Callers should pass the snapshot
   * doc.id they're iterating over.
   *
   * Deleting the doc also frees the attempt slot so the student can rejoin.
   */
  removeStudent: (responseKey: string) => Promise<void>;
  /**
   * Unlock a student's auto-submitted or attempt-limit-locked response so
   * they can resume. Preserves the existing `answers`, refunds one
   * `completedAttempts` on the response and the cross-launch ledger, and
   * sets `unlocked: true` + `unlockedAt` so the student's
   * visibility handler will finalize the attempt on the next tab-switch
   * without showing the "Warning N of 3" modal.
   */
  unlockStudentAttempt: (responseKey: string) => Promise<void>;
  /**
   * Unlock a student's results-view lockout (triggered when their
   * `resultsTabWarnings` count hit the session's `protection.tabWarningThreshold`
   * while viewing published results). Decrements `resultsTabWarnings` by 1
   * (floored at 0) and clears the `resultsLockedOut` flag + `resultsLockedOutAt`
   * timestamp. The decrement is intentional: one more tab-switch will re-lock
   * the student, giving zero grace warnings post-unlock.
   */
  unlockResultsForStudent: (responseKey: string) => Promise<void>;
  /** Reveal the correct answer for a question (writes to session doc) */
  revealAnswer: (questionId: string, correctAnswer: string) => Promise<void>;
  /** Hide a previously revealed answer (removes from session doc) */
  hideAnswer: (questionId: string) => Promise<void>;
}

/**
 * Subscribe to a specific quiz session document (keyed by assignment UUID).
 * Pass `undefined` or `null` when no assignment is currently selected — the
 * hook will return an empty state until a session id is supplied.
 */
export const useQuizSessionTeacher = (
  sessionId: string | undefined | null
): UseQuizSessionTeacherResult => {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(!!sessionId);
  const advancingRef = useRef(false);

  // Adjust state during render when sessionId changes — avoids state-in-effect
  // anti-pattern while still clearing stale data when the selection changes.
  const [prevSessionId, setPrevSessionId] = useState(sessionId);
  if (sessionId !== prevSessionId) {
    setPrevSessionId(sessionId);
    setSession(null);
    setResponses([]);
    setLoading(!!sessionId);
  }

  useEffect(() => {
    if (!sessionId) return;
    const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, sessionId);
    return onSnapshot(
      sessionRef,
      (snap) => {
        setSession(snap.exists() ? (snap.data() as QuizSession) : null);
        setLoading(false);
      },
      (err) => {
        const code = (err as { code?: string }).code;
        const path = `${QUIZ_SESSIONS_COLLECTION}/${sessionId}`;
        console.error(
          `[useQuizSessionTeacher] session listener error at ${path} (code=${code ?? 'unknown'}):`,
          err
        );
        setLoading(false);
      }
    );
  }, [sessionId]);

  const hasSession = !!session;
  useEffect(() => {
    // Keep the listener active even after the session ends so that any
    // late student submissions still appear in the live monitor / results.
    if (!sessionId || !hasSession) return;
    const responsesRef = collection(
      db,
      QUIZ_SESSIONS_COLLECTION,
      sessionId,
      RESPONSES_COLLECTION
    );
    return onSnapshot(
      responsesRef,
      (snap) => {
        // Carry the doc id through as `_responseKey` so the live monitor
        // can remove/delete by the actual Firestore key rather than the
        // `studentUid` field, which may differ for PIN-authed joiners.
        const list = snap.docs.map(
          (d) =>
            ({
              ...(d.data() as QuizResponse),
              _responseKey: d.id,
            }) as QuizResponse
        );
        setResponses(list);
      },
      (err) => {
        const code = (err as { code?: string }).code;
        const path = `${QUIZ_SESSIONS_COLLECTION}/${sessionId}/${RESPONSES_COLLECTION}`;
        console.error(
          `[useQuizSessionTeacher] responses listener error at ${path} (code=${code ?? 'unknown'}):`,
          err
        );
      }
    );
  }, [sessionId, hasSession]);

  const finalizeAllResponses = useCallback(async () => {
    if (!sessionId) return;
    const responsesRef = collection(
      db,
      QUIZ_SESSIONS_COLLECTION,
      sessionId,
      RESPONSES_COLLECTION
    );
    const snap = await getDocs(responsesRef);
    const batch = writeBatch(db);
    let count = 0;
    snap.docs.forEach((d) => {
      const data = d.data() as QuizResponse;
      if (data.status === 'in-progress' || data.status === 'joined') {
        // Bump `completedAttempts` so the join-side cap check sees this
        // forced finalize as a real completed attempt. Without the bump,
        // the doc lands at `status: 'completed', completedAttempts: 0`
        // and a later rejoin's `completed >= limit` check reads 0,
        // letting the student through under the cap.
        batch.update(d.ref, {
          status: 'completed',
          submittedAt: Date.now(),
          completedAttempts: increment(1),
        });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
  }, [sessionId]);

  const removeStudent = useCallback(
    async (responseKey: string) => {
      if (!sessionId) return;
      // Auth must be present before we open the batch — the archive
      // create rule requires `archivedBy == request.auth.uid`, so a
      // mid-token-refresh null would cause the entire batch (including
      // the delete) to roll back. Bail early with a clear error
      // instead.
      const writerUid = auth.currentUser?.uid;
      if (!writerUid) {
        throw new Error(
          'You must be signed in to remove a student. Try refreshing the page.'
        );
      }
      // Look up the response in the snapshot-driven `responses` list to
      // recover the studentUid + quizId we need for the ledger reset
      // (Phase 2). If the snapshot listener hasn't propagated yet
      // (teacher just opened the monitor), fall back to a direct
      // `getDoc` so we still produce an archive — silently skipping
      // the archive would defeat the data-preservation contract.
      let target = responses.find(
        (r) => (r._responseKey ?? r.studentUid) === responseKey
      );
      const responseRef = doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        responseKey
      );
      if (!target) {
        // Best-effort fetch when the snapshot listener hasn't yet
        // surfaced the response (rare race after a fresh mount). We
        // need this to satisfy the archive contract for partial work.
        try {
          const fallbackSnap = await getDoc(responseRef);
          if (fallbackSnap?.exists?.()) {
            target = {
              ...(fallbackSnap.data() as QuizResponse),
              _responseKey: fallbackSnap.id,
            };
          }
          // If the doc legitimately doesn't exist (already removed),
          // fall through to a no-op delete — preserves the pre-fix
          // delete-only semantics for this case.
        } catch (err) {
          // Don't silently swallow permission/transport errors — they
          // mean the archive write will ALSO fail (same auth/network),
          // so proceeding with the delete-only batch silently destroys
          // the student's partial work. Log + rethrow so the caller
          // toasts the error and the teacher can retry, rather than
          // discovering later that the archive doesn't exist.
          console.error(
            '[useQuizSession] removeStudent fallback getDoc failed; aborting to preserve archive contract',
            err
          );
          throw err;
        }
      }

      const ledgerRef =
        target && session?.quizId
          ? doc(
              db,
              QUIZ_ATTEMPT_LEDGER_COLLECTION,
              quizLedgerKey(session.quizId, target.studentUid)
            )
          : null;

      // Clean up the answer-history subcollection BEFORE deleting the
      // parent response. Firestore does not cascade subcollection
      // deletes, so without this the snapshots orphan — and because the
      // response key is deterministic (`auth.uid` for SSO, `pin-…` for
      // anonymous), a removed student who rejoins lands on the same key
      // and the history read rule (`request.auth.uid == parentStudentUid`)
      // would let them read their own prior-attempt drafts. The teacher's
      // archive preserves the final answers; the intermediate-draft
      // history is intentionally discarded on removal. Chunked at 450 to
      // stay under the 500-op Firestore batch limit; these are independent
      // of the atomic archive+delete batch below, so a partial failure
      // just leaves a smaller orphan tail that a retry sweeps.
      const historyDocs = (
        await getDocs(
          collection(
            db,
            QUIZ_SESSIONS_COLLECTION,
            sessionId,
            RESPONSES_COLLECTION,
            responseKey,
            RESPONSE_HISTORY_COLLECTION
          )
        )
      ).docs;
      const HISTORY_DELETE_CHUNK = 450;
      for (let i = 0; i < historyDocs.length; i += HISTORY_DELETE_CHUNK) {
        const historyBatch = writeBatch(db);
        for (const d of historyDocs.slice(i, i + HISTORY_DELETE_CHUNK)) {
          historyBatch.delete(d.ref);
        }
        await historyBatch.commit();
      }

      // Archive the response before delete so partial answers survive
      // the teacher's "remove" action. The deterministic key model
      // means we can't soft-delete in place (the slot must be free for
      // a fresh rejoin), so we stash a copy under `archived_responses`
      // and then delete the live doc + ledger atomically. If `target`
      // is still missing after the fallback fetch (doc already gone),
      // skip the archive — there's nothing left to preserve.
      const batch = writeBatch(db);
      if (target) {
        // Suffix the archive doc id with `archivedAt` so a student who
        // rejoins (same deterministic responseKey) and is removed again
        // doesn't collide with the prior archive. The archive rule only
        // allows create — a colliding `set()` would be evaluated as
        // update and rejected, breaking the entire removeStudent
        // batch. Querying by `originalResponseKey` (a field on the
        // archive doc) or by `archived_responses` collection-group +
        // path filter recovers per-student history.
        const archivedAt = Date.now();
        const archiveRef = doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionId,
          ARCHIVED_RESPONSES_COLLECTION,
          `${responseKey}__${archivedAt}`
        );
        // Strip the listener-only `_responseKey` tag before writing so
        // the archive matches the original Firestore schema.
        const { _responseKey: _, ...archivePayload } = target;
        batch.set(archiveRef, {
          ...archivePayload,
          archivedAt,
          archivedBy: writerUid,
          archiveReason: 'teacher-removed',
          originalResponseKey: responseKey,
        });
      }
      batch.delete(responseRef);
      if (ledgerRef) batch.delete(ledgerRef);
      await batch.commit();
    },
    [sessionId, responses, session?.quizId]
  );

  const unlockStudentAttempt = useCallback(
    async (responseKey: string) => {
      if (!sessionId) {
        throw new Error('No active session — cannot unlock.');
      }
      const target = responses.find(
        (r) => (r._responseKey ?? r.studentUid) === responseKey
      );
      if (!target) {
        // Snapshot races: the row was already removed by the time the
        // teacher clicked. Surface as an error so the monitor can
        // toast — silent success would be misleading.
        throw new Error(
          'Student response not found — they may have already been removed or rejoined.'
        );
      }
      const responseRef = doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        responseKey
      );
      const ledgerRef = session?.quizId
        ? doc(
            db,
            QUIZ_ATTEMPT_LEDGER_COLLECTION,
            quizLedgerKey(session.quizId, target.studentUid)
          )
        : null;
      const currentAttempts = target.completedAttempts ?? 0;
      const refundedAttempts = Math.max(0, currentAttempts - 1);

      // Probe the ledger BEFORE the batch so we don't blindly create a
      // partial doc via `set(merge:true)` on a missing ledger entry
      // (which would land without the required identity fields and
      // fail the create rule anyway). PIN-keyed anonymous students
      // never write a ledger entry, so this is a no-op for them.
      const ledgerSnap = ledgerRef ? await getDoc(ledgerRef) : null;

      const batch = writeBatch(db);
      batch.update(responseRef, {
        status: 'in-progress',
        submittedAt: null,
        score: null,
        completedAttempts: refundedAttempts,
        unlocked: true,
        unlockedAt: Date.now(),
        // Refresh lastWriteAt so the idle auto-submit Cloud Function
        // doesn't immediately re-finalize this freshly-unlocked attempt
        // on its next sweep. Without this, an unlock done >90 min after
        // the original submit would be silently undone within the hour.
        lastWriteAt: serverTimestamp(),
      });
      if (ledgerRef && ledgerSnap?.exists()) {
        const ledgerCurrent =
          (ledgerSnap.data() as QuizAttemptLedger | undefined)
            ?.completedAttempts ?? 0;
        batch.update(ledgerRef, {
          completedAttempts: Math.max(0, ledgerCurrent - 1),
        });
      }
      await batch.commit();
    },
    [sessionId, responses, session?.quizId]
  );

  const unlockResultsForStudent = useCallback(
    async (responseKey: string) => {
      if (!sessionId) {
        throw new Error('No active session — cannot unlock results.');
      }
      const responseRef = doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        responseKey
      );
      const snap = await getDoc(responseRef);
      if (!snap.exists()) {
        throw new Error(
          'Student response not found — they may have already been removed or rejoined.'
        );
      }
      const data = snap.data() as Partial<QuizResponse> | undefined;
      const prev = data?.resultsTabWarnings ?? 0;
      // Decrement by 1, floored at 0. One more tab-switch re-locks them
      // (zero grace warnings post-unlock — intentional).
      //
      // Read-modify-write race: if the student's hook fires `increment(1)`
      // between our `getDoc` and `updateDoc` (a ~100ms window), the student's
      // increment is silently lost. Accepted intentionally — the collision is
      // rare, the stakes are low (one extra warning at most), and the lockout
      // will re-fire on the very next event anyway since `currentWarnings + 1
      // >= threshold` still holds.
      await updateDoc(responseRef, {
        resultsTabWarnings: Math.max(0, prev - 1),
        resultsLockedOut: false,
        resultsLockedOutAt: deleteField(),
      });
    },
    [sessionId]
  );

  const revealAnswer = useCallback(
    async (questionId: string, correctAnswer: string) => {
      if (!sessionId) return;
      const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, sessionId);
      await updateDoc(sessionRef, {
        [`revealedAnswers.${questionId}`]: correctAnswer,
      });
    },
    [sessionId]
  );

  const hideAnswer = useCallback(
    async (questionId: string) => {
      if (!sessionId) return;
      const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, sessionId);
      await updateDoc(sessionRef, {
        [`revealedAnswers.${questionId}`]: deleteField(),
      });
    },
    [sessionId]
  );

  const advanceQuestion = useCallback(async () => {
    if (!sessionId || !session) return;
    const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, sessionId);

    const isReviewing = session.questionPhase === 'reviewing';

    // If podium is enabled and we're not already reviewing, enter review phase first.
    // Skip review phase for student-paced mode (students control their own flow).
    if (
      !isReviewing &&
      session.showPodiumBetweenQuestions &&
      session.sessionMode !== 'student' &&
      session.status === 'active'
    ) {
      await updateDoc(sessionRef, {
        questionPhase: 'reviewing',
        autoProgressAt: null,
      });
      return;
    }

    // Actually advance to next question
    const nextIndex = session.currentQuestionIndex + 1;

    if (nextIndex >= session.totalQuestions) {
      await updateDoc(sessionRef, {
        status: 'ended' as QuizSessionStatus,
        currentQuestionIndex: session.totalQuestions,
        endedAt: Date.now(),
        autoProgressAt: null,
        questionPhase: deleteField(),
      });
      await finalizeAllResponses();
      return;
    }
    await updateDoc(sessionRef, {
      status: 'active' as QuizSessionStatus,
      currentQuestionIndex: nextIndex,
      autoProgressAt: null,
      questionPhase: 'answering',
      ...(session.startedAt === null ? { startedAt: Date.now() } : {}),
    });
  }, [sessionId, session, finalizeAllResponses]);

  const endQuizSession = useCallback(async () => {
    if (!sessionId) return;

    // 1. End the session
    await updateDoc(doc(db, QUIZ_SESSIONS_COLLECTION, sessionId), {
      status: 'ended' as QuizSessionStatus,
      endedAt: Date.now(),
      autoProgressAt: null,
    });

    // 2. Mark all active students as completed so their data is preserved in results
    await finalizeAllResponses();
  }, [sessionId, finalizeAllResponses]);

  // ─── Auto-progress logic ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !session || session.sessionMode !== 'auto') return;
    if (session.status !== 'active') return;

    const currentQId =
      session.publicQuestions[session.currentQuestionIndex]?.id;
    if (!currentQId) return;

    // Check if everyone has answered (only if there are students)
    const activeResponses = responses.filter((r) => r.status !== 'joined');
    const everyoneAnswered =
      activeResponses.length > 0 &&
      activeResponses.every((r) =>
        r.answers.some((a) => a.questionId === currentQId)
      );

    if (
      everyoneAnswered &&
      !session.autoProgressAt &&
      session.questionPhase !== 'reviewing'
    ) {
      // All students answered: if podium is enabled, enter review first, then auto-advance
      const shouldReview = session.showPodiumBetweenQuestions;
      const advanceAt = Date.now() + 5000;
      const updates: Record<string, unknown> = {
        autoProgressAt: advanceAt,
      };
      if (shouldReview) {
        updates.questionPhase = 'reviewing';
      }
      updateDoc(doc(db, QUIZ_SESSIONS_COLLECTION, sessionId), updates).catch(
        (err) => console.error('[AutoProgress] update failed:', err)
      );
    }
  }, [responses, session, sessionId]);

  // Handle the actual auto-advance when the timestamp is reached
  useEffect(() => {
    if (!sessionId || !session?.autoProgressAt) return;

    const timer = setInterval(() => {
      if (Date.now() >= (session.autoProgressAt ?? 0)) {
        clearInterval(timer);
        if (advancingRef.current) return;
        advancingRef.current = true;
        advanceQuestion()
          .catch((err) => console.error('[AutoProgress] advance failed:', err))
          .finally(() => {
            advancingRef.current = false;
          });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [session?.autoProgressAt, sessionId, advanceQuestion]);

  return {
    session,
    responses,
    loading,
    advanceQuestion,
    endQuizSession,
    removeStudent,
    unlockStudentAttempt,
    unlockResultsForStudent,
    revealAnswer,
    hideAnswer,
  };
};

// ─── Student hook ─────────────────────────────────────────────────────────────

export interface UseQuizSessionStudentResult {
  session: QuizSession | null;
  myResponse: QuizResponse | null;
  loading: boolean;
  error: string | null;
  /**
   * Ref holding the active session id (the Firestore doc ID under
   * `/quiz_sessions/{sessionId}`). Historically named `teacherUidRef` back
   * when sessions were keyed by the teacher's uid.
   */
  sessionIdRef: MutableRefObject<string | null>;
  /**
   * Look up a session by join code without actually joining.
   * Returns the session's periodNames so the UI can show a period picker
   * before the student commits to joining.
   */
  lookupSession: (code: string) => Promise<{ periodNames: string[] } | null>;
  /**
   * Join a quiz session.
   *
   * `pin` is required for anonymous joiners (the original `/quiz?code=…` and
   * `/join` flows) and omitted for SSO `studentRole` joiners launched from
   * `/my-assignments` — their identity is the auth uid carried on the
   * custom token, so no roster PIN is needed. The hook validates this at
   * call time: anonymous + missing pin throws "PIN is required".
   */
  joinQuizSession: (
    code: string,
    pin?: string,
    classPeriod?: string
  ) => Promise<string>;
  /**
   * Subscribe to an already-ended session for a read-only review of the
   * student's previous submission. Used by the `/my-assignments` Completed
   * list when the teacher has published scores via the archive's "Publish
   * Scores" action.
   *
   * Unlike `joinQuizSession`, this never creates or mutates a response
   * doc — it just resolves the session by code, picks the most recent
   * matching doc (preferring published-score sessions over plain ended
   * ones), and wires up the snapshot listeners so `session` and
   * `myResponse` flow through to the consumer.
   *
   * Only meaningful for non-anonymous (SSO `studentRole`) callers because
   * the response doc is keyed by `auth.uid` for them; anonymous PIN
   * joiners would still need the PIN to compute their response key, so
   * that path is rejected.
   *
   * Throws when no session matches, when the caller is anonymous, or
   * when no response doc exists under the resolved key (e.g., the
   * student never submitted before the session ended).
   */
  subscribeForReview: (code: string) => Promise<void>;
  submitAnswer: (
    questionId: string,
    answer: string,
    speedBonus?: number,
    opts?: { isDraft?: boolean }
  ) => Promise<void>;
  completeQuiz: () => Promise<void>;
  /**
   * Increments the tab switch warning count for the student in Firestore.
   * Returns the updated count.
   */
  reportTabSwitch: () => Promise<number>;
  warningCount: number;
}

export const useQuizSessionStudent = (): UseQuizSessionStudentResult => {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [myResponse, setMyResponse] = useState<QuizResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // The Firestore doc key under /responses. For studentRole auth this equals
  // the auth uid; for PIN/anonymous auth it is derived from pin+classPeriod
  // (see computeResponseKey) so an attempt limit survives device/storage
  // resets. Historically named `studentUidRef`.
  const responseKeyRef = useRef<string | null>(null);
  // Snapshotted at join time for use by `completeQuiz` (writes the ledger
  // entry inside the same transaction as the response status flip).
  // Without these refs, completeQuiz would have to re-read the session doc
  // mid-transaction just to get the quiz/teacher ids — which is correct
  // but adds a per-submit round-trip.
  const quizIdRef = useRef<string | null>(null);
  const teacherUidRef = useRef<string | null>(null);
  // Snapshot the join-time anonymity flag so `completeQuiz` can decide
  // whether to write the cross-launch ledger using the value from the
  // moment the student joined — not whatever `auth.currentUser` reports
  // at submit time. Without this, a custom-token expiry mid-session that
  // silently dropped the user back to anonymous (the SDK refresh path)
  // would skip the ledger write even though the student joined as a
  // bridged SSO user. `null` means "not yet joined".
  const isAnonymousRef = useRef<boolean | null>(null);
  // Keep a ref to current answers to avoid stale closure issues
  const myResponseRef = useRef<QuizResponse | null>(null);
  myResponseRef.current = myResponse;

  // Per-questionId timestamp of the most recent history snapshot write.
  // Used to throttle snapshots — see HISTORY_SNAPSHOT_THROTTLE_MS.
  const lastHistorySnapshotAtRef = useRef<Map<string, number>>(new Map());

  // Optimistic local counter state to ensure UI updates immediately.
  // warningCountRef mirrors the state so reportTabSwitch can return the
  // updated value synchronously (React functional updaters run on the next
  // render, not immediately, so reading newCount from the setter is always 0).
  const [warningCount, setWarningCount] = useState(0);
  const warningCountRef = useRef(0);

  // Sync optimistic state with server truth, but never decrement locally
  useEffect(() => {
    if (myResponse?.tabSwitchWarnings !== undefined) {
      const serverCount = myResponse.tabSwitchWarnings ?? 0;
      const next = Math.max(warningCountRef.current, serverCount);
      warningCountRef.current = next;
      setWarningCount(next);
    }
  }, [myResponse?.tabSwitchWarnings]);

  // Session listener — only subscribes once sessionId is known
  const [sessionIdState, setSessionIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionIdState) return;
    return onSnapshot(
      doc(db, QUIZ_SESSIONS_COLLECTION, sessionIdState),
      (snap) => {
        setSession(snap.exists() ? (snap.data() as QuizSession) : null);
        setError(null);
      },
      (err) => {
        // Without an onError callback, a permission-denied or transport
        // failure here causes the session listener to silently stop and
        // the student stares at a frozen screen. Surface it so the join
        // flow can show "Couldn't connect to the quiz" instead of
        // hanging.
        const code = (err as { code?: string }).code;
        const path = `${QUIZ_SESSIONS_COLLECTION}/${sessionIdState}`;
        console.error(
          `[useQuizSessionStudent] session listener error at ${path} (code=${code ?? 'unknown'}):`,
          err
        );
        setError(
          code === 'permission-denied'
            ? "You don't have access to this quiz session."
            : 'Lost connection to the quiz. Please refresh.'
        );
      }
    );
  }, [sessionIdState]);

  // My response listener — subscribed on the deterministic response-doc key
  // (not necessarily equal to auth.uid for anonymous PIN users).
  const [responseKeyState, setResponseKeyState] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionIdState || !responseKeyState) return;
    return onSnapshot(
      doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionIdState,
        RESPONSES_COLLECTION,
        responseKeyState
      ),
      (snap) => {
        setMyResponse(
          snap.exists()
            ? { ...(snap.data() as QuizResponse), _responseKey: snap.id }
            : null
        );
        // Mirror the session-listener pattern at L630 — clear any
        // stale error from a transient transport blip so the UI
        // doesn't stay stuck on "Lost connection" once the snapshot
        // recovers.
        setError(null);
      },
      (err) => {
        // Same rationale as the session listener above — without this
        // callback a permission-denied silently freezes the student's
        // submit-and-see-feedback loop.
        const code = (err as { code?: string }).code;
        const path = `${QUIZ_SESSIONS_COLLECTION}/${sessionIdState}/${RESPONSES_COLLECTION}/${responseKeyState}`;
        console.error(
          `[useQuizSessionStudent] response listener error at ${path} (code=${code ?? 'unknown'}):`,
          err
        );
        setError(
          code === 'permission-denied'
            ? 'Lost permission to read your answers. Ask your teacher.'
            : 'Lost connection to the quiz. Please refresh.'
        );
      }
    );
  }, [sessionIdState, responseKeyState]);

  const lookupSession = useCallback(
    async (code: string): Promise<{ periodNames: string[] } | null> => {
      // Populate the hook's `error` state on failure so callers' .catch
      // handlers (which only console.warn) still produce visible UI feedback.
      // Without this a network/Firestore failure during code lookup silently
      // strands the student on the join form with no spinner and no error.
      try {
        const normCode = code
          .trim()
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase();
        if (!normCode) return null;
        setError(null);
        const snap = await getDocs(
          query(
            collection(db, QUIZ_SESSIONS_COLLECTION),
            where('code', '==', normCode)
          )
        );
        if (snap.empty) return null;
        const joinable = snap.docs.filter((d) => {
          const s = (d.data() as QuizSession).status;
          return s === 'waiting' || s === 'active' || s === 'paused';
        });
        if (joinable.length === 0) return null;
        // Match joinQuizSession's selection: prefer the most recently created.
        joinable.sort((a, b) => {
          const at = (a.data() as QuizSession).startedAt ?? 0;
          const bt = (b.data() as QuizSession).startedAt ?? 0;
          return bt - at;
        });
        const sessionData = joinable[0].data() as QuizSession;
        // resolvePeriodNames normalises legacy periodName + new periodNames
        // into a typed string[], avoiding the `any[]` from Firestore's
        // DocumentData bleed-through.
        return { periodNames: resolvePeriodNames(sessionData) };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not look up quiz. Please check the code and try again.';
        setError(msg);
        throw err;
      }
    },
    []
  );

  const joinQuizSession = useCallback(
    async (
      code: string,
      pin?: string,
      classPeriod?: string
    ): Promise<string> => {
      setLoading(true);
      setError(null);
      // Clear per-question history throttle on every join. The same hook
      // instance survives a teacher unlock / attempt-cap rejoin, so a
      // stale `lastSnapshotAt` from the prior attempt would suppress
      // legitimate snapshots in the new one.
      lastHistorySnapshotAtRef.current.clear();
      try {
        const normCode = code
          .trim()
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase();
        if (!normCode) throw new Error('Invalid code');

        // Ensure we have an anonymous Firebase Auth session so Firestore
        // security rules (request.auth != null) are satisfied. SSO students
        // arriving from /my-assignments already have a non-anonymous custom-
        // token user — keep that identity.
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        // `let` because the Phase 3 PIN→SSO bridge below may swap the
        // signed-in user via `signInWithCustomToken`, after which we
        // re-bind `studentUid` / `isAnonymous` to the new identity.
        let currentUser = auth.currentUser;
        if (!currentUser)
          throw new Error('Anonymous auth failed — no current user.');
        let studentUid = currentUser.uid;
        let isAnonymous = currentUser.isAnonymous;

        // Contract: PIN is required iff the caller is an anonymous Firebase
        // user. Anonymous joiners arrived via the public `/join` /
        // `/quiz?code=…` URL with no other identity, so the PIN is what
        // ties them to a roster row. Non-anonymous joiners (SSO
        // `studentRole` from `/my-assignments`, plus dev auth-bypass) carry
        // a stable uid in `auth.uid` — `computeResponseKey` keys their
        // response doc by that uid, and Firestore rules are the source of
        // truth for whether the uid is actually allowed to write.
        const sanitizedPin = (pin ?? '').trim().substring(0, 10);
        if (isAnonymous && !sanitizedPin) {
          throw new Error('PIN is required');
        }

        const snap = await getDocs(
          query(
            collection(db, QUIZ_SESSIONS_COLLECTION),
            where('code', '==', normCode)
          )
        ).catch((err: unknown) =>
          logQuizJoinFirestoreError('lookup-sessions', err, {
            codeNorm: normCode,
            studentUid,
            isAnonymous,
          })
        );
        if (snap.empty) throw new Error('No active quiz found with that code.');

        // A code can transiently appear on more than one doc — e.g. an old
        // ended session plus a new live one with a recycled code. Filter
        // client-side to the docs that are still accepting joins (waiting /
        // active / paused) before picking one, otherwise docs[0] may be the
        // stale ended session and students get rejected despite a live
        // session existing.
        const joinable = snap.docs.filter((d) => {
          const s = (d.data() as QuizSession).status;
          return s === 'waiting' || s === 'active' || s === 'paused';
        });
        if (joinable.length === 0) {
          throw new SessionEndedError();
        }
        // Prefer the most recently created joinable doc.
        joinable.sort((a, b) => {
          const at = (a.data() as QuizSession).startedAt ?? 0;
          const bt = (b.data() as QuizSession).startedAt ?? 0;
          return bt - at;
        });
        const sessionDoc = joinable[0];
        const sessionData = sessionDoc.data() as QuizSession;

        // Phase 3 — PIN→SSO identity bridge. When an anonymous PIN
        // joiner lands on a rostered session (the typical case for
        // ClassLink schools), try to upgrade them to a custom-token
        // sign-in whose uid matches what `studentLoginV1` would mint
        // for the same physical student over SSO. After this swap the
        // PIN-side and SSO-side response docs converge on the same key
        // and the per-session attempt cap holds across both auth paths.
        //
        // On any failure (no rosterIds on the session, no pin_index
        // entry, callable error) we silently fall through to the
        // legacy anonymous PIN flow. The legacy doc-key path
        // (pin-{period}-{pin}) still gives per-session enforcement and
        // the user-visible behavior matches today.
        const sessionHasRosters =
          Array.isArray(sessionData.rosterIds) &&
          sessionData.rosterIds.length > 0;
        if (isAnonymous && sanitizedPin && sessionHasRosters) {
          try {
            const callable = httpsCallable<
              {
                kind: 'quiz';
                code: string;
                pin: string;
                period?: string;
              },
              { matched: boolean; customToken?: string; reason?: string }
            >(functions, 'pinLoginV1');
            const callBridge = () =>
              callable({
                kind: 'quiz',
                code: normCode,
                pin: sanitizedPin,
                period: classPeriod,
              });
            // Retry once on transient errors (cold start, brief network
            // blip, function deploy mid-call). The lockout the user
            // reported on tab pop-out happens when the new tab's bridge
            // call fails with a transient error, falls through to the
            // anonymous flow, and then can't claim the existing response
            // doc keyed by the first tab's HMAC pseudonym. Retrying
            // here covers the common case without adding a second
            // user-visible failure mode.
            //
            // Non-retryable codes (not-found, invalid-argument,
            // permission-denied) are deterministic — re-running won't
            // change the answer, so we surface them on the first try.
            let res;
            try {
              res = await callBridge();
            } catch (err) {
              const code = getErrorCode(err);
              const transient =
                code === 'unavailable' ||
                code === 'deadline-exceeded' ||
                code === 'internal' ||
                code === 'aborted';
              if (!transient) throw err;
              console.warn(
                '[useQuizSession] pinLoginV1 bridge transient failure — retrying:',
                { code }
              );
              await new Promise((r) => setTimeout(r, 300));
              res = await callBridge();
            }
            if (res.data.matched && res.data.customToken) {
              await signInWithCustomToken(auth, res.data.customToken);
              const refreshed = auth.currentUser;
              if (refreshed) {
                currentUser = refreshed;
                studentUid = refreshed.uid;
                isAnonymous = refreshed.isAnonymous;
              }
            } else {
              // Bridge returned `matched: false` — log the reason so we
              // can correlate client-side rejoin lockouts with the
              // server-side fall-through cause (e.g. `no-index-entry`
              // = roster pin_index out of date). Without this the
              // anonymous fall-through is silent.
              console.warn('[useQuizSession] pinLoginV1 bridge no-match:', {
                reason: res.data.reason ?? 'unknown',
                hasRoster: sessionHasRosters,
                classPeriod,
              });
            }
          } catch (err) {
            // The bridge is best-effort by design — falling through to
            // the legacy anonymous PIN flow preserves PIN-only sessions
            // and rosters whose pin_index hasn't been built yet.
            // However we still want to LOUDLY surface unexpected
            // failures so a misconfigured production (rules typo,
            // function outage) doesn't silently re-open the duplicate-
            // doc bypass. `not-found` and `unavailable` are the
            // expected "fall through" codes; everything else gets
            // logged at error level so it shows up in monitoring.
            const code = getErrorCode(err);
            const expected = code === 'not-found' || code === 'unavailable';
            if (expected) {
              console.warn('[useQuizSession] pinLoginV1 bridge fell through:', {
                code,
                err,
              });
            } else {
              console.error(
                '[useQuizSession] pinLoginV1 bridge unexpected failure — falling back to anonymous PIN flow:',
                err
              );
            }
          }
        }

        // Deterministic doc key: stable per-roster-student for PIN auth so
        // the attempt limit can't be bypassed by clearing storage / switching
        // device. studentRole users still key by their auth uid (stable per
        // user already). The helper also handles the legacy-key fallback
        // for anonymous students rejoining pre-deterministic-keying sessions.
        const deterministicKey = computeResponseKey(
          studentUid,
          isAnonymous,
          sanitizedPin,
          classPeriod
        );
        const { key: responseKey, snap: existingSnap } =
          await findExistingResponseDoc(
            sessionDoc.id,
            studentUid,
            isAnonymous,
            deterministicKey
          );

        sessionIdRef.current = sessionDoc.id;
        responseKeyRef.current = responseKey;
        quizIdRef.current = sessionData.quizId ?? null;
        teacherUidRef.current = sessionData.teacherUid ?? null;
        // Stamp the join-time anonymity flag (post-bridge if the bridge
        // succeeded). `completeQuiz` reads this rather than re-querying
        // `auth.currentUser` so a token refresh between join and submit
        // can't silently invert the ledger-write decision.
        isAnonymousRef.current = isAnonymous;
        // Reset warning count before activating snapshot listeners so a
        // late-arriving snapshot from a previous session can't race with
        // the finally-block reset and leave the counter stuck at 0.
        warningCountRef.current = 0;
        setWarningCount(0);

        const responseRef = doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionDoc.id,
          RESPONSES_COLLECTION,
          responseKey
        );

        // Cross-launch attempt cap (Phase 2).
        //
        // Read the per-quiz ledger BEFORE the per-session cap check so a
        // student who already exhausted their attempts in an earlier
        // session of the same quiz is rejected here — the per-session
        // counter on `responseRef` is fresh on every launch and would
        // otherwise let them through. The ledger is only meaningful for
        // non-anonymous (SSO/studentRole) joiners today; anonymous PIN
        // joiners get a rotating uid, so their ledger doc churns and
        // never accumulates. Phase 3's `pinLoginV1` unifies PIN onto the
        // same uid space, at which point this same code automatically
        // covers PIN joiners.
        let ledgerCompleted = 0;
        if (
          !isAnonymous &&
          typeof sessionData.quizId === 'string' &&
          sessionData.quizId.length > 0
        ) {
          const ledgerRef = doc(
            db,
            QUIZ_ATTEMPT_LEDGER_COLLECTION,
            quizLedgerKey(sessionData.quizId, studentUid)
          );
          const ledgerSnap = await getDoc(ledgerRef).catch((err: unknown) => {
            // Ledger reads can fail with permission-denied for legacy
            // students whose ledger doc predates the rule changes; that
            // shouldn't block the join. Treat as "no ledger" and rely on
            // the per-session counter + the (post-deploy) write path to
            // populate the ledger forward.
            if (getErrorCode(err) === 'permission-denied') {
              console.warn(
                '[useQuizSession] permission-denied reading ledger; treating as 0',
                { quizId: sessionData.quizId, studentUid, err }
              );
              return null;
            }
            throw err;
          });
          if (ledgerSnap?.exists()) {
            const ledger = ledgerSnap.data() as QuizAttemptLedger;
            ledgerCompleted = ledger.completedAttempts ?? 0;
          }
        }

        // Attempt-limit enforcement.
        //   - `attemptLimit == null/undefined` means unlimited (legacy).
        //   - Limit is compared against the MAX of:
        //       a) per-session response `completedAttempts`
        //       b) per-quiz `ledgerCompleted` (Phase 2 cross-launch)
        //       c) 1, when the per-session response is `status === 'completed'`
        //          (legacy / finalize-zeroed docs)
        //   - If the student is under the limit, reset the completed doc to
        //     a fresh 'joined' state so the next join starts a new attempt,
        //     preserving `completedAttempts` (and the ledger entry) to
        //     enforce the cap on future submissions.
        const limit = sessionData.attemptLimit ?? null;
        if (existingSnap?.exists()) {
          const existing = existingSnap.data() as QuizResponse;
          if (existing.status === 'completed' && existing.unlocked) {
            // Teacher-unlocked: resume the existing attempt with the prior
            // `answers` intact. Unlock normally already flips status to
            // 'in-progress', so this branch is a safety net for races
            // where the student rejoins between unlock's listener emit
            // and Firestore propagation.
            await updateDoc(responseRef, {
              status: 'in-progress',
              submittedAt: null,
              score: null,
              // Refresh so idle auto-submit doesn't immediately
              // re-finalize the resumed attempt (lastWriteAt would
              // otherwise still point at the prior submit).
              lastWriteAt: serverTimestamp(),
              ...(classPeriod && existing.classPeriod !== classPeriod
                ? { classPeriod }
                : {}),
            }).catch((err: unknown) =>
              logQuizJoinFirestoreError('update-resume-unlocked', err, {
                sessionId: sessionDoc.id,
                responseKey,
                studentUid,
                existingStudentUid: existing.studentUid,
                isAnonymous,
                hasPin: !!sanitizedPin,
                hasClassPeriod: !!classPeriod,
              })
            );
          } else if (existing.status === 'completed') {
            const completed = Math.max(
              existing.completedAttempts ?? 0,
              ledgerCompleted,
              1
            );
            if (limit !== null && completed >= limit) {
              throw new AttemptLimitReachedError();
            }
            // Under the cap (or unlimited): reset for a new attempt.
            // `preSyncVersion: 0` resets the "pre-sync" stamp so the new
            // attempt is treated as fresh — without this, a response
            // tagged on the prior attempt (e.g. `preSyncVersion: 4`)
            // would carry that chip onto a fresh attempt taken against
            // post-sync content, AND the response would be invisible
            // to future `where('preSyncVersion', '==', 0)` queries.
            // The matching firestore rule below allows students to
            // write only `0` to this field; `syncAssignmentToLatest`
            // tags it later if/when another sync runs.
            await updateDoc(responseRef, {
              status: 'joined',
              answers: [],
              score: null,
              submittedAt: null,
              preSyncVersion: 0,
              // Refresh so the idle auto-submit cron doesn't destroy
              // the fresh attempt — without this, a rejoin >90 min
              // after the prior submit gets finalized on the next
              // sweep with zero answers.
              lastWriteAt: serverTimestamp(),
              ...(classPeriod && existing.classPeriod !== classPeriod
                ? { classPeriod }
                : {}),
            }).catch((err: unknown) =>
              logQuizJoinFirestoreError('update-reset-completed', err, {
                sessionId: sessionDoc.id,
                responseKey,
                studentUid,
                existingStudentUid: existing.studentUid,
                isAnonymous,
                hasPin: !!sanitizedPin,
                hasClassPeriod: !!classPeriod,
              })
            );
          } else if (classPeriod && existing.classPeriod !== classPeriod) {
            // Backfill classPeriod on an in-flight response (e.g. student
            // joined before periods were configured or reloaded after a
            // change). Treat this as activity — refresh lastWriteAt so
            // a long-running session doesn't trip the idle auto-submit
            // on the next sweep just because of a backfill touch.
            await updateDoc(responseRef, {
              classPeriod,
              lastWriteAt: serverTimestamp(),
            }).catch((err: unknown) =>
              logQuizJoinFirestoreError('update-backfill-period', err, {
                sessionId: sessionDoc.id,
                responseKey,
                studentUid,
                existingStudentUid: existing.studentUid,
                isAnonymous,
              })
            );
          }
        } else if (limit !== null && ledgerCompleted >= limit) {
          // No response doc yet for this session, but the cross-launch
          // ledger says the student is already at/past the cap. This is
          // the SSO student who took an earlier launch of the same quiz,
          // then opened the new launch from /my-assignments. Without
          // this branch, the existing fall-through would create a fresh
          // response for them and the per-session cap would let them
          // submit once more. The ledger is the only state that survives
          // the new launch, so we gate on it directly here.
          throw new AttemptLimitReachedError();
        }

        setSessionIdState(sessionDoc.id);
        setResponseKeyState(responseKey);

        // SSO class-id resolution. Anonymous PIN joiners arrive with a
        // `classPeriod` argument from the period picker — that path stays
        // unchanged. SSO joiners (custom-token `studentRole` users from
        // /my-assignments) skip the period picker, so we resolve their class
        // id by intersecting their `classIds` token claim with the session's
        // targeted `classIds`. The teacher-side results view turns that id
        // back into a period name via the roster, so the period filter and
        // shared-sheet "Class Period" column stay populated for SSO rows.
        // Falls back to undefined when:
        //   - the student is anonymous (no claim), or
        //   - claims.classIds is missing, malformed, or has no overlap with
        //     the session, or
        //   - the intersection has multiple matches (ambiguous — leave
        //     unset so the teacher can identify and fix the targeting).
        let resolvedClassId: string | undefined;
        // Period name resolved from `sessionData.classPeriodByClassId`. Lets
        // SSO students write `classPeriod` directly onto their response —
        // matching the snapshot-at-write-time semantics anonymous PIN
        // joiners already have, and removing the dependency on the
        // teacher-side roster lookup at results-render time. Stays
        // undefined for legacy sessions (map missing) and for malformed
        // map shapes (Firestore type drift); the teacher-side enrichment
        // in QuizResults remains as the legacy fallback.
        let resolvedPeriodName: string | undefined;
        if (!isAnonymous && !classPeriod) {
          try {
            const tokenResult = await currentUser.getIdTokenResult();
            const claimClassIds = tokenResult.claims?.classIds;
            if (Array.isArray(claimClassIds)) {
              const studentClaimSet = new Set(
                claimClassIds.filter(
                  (c): c is string => typeof c === 'string' && c.length > 0
                )
              );
              const sessionClassIds = Array.isArray(sessionData.classIds)
                ? sessionData.classIds.filter(
                    (c): c is string => typeof c === 'string' && c.length > 0
                  )
                : [];
              const matches = sessionClassIds.filter((c) =>
                studentClaimSet.has(c)
              );
              if (matches.length === 1) {
                resolvedClassId = matches[0];
                const periodFromSession =
                  sessionData.classPeriodByClassId?.[resolvedClassId];
                if (
                  typeof periodFromSession === 'string' &&
                  periodFromSession.length > 0
                ) {
                  resolvedPeriodName = periodFromSession;
                }
              }
            }
          } catch (claimErr) {
            // Token-claim lookup is best-effort. A failure here just means
            // the SSO student's row will lack a class period in the sheet
            // — the same as today's behavior — so we swallow rather than
            // block the join.
            console.warn(
              '[useQuizSession] Failed to read SSO classIds claim:',
              claimErr
            );
          }
        }

        if (!existingSnap?.exists()) {
          // No PII stored. `studentUid` field carries the auth uid; the doc
          // key may differ (for PIN auth it's pin-based), so Firestore rules
          // enforce ownership against the field, not the key. The `pin`
          // field is omitted entirely for SSO `studentRole` joiners — the
          // teacher's grading view resolves their name from `studentUid`
          // via `getPseudonymsForAssignmentV1`.
          // Anonymous picker arg wins over SSO snapshot when both exist
          // (defensive — the SSO branch above gates on `!classPeriod`, so
          // they shouldn't both be set in practice). Both paths land on
          // the same `classPeriod` field so all downstream surfaces (period
          // dropdown, export sheet) read uniformly.
          const finalClassPeriod = classPeriod ?? resolvedPeriodName;
          const newResponse: Omit<QuizResponse, 'lastWriteAt'> & {
            lastWriteAt: FieldValue;
          } = {
            studentUid,
            joinedAt: Date.now(),
            // Seed `lastWriteAt` at join so a student who joins but
            // never answers still ages into the idle auto-submit query.
            // Server-stamped (not Date.now()) so a Chromebook with a
            // skewed clock can't (a) seed a past timestamp and get
            // force-finalized on the next sweep, or (b) seed a future
            // timestamp to evade auto-submit indefinitely.
            lastWriteAt: serverTimestamp(),
            status: 'joined',
            answers: [],
            score: null,
            submittedAt: null,
            completedAttempts: 0,
            // Initialize `preSyncVersion: 0` on every response so
            // `syncAssignmentToLatest` can use a server-side
            // `where('preSyncVersion', '==', 0)` query to find
            // responses that still need tagging — Firestore equality
            // skips docs missing the field, so without this
            // initialization the optimization would silently drop the
            // very rows that need pre-sync tags. Fresh responses stay
            // at 0; the results UI renders the pre-sync chip only
            // when the value is > 0.
            preSyncVersion: 0,
            ...(sanitizedPin ? { pin: sanitizedPin } : {}),
            ...(finalClassPeriod ? { classPeriod: finalClassPeriod } : {}),
            ...(resolvedClassId ? { classId: resolvedClassId } : {}),
          };
          await setDoc(responseRef, newResponse).catch((err: unknown) =>
            logQuizJoinFirestoreError('create-response', err, {
              sessionId: sessionDoc.id,
              responseKey,
              studentUid,
              isAnonymous,
              hasPin: !!sanitizedPin,
              hasClassPeriod: !!finalClassPeriod,
              hasResolvedClassId: !!resolvedClassId,
              sessionClassIds: Array.isArray(sessionData.classIds)
                ? sessionData.classIds
                : undefined,
              sessionClassId: sessionData.classId,
              sessionTeacherUid: sessionData.teacherUid,
              sessionStatus: sessionData.status,
            })
          );
        } else if (resolvedPeriodName) {
          // Backfill classPeriod on an existing SSO response that joined
          // before this code shipped (or before the teacher retargeted),
          // so the period filter and sheet column self-heal on rejoin
          // without a separate migration.
          //
          // classId is intentionally NOT backfilled here: firestore.rules
          // restricts student `update` `changedKeys()` to an allowlist
          // (`answers, status, submittedAt, tabSwitchWarnings,
          // completedAttempts, classPeriod, score`) — see
          // `firestore.rules` quiz response rule. Including classId in
          // the patch would be denied wholesale and would also block the
          // classPeriod backfill. classId stays create-only; if the
          // legacy response is missing it, the teacher-side enrichment
          // in QuizResults can no longer use it as a fallback, but
          // classPeriod (now written here) supersedes that fallback for
          // every downstream surface.
          const existing = existingSnap.data() as QuizResponse;
          if (existing.classPeriod !== resolvedPeriodName) {
            await updateDoc(responseRef, {
              classPeriod: resolvedPeriodName,
              // Refresh — backfill is a rejoin action, the student is
              // active. See the in-flight backfill branch above for
              // the symmetric refresh.
              lastWriteAt: serverTimestamp(),
            }).catch((err: unknown) =>
              logQuizJoinFirestoreError('update-backfill-class-period', err, {
                sessionId: sessionDoc.id,
                responseKey,
                studentUid,
                existingClassId: existing.classId,
                existingClassPeriod: existing.classPeriod,
                resolvedClassId,
                resolvedPeriodName,
                isAnonymous,
              })
            );
          }
        }

        setSession(sessionData);
        return sessionDoc.id;
      } catch (err) {
        // Translate Firestore `permission-denied` into a student-friendly
        // message. The raw FirebaseError says "Missing or insufficient
        // permissions" which reads to a student like the page is broken
        // rather than "you can't do this" — so the click feels silent.
        //
        // Anonymous joiners hit permission-denied in one realistic shape:
        // the deterministic-key collision path where another anon UID
        // already wrote a response at the same `pin-{period}-{pin}` key.
        // The class gate doesn't apply to anon (anon tokens lack the
        // studentRole claim, so passesStudentClassGate short-circuits to
        // true), so this is the only common cause.
        //
        // Non-anonymous joiners (custom-token studentRole users from
        // /my-assignments) hit permission-denied when the session targets
        // a class their `classIds` claim doesn't include — the response
        // create rule's class gate denies. Surface that as an enrollment
        // hint so the student knows to ping the teacher rather than think
        // the link is broken.
        //
        // Other failures (network, code-not-found, attempt-limit) keep
        // their existing messages — `AttemptLimitReachedError` already
        // ships a friendly "ask your teacher" message of its own.
        let msg: string;
        if (
          getErrorCode(err) === 'permission-denied' &&
          auth.currentUser?.isAnonymous
        ) {
          // Distinguish the "popped out into a new tab" case from a
          // genuine PIN collision. Both look the same from Firestore's
          // perspective (existing doc's studentUid ≠ ours), so we steer
          // the student toward closing duplicate tabs first — that's the
          // common case after our pinLoginV1 retry hardening above — and
          // only escalate to "ask your teacher" if the student is sure
          // they're not still open elsewhere.
          msg =
            "It looks like you're already in this quiz on another tab or device. Close any other tabs you have this quiz open in and try again. If you're still stuck, ask your teacher to release your attempt.";
        } else if (getErrorCode(err) === 'permission-denied') {
          msg =
            "You can't join this quiz. Ask your teacher to make sure you're enrolled in the right class.";
        } else if (err instanceof Error) {
          msg = err.message;
        } else {
          msg = 'Failed to join quiz';
        }
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const submitAnswer = useCallback(
    async (
      questionId: string,
      answer: string,
      speedBonus?: number,
      opts?: { isDraft?: boolean }
    ) => {
      const sessionId = sessionIdRef.current;
      const responseKey = responseKeyRef.current;
      if (!sessionId || !responseKey) return;

      // isCorrect is intentionally not written by the student to prevent
      // client-side forgery. It is computed by the teacher's results view
      // using gradeAnswer() against the full quiz data loaded from Drive.
      //
      // `status` distinguishes a debounced autosave draft (written-response
      // only) from an explicit submit. The student's `alreadyAnswered` gate
      // checks for `'submitted'` so a draft autosave doesn't masquerade as
      // a final answer and prematurely fire the completion card.
      const existingAnswers = myResponseRef.current?.answers ?? [];
      const priorEntry = existingAnswers.find(
        (a) => a.questionId === questionId
      );

      // #1 guard — see `isUnsafeBlankDraft` doc. Refuses a draft autosave
      // that would silently clobber a non-empty saved answer with ''.
      if (isUnsafeBlankDraft(answer, opts?.isDraft === true, priorEntry)) {
        return;
      }
      // Status-downgrade guard — see `isUnsafeStatusDowngrade` doc.
      // Stops the back-nav listener-lag race from silently flipping a
      // 'submitted' answer back to 'draft' status.
      if (isUnsafeStatusDowngrade(opts?.isDraft === true, priorEntry)) {
        return;
      }

      const newAnswer: QuizResponseAnswer = {
        questionId,
        answer,
        answeredAt: Date.now(),
        status: opts?.isDraft ? 'draft' : 'submitted',
        ...(speedBonus != null && speedBonus > 0
          ? { speedBonus: Math.min(50, Math.max(0, speedBonus)) }
          : {}),
      };

      const updated = [
        ...existingAnswers.filter((a) => a.questionId !== questionId),
        newAnswer,
      ];

      // Don't downgrade a finalized response: if `completeQuiz` already
      // flipped the doc to `'completed'`, a late autosave/draft write
      // arriving here (visibility-hidden flush, beforeunload, retry on
      // a quiz the student already finished) must not revert to
      // `'in-progress'`. Treats client-side `myResponseRef` as the
      // freshest signal; it's updated by the `onSnapshot` listener so
      // it reflects the post-completeQuiz state in the same tab.
      const nextStatus =
        myResponseRef.current?.status === 'completed'
          ? 'completed'
          : 'in-progress';

      await updateDoc(
        doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_COLLECTION,
          responseKey
        ),
        // `lastWriteAt` is the idle-auto-submit Cloud Function's cutoff
        // field: any joined/in-progress response whose `lastWriteAt` is
        // older than the assignment's idle threshold gets finalized
        // automatically. Stamped on every answer write (draft or
        // submitted) — tab-switch warnings deliberately do NOT update
        // it, so a student who toggles tabs without answering still
        // ages out as expected. Server-stamped so client clock skew
        // can't trigger spurious auto-submit or evade it.
        {
          status: nextStatus,
          answers: updated,
          lastWriteAt: serverTimestamp(),
        }
      );

      // #5 history — see `shouldSnapshotHistory` doc. Fire-and-forget
      // safety net so a value that turns out to be a regression (stray
      // blank draft that the #1 guard didn't catch, or a student
      // retyping after a lockout) can still be recovered.
      const now = Date.now();
      const lastAt = lastHistorySnapshotAtRef.current.get(questionId) ?? 0;
      if (
        shouldSnapshotHistory(
          priorEntry,
          answer,
          opts?.isDraft === true,
          lastAt,
          now
        ) &&
        priorEntry
      ) {
        void addDoc(
          collection(
            db,
            QUIZ_SESSIONS_COLLECTION,
            sessionId,
            RESPONSES_COLLECTION,
            responseKey,
            RESPONSE_HISTORY_COLLECTION
          ),
          {
            questionId: priorEntry.questionId,
            answer: priorEntry.answer,
            answeredAt: priorEntry.answeredAt,
            // Narrow explicitly rather than `?? 'submitted'`: the rule
            // pins `status in ['draft','submitted']`, so any future
            // schema value would silently fail every history write.
            status: priorEntry.status === 'draft' ? 'draft' : 'submitted',
            snapshotAt: serverTimestamp(),
          }
        )
          .then(() => {
            // Only consume the throttle slot for snapshots that actually
            // landed. A failed write (offline, rule denial, quota) used
            // to bump `now` regardless, suppressing the next legitimate
            // snapshot for the throttle window even though no recovery
            // doc had been written.
            lastHistorySnapshotAtRef.current.set(questionId, now);
          })
          .catch((err: unknown) => {
            // Safety-net write — recovery still works without it, so we
            // don't surface to the student. But log it: a silently
            // failing recovery net (e.g. a future rules/schema drift)
            // should be visible rather than vanish.
            console.error(
              '[useQuizSession] history snapshot write failed:',
              err
            );
          });
      }
    },
    []
  );

  const completeQuiz = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const responseKey = responseKeyRef.current;
    const quizId = quizIdRef.current;
    const teacherUid = teacherUidRef.current;
    if (!sessionId || !responseKey) return;

    const responseRef = doc(
      db,
      QUIZ_SESSIONS_COLLECTION,
      sessionId,
      RESPONSES_COLLECTION,
      responseKey
    );

    // Resolve the cross-launch ledger doc ref (Phase 2). Only meaningful
    // for non-anonymous (SSO/studentRole) joiners — anonymous PIN
    // joiners' uids rotate per device, so their ledger entry would be
    // useless. Phase 3 unifies the PIN flow onto the SSO uid space and
    // this same code starts covering PIN joiners automatically.
    //
    // We read `isAnonymous` from the join-time ref (stamped post-PIN-bridge
    // in `joinQuizSession`) rather than `auth.currentUser.isAnonymous`. A
    // mid-session custom-token expiry could otherwise drop the SDK back to
    // anonymous between join and submit, silently skipping the ledger
    // write for a student who joined as a bridged SSO user.
    const studentUid = auth.currentUser?.uid ?? null;
    const isAnonymous = isAnonymousRef.current ?? true;
    const writeLedger =
      !isAnonymous &&
      typeof studentUid === 'string' &&
      studentUid.length > 0 &&
      typeof quizId === 'string' &&
      quizId.length > 0 &&
      typeof teacherUid === 'string' &&
      teacherUid.length > 0;
    const ledgerRef = writeLedger
      ? doc(
          db,
          QUIZ_ATTEMPT_LEDGER_COLLECTION,
          quizLedgerKey(quizId, studentUid)
        )
      : null;

    // Wrap submit in a transaction so the "already-completed?" check, the
    // response status flip, and the cross-launch ledger increment are all
    // atomic. Without the transaction, two concurrent submits (rapid
    // double-click, two browser tabs) both read `status !== 'completed'`,
    // both write `status: 'completed'`, and the `increment(1)` runs twice
    // on both the response and the ledger — bypassing a 1-attempt cap.
    // Score is computed from gradeAnswer() by the teacher/results view,
    // not written by the student, to prevent client-side forgery.
    //
    // Ledger atomicity: the ledger write is intentionally NOT best-effort
    // — if the rules deny the ledger update (e.g. a ledger-rule typo or
    // schema drift) the entire transaction rolls back and the student's
    // submit fails with a visible error. That's the right call: a silent
    // "submit accepted but cap not recorded" would re-open the cross-
    // launch bypass without any signal. Production rule changes against
    // this collection MUST be deployed with care.
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(responseRef);
      if (!snap.exists()) return;
      const existing = snap.data() as QuizResponse;
      if (existing.status === 'completed') {
        // Idempotent no-op: the doc was already finalized by an earlier
        // completeQuiz call (other tab, retry, rapid double-click). We
        // intentionally `return` instead of throwing — callers
        // (handleSubmitAndAdvance, handleAutoSubmit, the auto-complete
        // branch in handleAnswer) all `await onComplete()`, sometimes
        // without a try/catch, so a thrown sentinel would surface as an
        // unhandled rejection / wrong "submit failed" toast even though
        // the submit actually succeeded earlier. Returning early
        // mirrors `completeActivity` in `useVideoActivitySession`.
        return;
      }

      // Read the ledger inside the same transaction so the increment
      // can't double-write under concurrency. Firestore requires all
      // reads to precede all writes within a transaction.
      const ledgerSnap = ledgerRef ? await tx.get(ledgerRef) : null;

      const submittedAt = Date.now();
      // Only clear `unlocked` when the response actually carries the flag.
      // Production deploys land hosting before rules (see
      // .github/workflows/firebase-deploy.yml), so during the deploy gap
      // the rules' `hasOnly([...])` allowlist may not yet include
      // `unlocked` — and a write that includes the field would be
      // rejected, silently failing the submit. Legacy responses (and
      // every fresh attempt) have `unlocked === undefined`, so the field
      // stays out of the payload until a teacher unlock actually sets it.
      const responseUpdates: Record<string, unknown> = {
        status: 'completed',
        submittedAt,
        completedAttempts: increment(1),
      };
      if (existing.unlocked) {
        responseUpdates.unlocked = false;
      }
      tx.update(responseRef, responseUpdates);

      if (ledgerRef && ledgerSnap) {
        if (ledgerSnap.exists()) {
          tx.update(ledgerRef, {
            completedAttempts: increment(1),
            lastAttemptAt: submittedAt,
            lastSessionId: sessionId,
          });
        } else {
          // First completion for this (quiz, student) pair. The cast
          // pins the shape so a future ledger-schema drift surfaces as
          // a TS error here rather than as a silent rule-denied write.
          const newLedger: QuizAttemptLedger = {
            quizId: quizId as string,
            studentUid: studentUid as string,
            teacherUid: teacherUid as string,
            completedAttempts: 1,
            lastAttemptAt: submittedAt,
            lastSessionId: sessionId,
          };
          tx.set(ledgerRef, newLedger);
        }
      }
    });
  }, []);

  const reportTabSwitch = useCallback(async (): Promise<number> => {
    const sessionId = sessionIdRef.current;
    const responseKey = responseKeyRef.current;
    if (!sessionId || !responseKey) return 0;

    const responseRef = doc(
      db,
      QUIZ_SESSIONS_COLLECTION,
      sessionId,
      RESPONSES_COLLECTION,
      responseKey
    );

    // Capture pre-increment count BEFORE Firestore write so the snapshot
    // listener can't race and double-count the same increment.
    const baseCount = Math.max(
      warningCountRef.current,
      myResponseRef.current?.tabSwitchWarnings ?? 0
    );

    try {
      await updateDoc(responseRef, {
        tabSwitchWarnings: increment(1),
      });
    } catch (err) {
      // Re-throw with extra context so the caller's catch surfaces enough
      // diagnostic info to bisect intermittent rule failures (PIN-bypass
      // SSO students vs anonymous PIN students, missing fields, etc.).
      console.error('[reportTabSwitch] update failed', {
        sessionId,
        responseKey,
        authUid: auth.currentUser?.uid,
        isAnonymous: auth.currentUser?.isAnonymous,
        baseCount,
        hasPinField: myResponseRef.current?.pin !== undefined,
        hasTabSwitchField:
          myResponseRef.current?.tabSwitchWarnings !== undefined,
      });
      throw err;
    }

    const newCount = baseCount + 1;
    warningCountRef.current = newCount;
    setWarningCount(newCount);
    return newCount;
  }, []);

  const subscribeForReview = useCallback(
    async (code: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const normCode = code
          .trim()
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase();
        if (!normCode) throw new Error('Invalid code');

        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error('Not signed in.');
        }
        if (currentUser.isAnonymous) {
          // Anonymous PIN students don't have a stable identity to look up
          // their old response without re-supplying the PIN. Reject so the
          // caller can fall back to the PIN form.
          throw new Error(
            'Sign in to review this quiz — anonymous review is not supported.'
          );
        }
        const studentUid = currentUser.uid;

        const snap = await getDocs(
          query(
            collection(db, QUIZ_SESSIONS_COLLECTION),
            where('code', '==', normCode)
          )
        );
        if (snap.empty) {
          throw new Error('No quiz found with that code.');
        }
        // Prefer sessions where the teacher has published scores; among
        // ties, fall back to the most-recent session by `endedAt` /
        // `startedAt`. A code can recur across multiple sessions over a
        // school year, and the student-facing review should land on the
        // assignment that's actually been published.
        const docs = snap.docs.slice().sort((a, b) => {
          const ad = a.data() as QuizSession;
          const bd = b.data() as QuizSession;
          const aPublished = (ad.scoreVisibility ?? 'none') !== 'none' ? 1 : 0;
          const bPublished = (bd.scoreVisibility ?? 'none') !== 'none' ? 1 : 0;
          if (aPublished !== bPublished) return bPublished - aPublished;
          const at = ad.endedAt ?? ad.startedAt ?? 0;
          const bt = bd.endedAt ?? bd.startedAt ?? 0;
          return bt - at;
        });
        const sessionDoc = docs[0];
        // Verify the student's response doc exists before flipping the
        // listeners on. Without this, the response snapshot would just
        // emit `null` and the caller would think review mode loaded
        // successfully (matches the docstring contract: throw on
        // missing response so the UI can show a targeted error rather
        // than a misleading empty-review screen).
        const responseSnap = await getDoc(
          doc(
            db,
            QUIZ_SESSIONS_COLLECTION,
            sessionDoc.id,
            RESPONSES_COLLECTION,
            studentUid
          )
        );
        if (!responseSnap.exists()) {
          throw new Error(
            'No submission found for this quiz — you may not have completed it.'
          );
        }
        sessionIdRef.current = sessionDoc.id;
        // SSO students key their response doc by auth.uid (see
        // `computeResponseKey` for the contract).
        responseKeyRef.current = studentUid;
        setSessionIdState(sessionDoc.id);
        setResponseKeyState(studentUid);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not load this quiz for review.';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    session,
    myResponse,
    loading,
    error,
    sessionIdRef,
    lookupSession,
    joinQuizSession,
    subscribeForReview,
    submitAnswer,
    completeQuiz,
    reportTabSwitch,
    warningCount,
  };
};
