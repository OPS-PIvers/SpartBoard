/**
 * useVideoActivitySession hooks
 *
 * Two hooks — one for teachers (create/view sessions), one for students
 * (join and submit answers). Mirrors the pattern in useQuizSession.ts.
 *
 * Firestore structure:
 *   /video_activity_sessions/{sessionId}          — VideoActivitySession
 *   /video_activity_sessions/{sessionId}/responses/{pin} — VideoActivityResponse
 */

import { useState, useEffect, useCallback } from 'react';
import {
  doc,
  collection,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  VideoActivitySession,
  VideoActivityResponse,
  VideoActivityData,
  VideoActivityAnswer,
} from '@/types';

const SESSIONS_COLLECTION = 'video_activity_sessions';
const RESPONSES_SUBCOLLECTION = 'responses';

// ---------------------------------------------------------------------------
// Teacher hook
// ---------------------------------------------------------------------------

export interface UseVideoActivitySessionTeacherResult {
  /** Create a session for a class and return the sessionId (used as the share link). */
  createSession: (
    activity: VideoActivityData,
    teacherUid: string,
    allowedPins?: string[]
  ) => Promise<string>;
  /** Real-time responses for a specific session. */
  responses: VideoActivityResponse[];
  /** Subscribe to a specific session's responses. */
  subscribeToSession: (sessionId: string) => void;
  /** Unsubscribe from the current session listener. */
  unsubscribeFromSession: () => void;
  loading: boolean;
}

export const useVideoActivitySessionTeacher =
  (): UseVideoActivitySessionTeacherResult => {
    const [responses, setResponses] = useState<VideoActivityResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [unsubFn, setUnsubFn] = useState<Unsubscribe | null>(null);

    const createSession = useCallback(
      async (
        activity: VideoActivityData,
        teacherUid: string,
        allowedPins: string[] = []
      ): Promise<string> => {
        const sessionId = crypto.randomUUID();

        const session: VideoActivitySession = {
          id: sessionId,
          activityId: activity.id,
          activityTitle: activity.title,
          teacherUid,
          youtubeUrl: activity.youtubeUrl,
          questions: activity.questions,
          allowedPins,
          createdAt: Date.now(),
        };

        await setDoc(doc(db, SESSIONS_COLLECTION, sessionId), session);

        return sessionId;
      },
      []
    );

    const subscribeToSession = useCallback((sessionId: string) => {
      setLoading(true);
      const unsub = onSnapshot(
        collection(db, SESSIONS_COLLECTION, sessionId, RESPONSES_SUBCOLLECTION),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as VideoActivityResponse);
          setResponses(list);
          setLoading(false);
        },
        (err) => {
          console.error(
            '[useVideoActivitySessionTeacher] Firestore error:',
            err
          );
          setLoading(false);
        }
      );
      setUnsubFn(() => unsub);
    }, []);

    const unsubscribeFromSession = useCallback(() => {
      if (unsubFn) {
        unsubFn();
        setUnsubFn(null);
        setResponses([]);
      }
    }, [unsubFn]);

    // Clean up on unmount
    useEffect(() => {
      return () => {
        if (unsubFn) unsubFn();
      };
    }, [unsubFn]);

    return {
      createSession,
      responses,
      subscribeToSession,
      unsubscribeFromSession,
      loading,
    };
  };

// ---------------------------------------------------------------------------
// Student hook
// ---------------------------------------------------------------------------

export type StudentJoinStatus =
  | 'idle'
  | 'loading'
  | 'joined'
  | 'error'
  | 'not-found'
  | 'pin-rejected';

export interface UseVideoActivitySessionStudentResult {
  session: VideoActivitySession | null;
  myResponse: VideoActivityResponse | null;
  joinStatus: StudentJoinStatus;
  error: string | null;
  joinSession: (sessionId: string, pin: string, name: string) => Promise<void>;
  submitAnswer: (
    questionId: string,
    answer: string,
    isCorrect: boolean
  ) => Promise<void>;
  completeActivity: () => Promise<void>;
}

export const useVideoActivitySessionStudent =
  (): UseVideoActivitySessionStudentResult => {
    const [session, setSession] = useState<VideoActivitySession | null>(null);
    const [myResponse, setMyResponse] = useState<VideoActivityResponse | null>(
      null
    );
    const [joinStatus, setJoinStatus] = useState<StudentJoinStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pin, setPin] = useState<string | null>(null);

    // Listen to session document
    useEffect(() => {
      if (!sessionId) return;

      const unsub = onSnapshot(
        doc(db, SESSIONS_COLLECTION, sessionId),
        (snap) => {
          if (snap.exists()) {
            setSession(snap.data() as VideoActivitySession);
          }
        },
        (err) => {
          console.error(
            '[useVideoActivitySessionStudent] Session listener error:',
            err
          );
        }
      );

      return unsub;
    }, [sessionId]);

    // Listen to own response document
    useEffect(() => {
      if (!sessionId || !pin) return;

      const unsub = onSnapshot(
        doc(db, SESSIONS_COLLECTION, sessionId, RESPONSES_SUBCOLLECTION, pin),
        (snap) => {
          if (snap.exists()) {
            setMyResponse(snap.data() as VideoActivityResponse);
          }
        },
        (err) => {
          console.error(
            '[useVideoActivitySessionStudent] Response listener error:',
            err
          );
        }
      );

      return unsub;
    }, [sessionId, pin]);

    const joinSession = useCallback(
      async (
        targetSessionId: string,
        studentPin: string,
        studentName: string
      ): Promise<void> => {
        setJoinStatus('loading');
        setError(null);

        try {
          // Load session document
          const sessionSnap = await getDoc(
            doc(db, SESSIONS_COLLECTION, targetSessionId)
          );

          if (!sessionSnap.exists()) {
            setJoinStatus('not-found');
            setError(
              'This activity session was not found. Check the link and try again.'
            );
            return;
          }

          const sessionData = sessionSnap.data() as VideoActivitySession;

          // Validate PIN against allowed list (empty list = open to any PIN)
          if (
            sessionData.allowedPins.length > 0 &&
            !sessionData.allowedPins.includes(studentPin)
          ) {
            setJoinStatus('pin-rejected');
            setError('Incorrect PIN. Please check with your teacher.');
            return;
          }

          // Check expiry
          if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
            setJoinStatus('error');
            setError(
              'This activity has expired. Contact your teacher for a new link.'
            );
            return;
          }

          // Create or retrieve response document (pin is the document ID)
          const responseRef = doc(
            db,
            SESSIONS_COLLECTION,
            targetSessionId,
            RESPONSES_SUBCOLLECTION,
            studentPin
          );
          const existingSnap = await getDoc(responseRef);

          if (!existingSnap.exists()) {
            const newResponse: VideoActivityResponse = {
              pin: studentPin,
              name: studentName,
              joinedAt: Date.now(),
              answers: [],
              completedAt: null,
              score: null,
            };
            await setDoc(responseRef, newResponse);
          }

          setSessionId(targetSessionId);
          setPin(studentPin);
          setSession(sessionData);
          setJoinStatus('joined');
        } catch (err) {
          console.error(
            '[useVideoActivitySessionStudent] joinSession error:',
            err
          );
          setJoinStatus('error');
          setError('Failed to join the session. Please try again.');
        }
      },
      []
    );

    const submitAnswer = useCallback(
      async (
        questionId: string,
        answer: string,
        isCorrect: boolean
      ): Promise<void> => {
        if (!sessionId || !pin) return;

        const answerEntry: VideoActivityAnswer = {
          questionId,
          answer,
          isCorrect,
          answeredAt: Date.now(),
        };

        const responseRef = doc(
          db,
          SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_SUBCOLLECTION,
          pin
        );

        await updateDoc(responseRef, {
          answers: arrayUnion(answerEntry),
        });
      },
      [sessionId, pin]
    );

    const completeActivity = useCallback(async (): Promise<void> => {
      if (!sessionId || !pin || !myResponse) return;

      const correct = myResponse.answers.filter((a) => a.isCorrect).length;
      const total = session?.questions.length ?? 0;
      const score = total > 0 ? Math.round((correct / total) * 100) : 0;

      const responseRef = doc(
        db,
        SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_SUBCOLLECTION,
        pin
      );

      await updateDoc(responseRef, {
        completedAt: Date.now(),
        score,
      });
    }, [sessionId, pin, myResponse, session]);

    return {
      session,
      myResponse,
      joinStatus,
      error,
      joinSession,
      submitAnswer,
      completeActivity,
    };
  };
