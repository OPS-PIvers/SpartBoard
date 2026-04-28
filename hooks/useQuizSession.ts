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
 * Resolve the Firestore doc id for a given response. The snapshot listeners
 * attach `_responseKey` to every row so teacher-side UI can target the
 * underlying doc without knowing the keying scheme; legacy rows predating
 * that field still equate the key with `studentUid`, hence the fallback.
 */
export function getResponseDocKey(response: QuizResponse): string {
  return response._responseKey ?? response.studentUid;
}

/**
 * Thrown when an anonymous student's deterministic response key collides
 * with an existing doc owned by a different anon UID — i.e. another student
 * (or this same student from a different device whose anon UID has rotated)
 * has already claimed this PIN+period slot. The Firestore read rule rejects
 * the cross-uid read with `permission-denied`; we map that to a friendly
 * "PIN already in use" message rather than letting the raw FirebaseError
 * surface as a generic "Missing or insufficient permissions" toast.
 */
export class PinAlreadyInUseError extends Error {
  constructor() {
    super(
      'That PIN is already in use on this quiz. Double-check your PIN with your teacher, or ask them to clear your previous attempt.'
    );
    this.name = 'PinAlreadyInUseError';
  }
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
): Promise<{ key: string; snap: DocumentSnapshot }> {
  let deterministicSnap: DocumentSnapshot;
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
    // The response read rule rejects cross-uid reads of an existing doc:
    // it allows `resource == null` (doc absent) or
    // `request.auth.uid == resource.data.studentUid` (it's ours), and
    // denies anything else. So a permission-denied here means the slot
    // exists but is owned by a different uid — typically a PIN collision
    // between two anonymous students. Surface that as a friendly,
    // recoverable error rather than the raw FirebaseError. Any other code
    // (network failure, rules deployment mismatch) keeps bubbling.
    const code = (err as { code?: unknown }).code;
    if (isAnonymous && code === 'permission-denied') {
      throw new PinAlreadyInUseError();
    }
    throw err;
  }
  if (deterministicSnap.exists()) {
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
      const code = (err as { code?: unknown }).code;
      if (code !== 'permission-denied') throw err;
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
      const normCode = code
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
      if (!normCode) return null;
      // Mirror joinQuizSession's error-state contract: surface Firestore
      // failures via `setError` before re-throwing so the form can render
      // the friendly banner. Without this the form's catch only console.warns
      // a lookupSession failure (it has no local error state) and the
      // student stares at an unchanged form with no feedback.
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(db, QUIZ_SESSIONS_COLLECTION),
            where('code', '==', normCode)
          )
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not look up the quiz. Please try again.';
        setError(msg);
        throw err;
      }
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
        if (existingSnap.exists()) {
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
            });
          } else if (classPeriod && existing.classPeriod !== classPeriod) {
            // Backfill classPeriod on an in-flight response (e.g. student
            // joined before periods were configured or reloaded after a
            // change).
            await updateDoc(responseRef, { classPeriod });
          }
        }

        setSessionIdState(sessionDoc.id);
        setResponseKeyState(responseKey);

        if (!existingSnap.exists()) {
          // No PII stored. `studentUid` field carries the auth uid; the doc
          // key may differ (for PIN auth it's pin-based), so Firestore rules
          // enforce ownership against the field, not the key. The `pin`
          // field is omitted entirely for SSO `studentRole` joiners — the
          // teacher's grading view resolves their name from `studentUid`
          // via `getPseudonymsForAssignmentV1`.
          const newResponse: QuizResponse = {
            studentUid,
            joinedAt: Date.now(),
            status: 'joined',
            answers: [],
            score: null,
            submittedAt: null,
            completedAttempts: 0,
            ...(sanitizedPin ? { pin: sanitizedPin } : {}),
            ...(classPeriod ? { classPeriod } : {}),
          };
          await setDoc(responseRef, newResponse);
        }

        setSession(sessionData);
        return sessionDoc.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to join quiz';
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
