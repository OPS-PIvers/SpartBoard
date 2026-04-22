/**
 * useVideoActivitySession hooks
 *
 * Two hooks — one for teachers (create/view sessions), one for students
 * (join and submit answers). Mirrors the pattern in useQuizSession.ts.
 *
 * Firestore structure:
 *   /video_activity_sessions/{sessionId}              — VideoActivitySession
 *   /video_activity_sessions/{sessionId}/responses/{studentUid} — VideoActivityResponse
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc,
  collection,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  runTransaction,
  Unsubscribe,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import {
  VideoActivitySession,
  VideoActivityResponse,
  VideoActivityData,
  VideoActivityAnswer,
  VideoActivitySessionSettings,
} from '@/types';

const SESSIONS_COLLECTION = 'video_activity_sessions';
const RESPONSES_SUBCOLLECTION = 'responses';

const normalizeSession = (
  sessionId: string,
  data: Partial<VideoActivitySession>
): VideoActivitySession => {
  const activityTitle = data.activityTitle ?? 'Video Activity';
  const createdAt = data.createdAt ?? Date.now();

  return {
    id: sessionId,
    activityId: data.activityId ?? '',
    activityTitle,
    assignmentName:
      data.assignmentName && data.assignmentName.trim().length > 0
        ? data.assignmentName
        : `${activityTitle} ${new Date(createdAt).toLocaleString()}`,
    teacherUid: data.teacherUid ?? '',
    youtubeUrl: data.youtubeUrl ?? '',
    questions: data.questions ?? [],
    settings: {
      autoPlay: data.settings?.autoPlay ?? false,
      requireCorrectAnswer: data.settings?.requireCorrectAnswer ?? true,
      allowSkipping: data.settings?.allowSkipping ?? false,
    },
    status: data.status === 'ended' ? 'ended' : 'active',
    allowedPins: data.allowedPins ?? [],
    createdAt,
    ...(typeof data.endedAt === 'number' ? { endedAt: data.endedAt } : {}),
    ...(typeof data.expiresAt === 'number'
      ? { expiresAt: data.expiresAt }
      : {}),
  };
};

// ---------------------------------------------------------------------------
// Teacher hook
// ---------------------------------------------------------------------------

export interface UseVideoActivitySessionTeacherResult {
  /**
   * Create a session for a class and return the sessionId (used as the share link).
   *
   * `classId` is an optional ClassLink class `sourcedId`. When provided, it's
   * written onto the session doc so that ClassLink-authenticated students
   * see this session on their `/my-assignments` page, and Firestore rules
   * (`passesStudentClassGate(vaSessionClassId())`) enforce class-based
   * access. Omitting it preserves the classic code/PIN-only flow.
   */
  createSession: (
    activity: VideoActivityData,
    teacherUid: string,
    allowedPins?: string[],
    settings?: Partial<VideoActivitySessionSettings>,
    assignmentName?: string,
    classId?: string
  ) => Promise<string>;
  /** Sessions created by the current teacher for the selected activity. */
  sessions: VideoActivitySession[];
  sessionsLoading: boolean;
  /** Subscribe to sessions for a single activity. Cleans up any previous listener. */
  subscribeToActivitySessions: (activityId: string, teacherUid: string) => void;
  /** Unsubscribe from the current activity session list. */
  unsubscribeFromActivitySessions: () => void;
  /** Rename a previously created session. */
  renameSession: (sessionId: string, assignmentName: string) => Promise<void>;
  /** End a session so the join link is no longer valid. */
  endSession: (sessionId: string) => Promise<void>;
  /** Real-time responses for a specific session. */
  responses: VideoActivityResponse[];
  /** Subscribe to a specific session's responses. Cleans up any previous listener. */
  subscribeToSession: (sessionId: string) => void;
  /** Unsubscribe from the current session listener. */
  unsubscribeFromSession: () => void;
  loading: boolean;
}

export const useVideoActivitySessionTeacher =
  (): UseVideoActivitySessionTeacherResult => {
    const [sessions, setSessions] = useState<VideoActivitySession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [responses, setResponses] = useState<VideoActivityResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const unsubRef = useRef<Unsubscribe | null>(null);
    const sessionsUnsubRef = useRef<Unsubscribe | null>(null);

    const createSession = useCallback(
      async (
        activity: VideoActivityData,
        teacherUid: string,
        allowedPins: string[] = [],
        settings?: Partial<VideoActivitySessionSettings>,
        assignmentName?: string,
        classId?: string
      ): Promise<string> => {
        const sessionId = crypto.randomUUID();
        const trimmedAssignmentName = assignmentName?.trim();
        const sessionSettings: VideoActivitySessionSettings = {
          autoPlay: settings?.autoPlay ?? false,
          requireCorrectAnswer: settings?.requireCorrectAnswer ?? true,
          allowSkipping: settings?.allowSkipping ?? false,
        };

        const session: VideoActivitySession = {
          id: sessionId,
          activityId: activity.id,
          activityTitle: activity.title,
          assignmentName:
            trimmedAssignmentName && trimmedAssignmentName.length > 0
              ? trimmedAssignmentName
              : `${activity.title} ${new Date().toLocaleString()}`,
          teacherUid,
          youtubeUrl: activity.youtubeUrl,
          questions: activity.questions,
          settings: sessionSettings,
          status: 'active',
          allowedPins,
          createdAt: Date.now(),
          // Phase 3B: optional ClassLink target class. Only write when a
          // non-empty sourcedId was supplied so sessions created without a
          // target keep a clean doc shape (and the rules no-op branch kicks in
          // via `resource.data.get('classId', '')`).
          ...(classId ? { classId } : {}),
        };

        await setDoc(doc(db, SESSIONS_COLLECTION, sessionId), session);

        return sessionId;
      },
      []
    );

    const subscribeToActivitySessions = useCallback(
      (activityId: string, teacherUid: string) => {
        if (sessionsUnsubRef.current) {
          sessionsUnsubRef.current();
          sessionsUnsubRef.current = null;
        }

        setSessionsLoading(true);
        sessionsUnsubRef.current = onSnapshot(
          query(
            collection(db, SESSIONS_COLLECTION),
            where('activityId', '==', activityId),
            where('teacherUid', '==', teacherUid),
            orderBy('createdAt', 'desc')
          ),
          (snap) => {
            setSessions(
              snap.docs.map((sessionDoc) => {
                const data = sessionDoc.data() as Partial<VideoActivitySession>;
                return normalizeSession(sessionDoc.id, data);
              })
            );
            setSessionsLoading(false);
          },
          (err) => {
            console.error(
              '[useVideoActivitySessionTeacher] Activity session list error:',
              err
            );
            setSessions([]);
            setSessionsLoading(false);
          }
        );
      },
      []
    );

    const unsubscribeFromActivitySessions = useCallback(() => {
      if (sessionsUnsubRef.current) {
        sessionsUnsubRef.current();
        sessionsUnsubRef.current = null;
      }
      setSessions([]);
      setSessionsLoading(false);
    }, []);

    const renameSession = useCallback(
      async (sessionId: string, assignmentName: string): Promise<void> => {
        await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
          assignmentName: assignmentName.trim(),
        });
      },
      []
    );

    const endSession = useCallback(async (sessionId: string): Promise<void> => {
      const now = Date.now();
      await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
        status: 'ended',
        endedAt: now,
        expiresAt: now,
      });
    }, []);

    const subscribeToSession = useCallback((sessionId: string) => {
      // Clean up any existing listener before creating a new one
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }

      setLoading(true);
      unsubRef.current = onSnapshot(
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
    }, []);

    const unsubscribeFromSession = useCallback(() => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
      setResponses([]);
    }, []);

    // Clean up on unmount
    useEffect(() => {
      return () => {
        if (sessionsUnsubRef.current) {
          sessionsUnsubRef.current();
          sessionsUnsubRef.current = null;
        }
        if (unsubRef.current) {
          unsubRef.current();
          unsubRef.current = null;
        }
      };
    }, []);

    return {
      createSession,
      sessions,
      sessionsLoading,
      subscribeToActivitySessions,
      unsubscribeFromActivitySessions,
      renameSession,
      endSession,
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
  submitAnswer: (questionId: string, answer: string) => Promise<void>;
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
    // responseDocId is the student's Firebase auth UID (used as the Firestore document ID)
    const [responseDocId, setResponseDocId] = useState<string | null>(null);

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
      if (!sessionId || !responseDocId) return;

      const unsub = onSnapshot(
        doc(
          db,
          SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_SUBCOLLECTION,
          responseDocId
        ),
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
    }, [sessionId, responseDocId]);

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

          if (sessionData.status === 'ended') {
            setJoinStatus('error');
            setError(
              'This activity has been closed by your teacher. Ask for a new link if you still need access.'
            );
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

          const studentUid = auth.currentUser?.uid;
          if (!studentUid) {
            setJoinStatus('error');
            setError('Authentication required. Please refresh and try again.');
            return;
          }

          // Response document ID is the student's auth UID (prevents PIN-claiming attacks)
          const responseRef = doc(
            db,
            SESSIONS_COLLECTION,
            targetSessionId,
            RESPONSES_SUBCOLLECTION,
            studentUid
          );
          const existingSnap = await getDoc(responseRef);

          if (!existingSnap.exists()) {
            const newResponse: VideoActivityResponse = {
              pin: studentPin,
              name: studentName,
              studentUid,
              joinedAt: Date.now(),
              answers: [],
              completedAt: null,
              score: null,
            };
            await setDoc(responseRef, newResponse);
          }

          setSessionId(targetSessionId);
          setResponseDocId(studentUid);
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
      async (questionId: string, answer: string): Promise<void> => {
        if (!sessionId || !responseDocId) return;

        const responseRef = doc(
          db,
          SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_SUBCOLLECTION,
          responseDocId
        );

        // Use a transaction so the duplicate-answer check and write are atomic,
        // preventing race conditions where two rapid submits both pass the UI guard.
        // isCorrect is intentionally not stored — correctness is always derived
        // server-side from authoritative question data when displaying results.
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(responseRef);
          if (!snap.exists()) return;
          const data = snap.data() as VideoActivityResponse;
          if (data.answers.some((a) => a.questionId === questionId)) return;
          const answerEntry: VideoActivityAnswer = {
            questionId,
            answer,
            answeredAt: Date.now(),
          };
          tx.update(responseRef, { answers: arrayUnion(answerEntry) });
        });
      },
      [sessionId, responseDocId]
    );

    const completeActivity = useCallback(async (): Promise<void> => {
      if (!sessionId || !responseDocId) return;

      const responseRef = doc(
        db,
        SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_SUBCOLLECTION,
        responseDocId
      );

      await updateDoc(responseRef, {
        completedAt: Date.now(),
      });
    }, [sessionId, responseDocId]);

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
