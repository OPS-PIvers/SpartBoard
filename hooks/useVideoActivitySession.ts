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
import { logError } from '@/utils/logError';
import { computeResponseKey } from '@/hooks/useQuizSession';
import {
  AssignmentMode,
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
   * Post-unification, `rosterIds` is the canonical input — callers derive
   * it from the shared `AssignClassPicker` selection. `classIds` and
   * `periodNames` are denormalised outputs the caller computes via
   * `deriveSessionTargetsFromRosters(selectedRosters)`:
   *
   * - `classIds`: ClassLink `sourcedId`s drawn from the selected rosters'
   *   `classlinkClassId` metadata. Drives the student SSO gate
   *   (`passesStudentClassGate` in firestore.rules). `classIds[0]` is also
   *   mirrored onto the session's legacy `classId` field so pre-Phase-5A
   *   rules keep working.
   * - `periodNames`: roster names (de-duped) used for the student app's
   *   post-PIN period picker.
   * - `rosterIds`: written onto the session doc for reverse lookup.
   *
   * All three are optional and independent for backwards compatibility
   * with callers that still target the legacy shapes directly.
   */
  createSession: (
    activity: VideoActivityData,
    teacherUid: string,
    allowedPins?: string[],
    settings?: Partial<VideoActivitySessionSettings>,
    assignmentName?: string,
    classIds?: string[],
    periodNames?: string[],
    rosterIds?: string[],
    /** Org-wide assignment mode frozen onto the session. Defaults to
     *  `'submissions'`. */
    mode?: AssignmentMode,
    /** Map of ClassLink classId -> period name. Lets the SSO student-app
     *  auto-join path resolve the joining student's period without a
     *  picker. Optional; falls back to `periodNames[0]` when absent. */
    classPeriodByClassId?: Record<string, string>
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
  /**
   * Real-time snapshot of the session document the responses listener is
   * scoped to. Populated by `subscribeToSession`. Lets the live monitor
   * reflect pause/resume state changes without an extra fetch round-trip.
   */
  liveSession: VideoActivitySession | null;
  /**
   * Subscribe to a specific session's session doc + responses subcollection.
   * Cleans up any previous listeners.
   */
  subscribeToSession: (sessionId: string) => void;
  /** Unsubscribe from the current session listeners. */
  unsubscribeFromSession: () => void;
  loading: boolean;
}

export const useVideoActivitySessionTeacher =
  (): UseVideoActivitySessionTeacherResult => {
    const [sessions, setSessions] = useState<VideoActivitySession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [responses, setResponses] = useState<VideoActivityResponse[]>([]);
    const [liveSession, setLiveSession] = useState<VideoActivitySession | null>(
      null
    );
    const [loading, setLoading] = useState(false);
    const unsubRef = useRef<Unsubscribe | null>(null);
    const sessionDocUnsubRef = useRef<Unsubscribe | null>(null);
    const sessionsUnsubRef = useRef<Unsubscribe | null>(null);

    const createSession = useCallback(
      async (
        activity: VideoActivityData,
        teacherUid: string,
        allowedPins: string[] = [],
        settings?: Partial<VideoActivitySessionSettings>,
        assignmentName?: string,
        classIds: string[] = [],
        periodNames: string[] = [],
        rosterIds: string[] = [],
        mode: AssignmentMode = 'submissions',
        classPeriodByClassId?: Record<string, string>
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
          // Phase 5A: multi-class ClassLink targeting + post-PIN period
          // picker support. `classIds` is authoritative; `classId` is
          // transitionally mirrored to `classIds[0]` so pre-Phase-5A
          // Firestore rules keep gating correctly.
          ...(classIds.length > 0 ? { classIds, classId: classIds[0] } : {}),
          ...(periodNames.length > 0 ? { periodNames } : {}),
          ...(rosterIds.length > 0 ? { rosterIds } : {}),
          ...(classPeriodByClassId &&
          Object.keys(classPeriodByClassId).length > 0
            ? { classPeriodByClassId }
            : {}),
          mode,
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
      // Clean up any existing listeners before creating new ones
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
      if (sessionDocUnsubRef.current) {
        sessionDocUnsubRef.current();
        sessionDocUnsubRef.current = null;
      }

      // Clear stale state from any prior subscription so consumers don't
      // briefly render the previous session's roster / status while the
      // first snapshot for the new session is in flight.
      setResponses([]);
      setLiveSession(null);
      setLoading(true);
      unsubRef.current = onSnapshot(
        collection(db, SESSIONS_COLLECTION, sessionId, RESPONSES_SUBCOLLECTION),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as VideoActivityResponse);
          setResponses(list);
          setLoading(false);
        },
        (err) => {
          logError('useVideoActivitySessionTeacher.responsesListener', err, {
            sessionId,
          });
          setLoading(false);
        }
      );

      // Mirror the session doc so consumers (e.g. the live monitor) reflect
      // pause/resume state changes in real time.
      sessionDocUnsubRef.current = onSnapshot(
        doc(db, SESSIONS_COLLECTION, sessionId),
        (snap) => {
          if (snap.exists()) {
            setLiveSession(
              normalizeSession(
                snap.id,
                snap.data() as Partial<VideoActivitySession>
              )
            );
          } else {
            setLiveSession(null);
          }
        },
        (err) => {
          logError('useVideoActivitySessionTeacher.sessionDocListener', err, {
            sessionId,
          });
        }
      );
    }, []);

    const unsubscribeFromSession = useCallback(() => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
      if (sessionDocUnsubRef.current) {
        sessionDocUnsubRef.current();
        sessionDocUnsubRef.current = null;
      }
      setResponses([]);
      setLiveSession(null);
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
        if (sessionDocUnsubRef.current) {
          sessionDocUnsubRef.current();
          sessionDocUnsubRef.current = null;
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
      liveSession,
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
  /**
   * Look up a session by id without creating a response — used by the
   * student-app join flow to decide whether to show a post-PIN period
   * picker before committing the join.
   */
  lookupSession: (sessionId: string) => Promise<VideoActivitySession | null>;
  /**
   * Join a session and create the response document.
   *
   * Calling conventions mirror `useQuizSession.joinQuizSession`:
   *   - Anonymous PIN students:  pass `pin` and `classPeriod`. Response
   *     doc is keyed `pin-{period}-{pin}` so the same PIN in different
   *     periods doesn't collide and attempt limits survive device resets.
   *   - SSO `studentRole` joiners: pass `pin = undefined`. The hook reads
   *     the auth UID and keys the response doc by it. `classPeriod` is
   *     derived from `session.classPeriodByClassId` if available.
   *
   * The student's name is no longer collected — Results UI uses
   * `useAssignmentPseudonyms` for display.
   */
  joinSession: (
    sessionId: string,
    pin: string | undefined,
    classPeriod?: string
  ) => Promise<void>;
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

    const lookupSession = useCallback(
      async (targetSessionId: string): Promise<VideoActivitySession | null> => {
        try {
          const snap = await getDoc(
            doc(db, SESSIONS_COLLECTION, targetSessionId)
          );
          if (!snap.exists()) return null;
          return snap.data() as VideoActivitySession;
        } catch (err) {
          console.error(
            '[useVideoActivitySessionStudent] lookupSession error:',
            err
          );
          return null;
        }
      },
      []
    );

    const joinSession = useCallback(
      async (
        targetSessionId: string,
        studentPin: string | undefined,
        classPeriod?: string
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

          const currentUser = auth.currentUser;
          if (!currentUser) {
            setJoinStatus('error');
            setError('Authentication required. Please refresh and try again.');
            return;
          }

          const isAnonymous = currentUser.isAnonymous;

          // Anonymous (PIN) joiners must supply a PIN and pass the allowedPins
          // gate. SSO joiners (studentRole custom-token users) skip both checks
          // — they're identified by their auth UID, not by a roster PIN.
          if (isAnonymous) {
            if (!studentPin || studentPin.trim().length === 0) {
              setJoinStatus('error');
              setError('A roster PIN is required to join this activity.');
              return;
            }
            if (
              sessionData.allowedPins.length > 0 &&
              !sessionData.allowedPins.includes(studentPin)
            ) {
              setJoinStatus('pin-rejected');
              setError('Incorrect PIN. Please check with your teacher.');
              return;
            }
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

          // Compute the deterministic response-doc key. Anonymous joiners get
          // `pin-{period}-{pin}` so the same PIN in different periods stays
          // distinct and attempt limits survive a device wipe; SSO joiners
          // get `auth.uid`. `computeResponseKey` is the canonical helper —
          // shared with the Quiz student app.
          const responseDocKey = computeResponseKey(
            currentUser.uid,
            isAnonymous,
            studentPin ?? '',
            classPeriod
          );

          const responseRef = doc(
            db,
            SESSIONS_COLLECTION,
            targetSessionId,
            RESPONSES_SUBCOLLECTION,
            responseDocKey
          );
          const existingSnap = await getDoc(responseRef);

          if (!existingSnap.exists()) {
            const newResponse: VideoActivityResponse = {
              studentUid: currentUser.uid,
              joinedAt: Date.now(),
              answers: [],
              completedAt: null,
              score: null,
              ...(studentPin ? { pin: studentPin } : {}),
              ...(classPeriod ? { classPeriod } : {}),
            };
            await setDoc(responseRef, newResponse);
          }

          setSessionId(targetSessionId);
          setResponseDocId(responseDocKey);
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
      lookupSession,
      joinSession,
      submitAnswer,
      completeActivity,
    };
  };
