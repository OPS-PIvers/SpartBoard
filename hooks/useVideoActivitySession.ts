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
  increment,
  runTransaction,
  Unsubscribe,
  query,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  computeResponseKey,
  encodeResponseKeySegment,
  AttemptLimitReachedError,
} from '@/hooks/useQuizSession';
import { normalizeVideoActivitySession } from '@/utils/videoActivityNormalize';
import {
  AssignmentMode,
  VideoActivitySession,
  VideoActivityResponse,
  VideoActivityAttemptLedger,
  VideoActivityData,
  VideoActivityAnswer,
  VideoActivitySessionSettings,
  VideoActivitySessionOptions,
} from '@/types';

const SESSIONS_COLLECTION = 'video_activity_sessions';
const RESPONSES_SUBCOLLECTION = 'responses';
/**
 * Top-level cross-launch attempt ledger for Video Activity. Mirrors the Quiz
 * ledger — see `QUIZ_ATTEMPT_LEDGER_COLLECTION` in `useQuizSession.ts`. Scoped
 * per (assignment, student): keyed by the session id (= assignmentId), NOT the
 * activity template, so each assignment built from an activity is independently
 * completable.
 */
const VIDEO_ACTIVITY_ATTEMPT_LEDGER_COLLECTION =
  'video_activity_attempt_ledger';

function videoActivityLedgerKey(
  assignmentId: string,
  studentUid: string
): string {
  return `${assignmentId}__${studentUid}`;
}

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
    classPeriodByClassId?: Record<string, string>,
    /** Assignment-policy options (security, feedback, attempt limits,
     *  scoring). Optional — when omitted the session doc carries player-
     *  behavior settings only and grading falls back to legacy semantics. */
    sessionOptions?: VideoActivitySessionOptions
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
  /**
   * Unlock a student's locked/auto-submitted response so they can resume
   * the in-flight attempt. Preserves `answers`, refunds one
   * `completedAttempts` on both the response and the cross-launch
   * ledger, and stamps `unlocked: true` + `unlockedAt` so the
   * student-side visibility handler finalizes the attempt on the next
   * tab-switch without showing the "Warning N of 3" modal.
   *
   * `responseKey` is the Firestore doc key — pass the row's
   * `_responseKey` (snapshot doc id), not `studentUid`.
   */
  unlockStudentAttempt: (
    sessionId: string,
    responseKey: string
  ) => Promise<void>;
  loading: boolean;
  /**
   * Set when either the responses or session-doc `onSnapshot` listener armed
   * by `subscribeToSession` fires its error callback (permission/network
   * failure). Cleared on a successful (re)subscribe. Lets consumers surface a
   * terminal error state instead of spinning on "Loading…" forever.
   */
  error: string | null;
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
    const [error, setError] = useState<string | null>(null);
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
        classPeriodByClassId?: Record<string, string>,
        sessionOptions?: VideoActivitySessionOptions
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
          ...(sessionOptions ? { sessionOptions } : {}),
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
                return normalizeVideoActivitySession(sessionDoc.id, data);
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
      // Clear any error from a prior subscription — we're (re)arming the
      // listeners and shouldn't carry a stale failure into the new session.
      setError(null);
      unsubRef.current = onSnapshot(
        collection(db, SESSIONS_COLLECTION, sessionId, RESPONSES_SUBCOLLECTION),
        (snap) => {
          // Carry the Firestore doc id through as `_responseKey` so the
          // live monitor can target the actual response doc when invoking
          // teacher actions (e.g. unlock) — for PIN joiners the key is
          // `pin-{period}-{pin}` and differs from `studentUid`.
          const list = snap.docs.map(
            (d) =>
              ({
                ...(d.data() as VideoActivityResponse),
                _responseKey: d.id,
              }) as VideoActivityResponse
          );
          setResponses(list);
          setLoading(false);
        },
        (err) => {
          logError('useVideoActivitySessionTeacher.responsesListener', err, {
            sessionId,
          });
          setLoading(false);
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load session responses.'
          );
        }
      );

      // Mirror the session doc so consumers (e.g. the live monitor) reflect
      // pause/resume state changes in real time.
      sessionDocUnsubRef.current = onSnapshot(
        doc(db, SESSIONS_COLLECTION, sessionId),
        (snap) => {
          if (snap.exists()) {
            setLiveSession(
              normalizeVideoActivitySession(
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
          setError(
            err instanceof Error ? err.message : 'Failed to load session.'
          );
        }
      );
    }, []);

    const unlockStudentAttempt = useCallback(
      async (sessionId: string, responseKey: string): Promise<void> => {
        const responseRef = doc(
          db,
          SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_SUBCOLLECTION,
          responseKey
        );
        const snap = await getDoc(responseRef);
        if (!snap.exists()) {
          // Snapshot races: the row was already removed by the time the
          // teacher clicked. Surface as an error so the monitor can
          // toast — silent success would be misleading.
          throw new Error(
            'Student response not found — they may have already been removed or rejoined.'
          );
        }
        const existing = snap.data() as VideoActivityResponse;

        const currentAttempts = existing.completedAttempts ?? 0;
        const refundedAttempts = Math.max(0, currentAttempts - 1);

        // Probe the ledger BEFORE writing so we don't blindly create a
        // partial doc via `set(merge:true)` on a missing ledger entry
        // (which would land without the required identity fields). For
        // anonymous-PIN students or any student whose cross-launch ledger
        // hasn't been touched yet there's simply nothing to refund. Keyed by
        // the session id (= assignmentId), matching the student's write.
        const ledgerRef =
          sessionId && existing.studentUid
            ? doc(
                db,
                VIDEO_ACTIVITY_ATTEMPT_LEDGER_COLLECTION,
                videoActivityLedgerKey(sessionId, existing.studentUid)
              )
            : null;
        const ledgerSnap = ledgerRef ? await getDoc(ledgerRef) : null;

        const batch = writeBatch(db);
        // `completedAt: null` is the canonical "not finished" signal for
        // VA. Without this the student-side visibility handler bails
        // out on `myResponse?.completedAt != null` and the
        // instant-finalize-on-next-strike rule never engages.
        batch.update(responseRef, {
          completedAt: null,
          score: null,
          completedAttempts: refundedAttempts,
          unlocked: true,
          unlockedAt: Date.now(),
        });
        if (ledgerRef && ledgerSnap?.exists()) {
          const ledgerCurrent =
            (ledgerSnap.data() as VideoActivityAttemptLedger | undefined)
              ?.completedAttempts ?? 0;
          batch.update(ledgerRef, {
            completedAttempts: Math.max(0, ledgerCurrent - 1),
          });
        }
        await batch.commit();
      },
      []
    );

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
      setError(null);
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
      unlockStudentAttempt,
      loading,
      error,
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
  /**
   * Atomically increment the student's `tabSwitchWarnings` counter on
   * the response doc and return the new total. The student-side
   * visibility tracker calls this from the `visibilitychange` / `blur`
   * handler. Mirrors `useQuizSession.reportTabSwitch`.
   */
  reportTabSwitch: () => Promise<number>;
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
    // responseDocId is the deterministic Firestore doc id for the student's
    // response — `auth.uid` for SSO `studentRole` joiners, or
    // `pin-{period}-{pin}` for anonymous PIN joiners. Computed at join time
    // via `computeResponseKey`; see `useQuizSession.ts`.
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
          logError('useVideoActivitySessionStudent.sessionListener', err, {
            sessionId,
          });
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
          logError('useVideoActivitySessionStudent.responseListener', err, {
            sessionId,
            responseDocId,
          });
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
          logError('useVideoActivitySessionStudent.lookupSession', err, {
            sessionId: targetSessionId,
          });
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

          // `let` because the Phase 3 PIN→SSO bridge below may swap the
          // signed-in user via `signInWithCustomToken`, after which we
          // re-bind `currentUser` and `isAnonymous` to the new identity
          // before the rest of the function reads them.
          let currentUser = auth.currentUser;
          if (!currentUser) {
            setJoinStatus('error');
            setError('Authentication required. Please refresh and try again.');
            return;
          }

          let isAnonymous = currentUser.isAnonymous;

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

          // Phase 3 — PIN→SSO identity bridge. Mirrors `useQuizSession`.
          // When an anonymous PIN joiner lands on a rostered VA session,
          // upgrade them to a custom-token sign-in whose uid matches the
          // SSO pseudonym. After the swap, the per-session response key
          // converges with the SSO key for the same student. Falls
          // through silently to the legacy anonymous PIN flow on any
          // miss (no pin_index entry, callable error).
          const sessionHasRosters =
            Array.isArray(sessionData.rosterIds) &&
            sessionData.rosterIds.length > 0;
          if (
            isAnonymous &&
            studentPin &&
            studentPin.length > 0 &&
            sessionHasRosters
          ) {
            try {
              const callable = httpsCallable<
                {
                  kind: 'video-activity';
                  sessionId: string;
                  pin: string;
                  period?: string;
                },
                { matched: boolean; customToken?: string; reason?: string }
              >(functions, 'pinLoginV1');
              const res = await callable({
                kind: 'video-activity',
                sessionId: targetSessionId,
                pin: studentPin,
                period: classPeriod,
              });
              if (res.data.matched && res.data.customToken) {
                await signInWithCustomToken(auth, res.data.customToken);
                const refreshed = auth.currentUser;
                if (refreshed) {
                  currentUser = refreshed;
                  isAnonymous = refreshed.isAnonymous;
                }
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
              const code =
                err && typeof err === 'object' && 'code' in err
                  ? (err as { code?: unknown }).code
                  : undefined;
              const expected = code === 'not-found' || code === 'unavailable';
              const safeErr =
                err instanceof Error ? err : new Error(String(err));
              if (expected) {
                logError(
                  'useVideoActivitySessionStudent.pinLoginBridge.expected',
                  safeErr,
                  { sessionId: targetSessionId, code: String(code) }
                );
              } else {
                console.error(
                  '[useVideoActivitySessionStudent.pinLoginBridge] unexpected failure — falling back to anonymous PIN flow:',
                  safeErr
                );
                logError(
                  'useVideoActivitySessionStudent.pinLoginBridge.unexpected',
                  safeErr,
                  { sessionId: targetSessionId }
                );
              }
            }
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

          // Defense against the encoder's `'default'` fallback. The PIN
          // segment is the per-student field, so any all-special-character
          // input collapses to `'default'` and two such students in the
          // same period collide on the same doc — a much more reachable
          // shape than both-segments-default. Surface a user-facing error
          // instead. (Period defaulting alone is harmless because there's
          // only one period bucket per session.)
          if (
            isAnonymous &&
            encodeResponseKeySegment(studentPin) === 'default'
          ) {
            setJoinStatus('error');
            setError(
              'Your PIN is in an unsupported format. Please check the PIN your teacher gave you.'
            );
            return;
          }

          // Probe the deterministic key first. If nothing's there AND the
          // caller is anonymous, also probe a legacy `auth.uid`-keyed doc
          // (the pre-PR1 keying scheme) so an in-flight student rejoining
          // after deploy resumes their existing response instead of starting
          // a fresh one. SSO joiners are unaffected — their `auth.uid` is
          // both the new key and the legacy key. The legacy probe is
          // skipped when we already found the new doc, so the steady-state
          // path stays one read.
          const responseRef = doc(
            db,
            SESSIONS_COLLECTION,
            targetSessionId,
            RESPONSES_SUBCOLLECTION,
            responseDocKey
          );
          let effectiveResponseRef = responseRef;
          let existingSnap = await getDoc(responseRef);

          if (
            !existingSnap.exists() &&
            isAnonymous &&
            responseDocKey !== currentUser.uid
          ) {
            const legacyRef = doc(
              db,
              SESSIONS_COLLECTION,
              targetSessionId,
              RESPONSES_SUBCOLLECTION,
              currentUser.uid
            );
            const legacySnap = await getDoc(legacyRef);
            if (legacySnap.exists()) {
              effectiveResponseRef = legacyRef;
              existingSnap = legacySnap;
            }
          }

          // Cross-launch attempt cap (Phase 2). Only meaningful for
          // non-anonymous (SSO/studentRole) joiners — see the matching
          // comment in `useQuizSession.joinQuizSession` for the rationale.
          let ledgerCompleted = 0;
          if (!isAnonymous) {
            // Keyed by session id (= assignmentId) so the cap is per
            // assignment, not per activity template.
            const ledgerRef = doc(
              db,
              VIDEO_ACTIVITY_ATTEMPT_LEDGER_COLLECTION,
              videoActivityLedgerKey(targetSessionId, currentUser.uid)
            );
            const ledgerSnap = await getDoc(ledgerRef).catch((err: unknown) => {
              logError(
                'useVideoActivitySessionStudent.ledgerRead',
                err as Error,
                {
                  sessionId: targetSessionId,
                  studentUid: currentUser.uid,
                }
              );
              return null;
            });
            if (ledgerSnap?.exists()) {
              const ledger = ledgerSnap.data() as VideoActivityAttemptLedger;
              ledgerCompleted = ledger.completedAttempts ?? 0;
            }
          }

          const limit = sessionData.sessionOptions?.attemptLimit ?? null;

          if (existingSnap.exists()) {
            const existing = existingSnap.data() as VideoActivityResponse;
            // Attempt-limit enforcement on rejoin.
            //   - `attemptLimit == null/undefined` means unlimited.
            //   - VA tracks completion via `completedAt != null` (no
            //     `status` field), so any prior completion is treated as
            //     ≥1 completed attempt even if the counter literally reads
            //     0 (legacy docs that submitted before the counter was
            //     wired up).
            //   - The ledger augments this with cross-launch state: a
            //     student who completed an earlier launch shows up here
            //     with `ledgerCompleted >= limit` even though the new
            //     session's response doc is fresh.
            //   - Under the cap, reset the doc to a fresh attempt
            //     (`completedAt: null, answers: []`); preserve
            //     `completedAttempts` so future joins still see the cap.
            if (existing.completedAt != null && existing.unlocked) {
              // Teacher-unlocked: resume the existing attempt with the
              // prior `answers` intact. The unlock action already clears
              // `completedAt`, so this branch handles the safety-net
              // case where a Firestore propagation lag leaves the
              // student's tab seeing the old `completedAt` value.
              await updateDoc(effectiveResponseRef, {
                completedAt: null,
                ...(classPeriod && existing.classPeriod !== classPeriod
                  ? { classPeriod }
                  : {}),
              }).catch((err: unknown) =>
                logError(
                  'useVideoActivitySessionStudent.update-resume-unlocked',
                  err as Error,
                  {
                    sessionId: targetSessionId,
                    responseDocId: responseDocKey,
                    studentUid: existing.studentUid,
                  }
                )
              );
            } else if (existing.completedAt != null) {
              const completed = Math.max(
                existing.completedAttempts ?? 0,
                ledgerCompleted,
                1
              );
              if (limit !== null && completed >= limit) {
                throw new AttemptLimitReachedError();
              }
              await updateDoc(effectiveResponseRef, {
                completedAt: null,
                answers: [],
                ...(classPeriod && existing.classPeriod !== classPeriod
                  ? { classPeriod }
                  : {}),
              });
            }
          } else if (limit !== null && ledgerCompleted >= limit) {
            // No response doc for this session yet, but the ledger says
            // the student is already at/past the cap. This is the SSO
            // student who completed an earlier launch and has now opened
            // a new launch — without this branch the create path below
            // would give them a fresh response and the per-session
            // counter would let them submit again. See the Quiz mirror
            // in `useQuizSession.joinQuizSession`.
            throw new AttemptLimitReachedError();
          } else {
            // Initialize `completedAttempts` and `tabSwitchWarnings` to 0 so
            // the Firestore rules' monotonic-growth check on update has a
            // concrete prior value to compare against (otherwise
            // `resource.data.completedAttempts` is missing on first write
            // and `.size()`/comparison would throw). Mirrors the Quiz
            // create-time initialization.
            const newResponse: VideoActivityResponse = {
              studentUid: currentUser.uid,
              joinedAt: Date.now(),
              answers: [],
              completedAt: null,
              score: null,
              completedAttempts: 0,
              tabSwitchWarnings: 0,
              ...(studentPin ? { pin: studentPin } : {}),
              ...(classPeriod ? { classPeriod } : {}),
            };
            await setDoc(effectiveResponseRef, newResponse);
          }

          setSessionId(targetSessionId);
          // When a legacy doc was found we resume against its id (the
          // student's auth.uid) rather than the deterministic key — the
          // listener path keeps tracking the doc that actually has their
          // answers. New writes always go to `effectiveResponseRef`.
          setResponseDocId(effectiveResponseRef.id);
          setSession(sessionData);
          setJoinStatus('joined');
        } catch (err) {
          logError('useVideoActivitySessionStudent.joinSession', err, {
            sessionId: targetSessionId,
          });
          setJoinStatus('error');
          // Preserve the cap-reached message so students know to ask the
          // teacher rather than seeing the generic "try again" copy.
          // Branched on the typed sentinel (not the message) so future
          // copy edits don't silently break the discrimination.
          if (err instanceof AttemptLimitReachedError) {
            setError(err.message);
          } else {
            setError('Failed to join the session. Please try again.');
          }
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

      // Resolve the cross-launch ledger ref (Phase 2). Same identity
      // caveat as the Quiz hook — only meaningful for non-anonymous
      // joiners until Phase 3 unifies the PIN flow's uid space.
      const studentUid = auth.currentUser?.uid ?? null;
      const isAnonymous = auth.currentUser?.isAnonymous ?? true;
      const activityId = session?.activityId ?? null;
      const teacherUid = session?.teacherUid ?? null;
      const writeLedger =
        !isAnonymous &&
        typeof studentUid === 'string' &&
        studentUid.length > 0 &&
        // `sessionId` is the ledger key (per-assignment scope); `activityId`
        // stays as a metadata field the rules require, so both must be present.
        typeof sessionId === 'string' &&
        sessionId.length > 0 &&
        typeof activityId === 'string' &&
        activityId.length > 0 &&
        typeof teacherUid === 'string' &&
        teacherUid.length > 0;
      const ledgerRef = writeLedger
        ? doc(
            db,
            VIDEO_ACTIVITY_ATTEMPT_LEDGER_COLLECTION,
            videoActivityLedgerKey(sessionId, studentUid)
          )
        : null;

      // Wrap completion in a transaction so the "already-completed?"
      // check, the response timestamp/counter writes, and the ledger
      // increment are all atomic. Two concurrent completeActivity calls
      // (rapid double-click, two browser tabs) would otherwise both write
      // `completedAt` and double-increment both counters, bypassing the
      // cap. If the doc is already completed, no-op (idempotent — VA
      // student-side has no error toast for repeated completes).
      //
      // Ledger atomicity: same trade-off as `completeQuiz` — the ledger
      // write is NOT best-effort. A ledger-rule failure rolls the whole
      // transaction back so we never accept a submit without recording
      // the attempt against the cross-launch cap.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(responseRef);
        if (!snap.exists()) return;
        const existing = snap.data() as VideoActivityResponse;
        if (existing.completedAt != null) return;

        // All reads before all writes (Firestore transaction rule).
        const ledgerSnap = ledgerRef ? await tx.get(ledgerRef) : null;

        const completedAt = Date.now();
        // Same deploy-gap defense as `completeQuiz`: include `unlocked`
        // in the payload only when the doc actually carries the flag,
        // so submissions land successfully during the hosting-deployed-
        // before-rules window in production
        // (.github/workflows/firebase-deploy.yml).
        const responseUpdates: Record<string, unknown> = {
          completedAt,
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
              lastAttemptAt: completedAt,
              lastSessionId: sessionId,
            });
          } else {
            const newLedger: VideoActivityAttemptLedger = {
              activityId: activityId as string,
              studentUid: studentUid as string,
              teacherUid: teacherUid as string,
              completedAttempts: 1,
              lastAttemptAt: completedAt,
              lastSessionId: sessionId,
            };
            tx.set(ledgerRef, newLedger);
          }
        }
      });
    }, [sessionId, responseDocId, session?.activityId, session?.teacherUid]);

    // Track the latest response value in a ref so `reportTabSwitch` can
    // read the current counter without re-binding (and re-attaching the
    // visibility listener on every snapshot).
    const myResponseRef = useRef<VideoActivityResponse | null>(null);
    myResponseRef.current = myResponse;
    const warningCountRef = useRef(0);
    // Server-side counter is the source of truth; clamp to the higher
    // of the two so a stale snapshot in flight doesn't roll back the
    // local view briefly. Idempotent across re-renders, so we mutate the
    // ref directly in the render body instead of paying for an effect.
    warningCountRef.current = Math.max(
      warningCountRef.current,
      myResponse?.tabSwitchWarnings ?? 0
    );

    const reportTabSwitch = useCallback(async (): Promise<number> => {
      if (!sessionId || !responseDocId) return warningCountRef.current;
      const responseRef = doc(
        db,
        SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_SUBCOLLECTION,
        responseDocId
      );
      const baseCount = Math.max(
        warningCountRef.current,
        myResponseRef.current?.tabSwitchWarnings ?? 0
      );
      try {
        await updateDoc(responseRef, {
          tabSwitchWarnings: increment(1),
        });
      } catch (err) {
        // Re-throw (matching `useQuizSession.reportTabSwitch`) so the
        // caller's catch handles it without silently advancing the
        // local counter into a server-divergent state. Without this,
        // a chain of failed writes would push the local count to ≥3
        // and trigger an auto-submit while the server still shows 0
        // warnings.
        logError('useVideoActivitySessionStudent.reportTabSwitch', err, {
          sessionId,
          responseDocId,
        });
        throw err;
      }
      const newCount = baseCount + 1;
      warningCountRef.current = newCount;
      return newCount;
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
      reportTabSwitch,
    };
  };
