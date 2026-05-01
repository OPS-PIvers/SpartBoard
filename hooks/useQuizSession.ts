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
  updateDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  increment,
  deleteField,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { signInAnonymously } from 'firebase/auth';
import {
  QuizSession,
  QuizSessionStatus,
  QuizResponse,
  QuizResponseAnswer,
  QuizQuestion,
  QuizPublicQuestion,
} from '../types';
import { resolvePeriodNames } from '../utils/periodCompat';

// Re-export for backward compatibility with callers that imported
// QuizSessionOptions from this module before it was moved into types.ts.
export type { QuizSessionOptions } from '../types';

export const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';
export const RESPONSES_COLLECTION = 'responses';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    const pairs = q.correctAnswer.split('|').map((p) => {
      const [left, right] = p.split(':');
      return { left: left ?? '', right: right ?? '' };
    });
    base.matchingLeft = pairs.map((p) => p.left);
    base.matchingRight = fisherYatesShuffle(pairs.map((p) => p.right));
  } else if (q.type === 'Ordering') {
    base.orderingItems = fisherYatesShuffle(q.correctAnswer.split('|'));
  }
  return base;
}

// ─── Grading ──────────────────────────────────────────────────────────────────

/** Normalize an answer string for comparison (collapse whitespace, lowercase). */
export const normalizeAnswer = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

export function gradeAnswer(
  question: QuizQuestion,
  studentAnswer: string
): boolean {
  const correct = normalizeAnswer(question.correctAnswer);
  const given = normalizeAnswer(studentAnswer);

  if (question.type === 'MC' || question.type === 'FIB') {
    return correct === given;
  }
  if (question.type === 'Matching') {
    const correctSet = new Set(correct.split('|').map(normalizeAnswer));
    const givenParts = given.split('|').map(normalizeAnswer);
    return (
      givenParts.length === correctSet.size &&
      givenParts.every((p) => correctSet.has(p))
    );
  }
  if (question.type === 'Ordering') {
    return correct === given;
  }
  return false;
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
        batch.update(d.ref, {
          status: 'completed',
          submittedAt: Date.now(),
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
      const responseRef = doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        responseKey
      );
      await deleteDoc(responseRef);
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
  submitAnswer: (
    questionId: string,
    answer: string,
    speedBonus?: number
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
  // Keep a ref to current answers to avoid stale closure issues
  const myResponseRef = useRef<QuizResponse | null>(null);
  myResponseRef.current = myResponse;

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
        const currentUser = auth.currentUser;
        if (!currentUser)
          throw new Error('Anonymous auth failed — no current user.');
        const studentUid = currentUser.uid;

        // Contract: PIN is required iff the caller is an anonymous Firebase
        // user. Anonymous joiners arrived via the public `/join` /
        // `/quiz?code=…` URL with no other identity, so the PIN is what
        // ties them to a roster row. Non-anonymous joiners (SSO
        // `studentRole` from `/my-assignments`, plus dev auth-bypass) carry
        // a stable uid in `auth.uid` — `computeResponseKey` keys their
        // response doc by that uid, and Firestore rules are the source of
        // truth for whether the uid is actually allowed to write.
        const sanitizedPin = (pin ?? '').trim().substring(0, 10);
        if (currentUser.isAnonymous && !sanitizedPin) {
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
            isAnonymous: currentUser.isAnonymous,
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
          throw new Error('This quiz session has already ended.');
        }
        // Prefer the most recently created joinable doc.
        joinable.sort((a, b) => {
          const at = (a.data() as QuizSession).startedAt ?? 0;
          const bt = (b.data() as QuizSession).startedAt ?? 0;
          return bt - at;
        });
        const sessionDoc = joinable[0];
        const sessionData = sessionDoc.data() as QuizSession;

        // Deterministic doc key: stable per-roster-student for PIN auth so
        // the attempt limit can't be bypassed by clearing storage / switching
        // device. studentRole users still key by their auth uid (stable per
        // user already). The helper also handles the legacy-key fallback
        // for anonymous students rejoining pre-deterministic-keying sessions.
        const deterministicKey = computeResponseKey(
          studentUid,
          currentUser.isAnonymous,
          sanitizedPin,
          classPeriod
        );
        const { key: responseKey, snap: existingSnap } =
          await findExistingResponseDoc(
            sessionDoc.id,
            studentUid,
            currentUser.isAnonymous,
            deterministicKey
          );

        sessionIdRef.current = sessionDoc.id;
        responseKeyRef.current = responseKey;
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

        // Attempt-limit enforcement.
        //   - `attemptLimit == null/undefined` means unlimited (legacy).
        //   - Limit is compared against `completedAttempts` (counter field).
        //   - Legacy docs with `status === 'completed'` but no counter are
        //     treated as 1 completed attempt so pre-upgrade submissions still
        //     count against the cap.
        //   - If the student is under the limit, reset the completed doc to
        //     a fresh 'joined' state so the next join starts a new attempt,
        //     preserving `completedAttempts` to enforce the cap on future
        //     submissions.
        const limit = sessionData.attemptLimit ?? null;
        if (existingSnap?.exists()) {
          const existing = existingSnap.data() as QuizResponse;
          if (existing.status === 'completed') {
            const completed = existing.completedAttempts ?? 1;
            if (limit !== null && completed >= limit) {
              throw new AttemptLimitReachedError();
            }
            // Under the cap (or unlimited): reset for a new attempt.
            await updateDoc(responseRef, {
              status: 'joined',
              answers: [],
              score: null,
              submittedAt: null,
              ...(classPeriod && existing.classPeriod !== classPeriod
                ? { classPeriod }
                : {}),
            }).catch((err: unknown) =>
              logQuizJoinFirestoreError('update-reset-completed', err, {
                sessionId: sessionDoc.id,
                responseKey,
                studentUid,
                existingStudentUid: existing.studentUid,
                isAnonymous: currentUser.isAnonymous,
                hasPin: !!sanitizedPin,
                hasClassPeriod: !!classPeriod,
              })
            );
          } else if (classPeriod && existing.classPeriod !== classPeriod) {
            // Backfill classPeriod on an in-flight response (e.g. student
            // joined before periods were configured or reloaded after a
            // change).
            await updateDoc(responseRef, { classPeriod }).catch(
              (err: unknown) =>
                logQuizJoinFirestoreError('update-backfill-period', err, {
                  sessionId: sessionDoc.id,
                  responseKey,
                  studentUid,
                  existingStudentUid: existing.studentUid,
                  isAnonymous: currentUser.isAnonymous,
                })
            );
          }
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
        if (!currentUser.isAnonymous && !classPeriod) {
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
          const newResponse: QuizResponse = {
            studentUid,
            joinedAt: Date.now(),
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
              isAnonymous: currentUser.isAnonymous,
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
            }).catch((err: unknown) =>
              logQuizJoinFirestoreError('update-backfill-class-period', err, {
                sessionId: sessionDoc.id,
                responseKey,
                studentUid,
                existingClassId: existing.classId,
                existingClassPeriod: existing.classPeriod,
                resolvedClassId,
                resolvedPeriodName,
                isAnonymous: currentUser.isAnonymous,
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
          msg =
            "Looks like that PIN has already joined this quiz. Ask your teacher to clear it for you, or double-check that you've selected the right class period.";
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
    async (questionId: string, answer: string, speedBonus?: number) => {
      const sessionId = sessionIdRef.current;
      const responseKey = responseKeyRef.current;
      if (!sessionId || !responseKey) return;

      // isCorrect is intentionally not written by the student to prevent
      // client-side forgery. It is computed by the teacher's results view
      // using gradeAnswer() against the full quiz data loaded from Drive.
      const newAnswer: QuizResponseAnswer = {
        questionId,
        answer,
        answeredAt: Date.now(),
        ...(speedBonus != null && speedBonus > 0
          ? { speedBonus: Math.min(50, Math.max(0, speedBonus)) }
          : {}),
      };

      const existingAnswers = myResponseRef.current?.answers ?? [];
      const updated = [
        ...existingAnswers.filter((a) => a.questionId !== questionId),
        newAnswer,
      ];

      await updateDoc(
        doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_COLLECTION,
          responseKey
        ),
        { status: 'in-progress', answers: updated }
      );
    },
    []
  );

  const completeQuiz = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const responseKey = responseKeyRef.current;
    if (!sessionId || !responseKey) return;

    // Score is computed from gradeAnswer() by the teacher/results view,
    // not written by the student, to prevent client-side forgery of the score field.
    // Increment `completedAttempts` so the attempt-limit check on the next
    // join can count this submission (and block once the cap is reached).
    await updateDoc(
      doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        responseKey
      ),
      {
        status: 'completed',
        submittedAt: Date.now(),
        completedAttempts: increment(1),
      }
    );
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

  return {
    session,
    myResponse,
    loading,
    error,
    sessionIdRef,
    lookupSession,
    joinQuizSession,
    submitAnswer,
    completeQuiz,
    reportTabSwitch,
    warningCount,
  };
};
