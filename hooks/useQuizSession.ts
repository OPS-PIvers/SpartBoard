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
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { signInAnonymously } from 'firebase/auth';
import {
  QuizSession,
  QuizSessionStatus,
  QuizSessionMode,
  QuizResponse,
  QuizResponseAnswer,
  QuizQuestion,
  QuizPublicQuestion,
} from '../types';

const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';
const RESPONSES_COLLECTION = 'responses';

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
function toPublicQuestion(q: QuizQuestion): QuizPublicQuestion {
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

// ─── Teacher hook ─────────────────────────────────────────────────────────────

/** Options passed from the assignment modal to configure session toggles. */
export interface QuizSessionOptions {
  tabWarningsEnabled?: boolean;
  showResultToStudent?: boolean;
  showCorrectAnswerToStudent?: boolean;
  showCorrectOnBoard?: boolean;
  speedBonusEnabled?: boolean;
  streakBonusEnabled?: boolean;
  showPodiumBetweenQuestions?: boolean;
  soundEffectsEnabled?: boolean;
}

export interface UseQuizSessionTeacherResult {
  session: QuizSession | null;
  responses: QuizResponse[];
  loading: boolean;
  startQuizSession: (
    quiz: {
      id: string;
      title: string;
      questions: QuizQuestion[];
    },
    mode?: QuizSessionMode,
    options?: QuizSessionOptions
  ) => Promise<string>;
  advanceQuestion: () => Promise<void>;
  endQuizSession: () => Promise<void>;
  /** Remove a student from the live session roster */
  removeStudent: (studentUid: string) => Promise<void>;
  /** Reveal the correct answer for a question (writes to session doc) */
  revealAnswer: (questionId: string, correctAnswer: string) => Promise<void>;
}

export const useQuizSessionTeacher = (
  teacherUid: string | undefined
): UseQuizSessionTeacherResult => {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherUid) {
      setTimeout(() => setLoading(false), 0);
      return;
    }
    const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, teacherUid);
    return onSnapshot(
      sessionRef,
      (snap) => {
        setSession(snap.exists() ? (snap.data() as QuizSession) : null);
        setLoading(false);
      },
      (err) => {
        console.error('[useQuizSessionTeacher]', err);
        setLoading(false);
      }
    );
  }, [teacherUid]);

  useEffect(() => {
    // Keep the listener active even after the session ends so that any
    // late student submissions still appear in the live monitor / results.
    if (!teacherUid || !session) return;
    const responsesRef = collection(
      db,
      QUIZ_SESSIONS_COLLECTION,
      teacherUid,
      RESPONSES_COLLECTION
    );
    return onSnapshot(
      responsesRef,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as QuizResponse);
        setResponses(list);
      },
      (err) => console.error('[useQuizSessionTeacher] responses:', err)
    );
  }, [teacherUid, session]);

  const finalizeAllResponses = useCallback(async () => {
    if (!teacherUid) return;
    const responsesRef = collection(
      db,
      QUIZ_SESSIONS_COLLECTION,
      teacherUid,
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
  }, [teacherUid]);

  const removeStudent = useCallback(
    async (studentUid: string) => {
      if (!teacherUid) return;
      const responseRef = doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        teacherUid,
        RESPONSES_COLLECTION,
        studentUid
      );
      await deleteDoc(responseRef);
    },
    [teacherUid]
  );

  const revealAnswer = useCallback(
    async (questionId: string, correctAnswer: string) => {
      if (!teacherUid) return;
      const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, teacherUid);
      await updateDoc(sessionRef, {
        [`revealedAnswers.${questionId}`]: correctAnswer,
      });
    },
    [teacherUid]
  );

  const advanceQuestion = useCallback(async () => {
    if (!teacherUid || !session) return;
    const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, teacherUid);
    const nextIndex = session.currentQuestionIndex + 1;

    if (nextIndex >= session.totalQuestions) {
      await updateDoc(sessionRef, {
        status: 'ended' as QuizSessionStatus,
        currentQuestionIndex: session.totalQuestions,
        endedAt: Date.now(),
        autoProgressAt: null,
      });
      await finalizeAllResponses();
      return;
    }
    await updateDoc(sessionRef, {
      status: 'active' as QuizSessionStatus,
      currentQuestionIndex: nextIndex,
      autoProgressAt: null,
      ...(session.startedAt === null ? { startedAt: Date.now() } : {}),
    });
  }, [teacherUid, session, finalizeAllResponses]);

  const endQuizSession = useCallback(async () => {
    if (!teacherUid) return;

    // 1. End the session
    await updateDoc(doc(db, QUIZ_SESSIONS_COLLECTION, teacherUid), {
      status: 'ended' as QuizSessionStatus,
      endedAt: Date.now(),
      autoProgressAt: null,
    });

    // 2. Mark all active students as completed so their data is preserved in results
    await finalizeAllResponses();
  }, [teacherUid, finalizeAllResponses]);

  // ─── Auto-progress logic ────────────────────────────────────────────────────
  useEffect(() => {
    if (!teacherUid || !session || session.sessionMode !== 'auto') return;
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

    if (everyoneAnswered && !session.autoProgressAt) {
      // All students answered: set a 5-second countdown to advance
      const advanceAt = Date.now() + 5000;
      updateDoc(doc(db, QUIZ_SESSIONS_COLLECTION, teacherUid), {
        autoProgressAt: advanceAt,
      }).catch((err) => console.error('[AutoProgress] update failed:', err));
    }
  }, [responses, session, teacherUid]);

  // Handle the actual auto-advance when the timestamp is reached
  useEffect(() => {
    if (!teacherUid || !session?.autoProgressAt) return;

    const timer = setInterval(() => {
      if (Date.now() >= (session.autoProgressAt ?? 0)) {
        clearInterval(timer);
        advanceQuestion().catch((err) =>
          console.error('[AutoProgress] advance failed:', err)
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [session?.autoProgressAt, teacherUid, advanceQuestion]);

  const startQuizSession = useCallback(
    async (
      quiz: {
        id: string;
        title: string;
        questions: QuizQuestion[];
      },
      mode: QuizSessionMode = 'teacher',
      options?: QuizSessionOptions
    ): Promise<string> => {
      if (!teacherUid) throw new Error('Not authenticated');

      // Delete any existing response documents from a previous session
      const oldResponses = await getDocs(
        collection(
          db,
          QUIZ_SESSIONS_COLLECTION,
          teacherUid,
          RESPONSES_COLLECTION
        )
      );
      const BATCH_LIMIT = 500;
      for (let i = 0; i < oldResponses.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        oldResponses.docs.slice(i, i + BATCH_LIMIT).forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }

      // Generate a unique 6-character join code
      let code = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase()
          .padEnd(6, '0');
        const collision = await getDocs(
          query(
            collection(db, QUIZ_SESSIONS_COLLECTION),
            where('code', '==', candidate),
            where('status', '!=', 'ended')
          )
        );
        if (collision.empty) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        code = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase()
          .padEnd(6, '0');
      }

      const newSession: QuizSession = {
        id: teacherUid,
        quizId: quiz.id,
        quizTitle: quiz.title,
        teacherUid,
        status: 'waiting' as QuizSessionStatus,
        sessionMode: mode,
        currentQuestionIndex: mode === 'student' ? 0 : -1,
        startedAt: mode === 'student' ? Date.now() : null,
        endedAt: null,
        code,
        totalQuestions: quiz.questions.length,
        publicQuestions: quiz.questions.map(toPublicQuestion),
        // Phase 1 toggles
        tabWarningsEnabled: options?.tabWarningsEnabled ?? true,
        showResultToStudent: options?.showResultToStudent ?? false,
        showCorrectAnswerToStudent:
          options?.showCorrectAnswerToStudent ?? false,
        showCorrectOnBoard: options?.showCorrectOnBoard ?? false,
        revealedAnswers: {},
        // Phase 2 gamification
        speedBonusEnabled: options?.speedBonusEnabled ?? false,
        streakBonusEnabled: options?.streakBonusEnabled ?? false,
        showPodiumBetweenQuestions:
          options?.showPodiumBetweenQuestions ?? false,
        soundEffectsEnabled: options?.soundEffectsEnabled ?? false,
      };
      await setDoc(doc(db, QUIZ_SESSIONS_COLLECTION, teacherUid), newSession);
      return code;
    },
    [teacherUid]
  );

  return {
    session,
    responses,
    loading,
    startQuizSession,
    advanceQuestion,
    endQuizSession,
    removeStudent,
    revealAnswer,
  };
};

// ─── Student hook ─────────────────────────────────────────────────────────────

export interface UseQuizSessionStudentResult {
  session: QuizSession | null;
  myResponse: QuizResponse | null;
  loading: boolean;
  error: string | null;
  teacherUidRef: MutableRefObject<string | null>;
  joinQuizSession: (code: string, pin: string) => Promise<string>;
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
  const teacherUidRef = useRef<string | null>(null);
  const studentUidRef = useRef<string | null>(null);
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

  // Session listener — only subscribes once teacherUid is known
  const [teacherUidState, setTeacherUidState] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherUidState) return;
    return onSnapshot(
      doc(db, QUIZ_SESSIONS_COLLECTION, teacherUidState),
      (snap) => setSession(snap.exists() ? (snap.data() as QuizSession) : null)
    );
  }, [teacherUidState]);

  // My response listener
  const [studentUidState, setStudentUidState] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherUidState || !studentUidState) return;
    return onSnapshot(
      doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        teacherUidState,
        RESPONSES_COLLECTION,
        studentUidState
      ),
      (snap) =>
        setMyResponse(snap.exists() ? (snap.data() as QuizResponse) : null)
    );
  }, [teacherUidState, studentUidState]);

  const joinQuizSession = useCallback(
    async (code: string, pin: string): Promise<string> => {
      setLoading(true);
      setError(null);
      try {
        const normCode = code
          .trim()
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase();
        if (!normCode) throw new Error('Invalid code');

        // Prevent storage abuse on the PIN field
        const sanitizedPin = pin.trim().substring(0, 10);
        if (!sanitizedPin) throw new Error('PIN is required');

        // Ensure we have an anonymous Firebase Auth session so Firestore
        // security rules (request.auth != null) are satisfied.
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        const currentUser = auth.currentUser;
        if (!currentUser)
          throw new Error('Anonymous auth failed — no current user.');
        const studentUid = currentUser.uid;

        const snap = await getDocs(
          query(
            collection(db, QUIZ_SESSIONS_COLLECTION),
            where('code', '==', normCode)
          )
        );
        if (snap.empty) throw new Error('No active quiz found with that code.');

        const sessionDoc = snap.docs[0];
        const sessionData = sessionDoc.data() as QuizSession;
        if (sessionData.status === 'ended') {
          throw new Error('This quiz session has already ended.');
        }

        teacherUidRef.current = sessionDoc.id;
        studentUidRef.current = studentUid;
        // Reset warning count before activating snapshot listeners so a
        // late-arriving snapshot from a previous session can't race with
        // the finally-block reset and leave the counter stuck at 0.
        warningCountRef.current = 0;
        setWarningCount(0);
        setTeacherUidState(sessionDoc.id);
        setStudentUidState(studentUid);

        const responseRef = doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionDoc.id,
          RESPONSES_COLLECTION,
          studentUid
        );

        // Use getDoc to check whether the student already has a response
        // document (e.g. after a page reload), rather than relying on the
        // in-memory ref which may still be null before the snapshot arrives.
        const existingSnap = await getDoc(responseRef);
        if (!existingSnap.exists()) {
          // No PII stored — only the PIN for teacher cross-reference
          const newResponse: QuizResponse = {
            studentUid,
            pin: sanitizedPin,
            joinedAt: Date.now(),
            status: 'joined',
            answers: [],
            score: null,
            submittedAt: null,
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
      const teacherUid = teacherUidRef.current;
      const studentUid = studentUidRef.current;
      if (!teacherUid || !studentUid) return;

      // isCorrect is intentionally not written by the student to prevent
      // client-side forgery. It is computed by the teacher's results view
      // using gradeAnswer() against the full quiz data loaded from Drive.
      const newAnswer: QuizResponseAnswer = {
        questionId,
        answer,
        answeredAt: Date.now(),
        ...(speedBonus != null && speedBonus > 0 ? { speedBonus } : {}),
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
          teacherUid,
          RESPONSES_COLLECTION,
          studentUid
        ),
        { status: 'in-progress', answers: updated }
      );
    },
    []
  );

  const completeQuiz = useCallback(async () => {
    const teacherUid = teacherUidRef.current;
    const studentUid = studentUidRef.current;
    if (!teacherUid || !studentUid) return;

    // Score is computed from gradeAnswer() by the teacher/results view,
    // not written by the student, to prevent client-side forgery of the score field.
    await updateDoc(
      doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        teacherUid,
        RESPONSES_COLLECTION,
        studentUid
      ),
      { status: 'completed', submittedAt: Date.now() }
    );
  }, []);

  const reportTabSwitch = useCallback(async (): Promise<number> => {
    const teacherUid = teacherUidRef.current;
    const studentUid = studentUidRef.current;
    if (!teacherUid || !studentUid) return 0;

    const responseRef = doc(
      db,
      QUIZ_SESSIONS_COLLECTION,
      teacherUid,
      RESPONSES_COLLECTION,
      studentUid
    );

    await updateDoc(responseRef, {
      tabSwitchWarnings: increment(1),
    });

    // Base the new count on whichever is higher: our local ref or the latest
    // server value (via myResponseRef). This guards against the case where the
    // sync effect hasn't fired yet (e.g., rapid blur before first snapshot),
    // which would cause warningCountRef to under-count and return too low a
    // value, preventing the auto-submit threshold from triggering.
    const baseCount = Math.max(
      warningCountRef.current,
      myResponseRef.current?.tabSwitchWarnings ?? 0
    );
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
    teacherUidRef,
    joinQuizSession,
    submitAnswer,
    completeQuiz,
    reportTabSwitch,
    warningCount,
  };
};
