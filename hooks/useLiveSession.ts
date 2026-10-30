import { useState, useEffect, useCallback, useReducer } from 'react';
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  collection,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { LiveSession, LiveStudent, WidgetType, WidgetConfig } from '@/types';
import {
  deriveLiveSessionState,
  initialLiveSessionState,
  liveSessionReducer,
  startKind,
  type StudentConnection,
} from '@/utils/liveSessionState';

// Constants for Firestore Paths
const SESSIONS_COLLECTION = 'sessions';
const STUDENTS_COLLECTION = 'students';
// Join code -> owning teacher (firestore.rules: create-if-absent, one owner per code).
const CODES_COLLECTION = 'live_session_codes';

const MAX_PIN_LENGTH = 10; // Prevent storage abuse; the sibling #2625 rules-hardening PR adds a matching (not yet merged) server-side size() cap — keep both in sync once it lands

/** Unique 6-char join code generator with collision check against claimed codes. */
async function allocateSessionCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()
      .padEnd(6, '0');
    const snap = await getDoc(doc(db, CODES_COLLECTION, candidate));
    if (!snap.exists()) return candidate;
  }
  // Last-resort fallback: an unchecked code (a claimed one fails the start batch).
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()
    .padEnd(6, '0');
}

const isPermissionDenied = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  err.code === 'permission-denied';

/** Claims this teacher's live code if it has no pointer yet (a session from before pointers). */
async function claimOwnCode(teacherUid: string, code: string): Promise<void> {
  const ref = doc(db, CODES_COLLECTION, code);
  const pointer = await getDoc(ref);
  if (pointer.exists()) return;
  await setDoc(ref, { teacherUid, createdAt: Date.now() });
}

/**
 * Custom hook for managing live classroom sessions.
 * Supports both teacher and student roles with different behaviors:
 *
 * **Teacher Mode** (`role: 'teacher'`):
 * - Creates and manages live sessions
 * - Broadcasts widget state to students
 * - Controls freeze state (global and per-student)
 * - Monitors connected students
 *
 * **Student Mode** (`role: 'student'`):
 * - Joins sessions via join code
 * - Receives real-time updates of active widget
 * - Responds to freeze commands from teacher
 * - Maintains connection status
 *
 * @param userId - The authenticated user's ID (required for teachers, undefined for students)
 * @param role - Either 'teacher' or 'student' to determine behavior
 * @param joinCode - Optional join code for students to connect to a session
 *
 * @returns {Object} Hook state and actions:
 * - `session`: Current live session data (null if no active session)
 * - `students`: Array of connected students (teacher mode only)
 * - `loading`: Whether initial data is being loaded
 * - `studentId`: The student's unique ID (student mode only)
 * - `individualFrozen`: Whether this student is individually frozen (student mode only)
 * - `joinSession`: Function to join a session with name and code (student mode)
 * - `startSession`: Function to start a new live session (teacher mode)
 * - `updateSessionConfig`: Function to update active widget config (teacher mode)
 * - `updateSessionBackground`: Function to update session background in real-time (teacher mode)
 * - `endSession`: Function to end the current session (teacher mode)
 * - `leaveSession`: Function for students to disconnect from a session (student mode)
 * - `removeStudent`: Function to manually remove a student from session (teacher mode)
 * - `toggleFreezeStudent`: Function to freeze/unfreeze a student (teacher mode)
 * - `toggleGlobalFreeze`: Function to freeze/unfreeze all students (teacher mode)
 *
 * @example
 * // Teacher creating a session
 * const { session, students, startSession, endSession } = useLiveSession(userId, 'teacher');
 *
 * @example
 * // Student joining a session
 * const { session, loading, joinSession, individualFrozen } = useLiveSession(undefined, 'student', code);
 */
export interface UseLiveSessionResult {
  session: LiveSession | null;
  students: LiveStudent[];
  loading: boolean;
  startSession: (
    widgetId: string,
    widgetType: WidgetType,
    config?: WidgetConfig,
    background?: string
  ) => Promise<LiveSession>;
  updateSessionConfig: (config: WidgetConfig) => Promise<void>;
  updateSessionBackground: (background: string) => Promise<void>;
  endSession: () => Promise<void>;
  leaveSession: () => Promise<void>;
  removeStudent: (studentId: string) => Promise<void>;
  toggleFreezeStudent: (
    studentId: string,
    currentStatus: 'active' | 'frozen' | 'disconnected'
  ) => Promise<void>;
  toggleGlobalFreeze: (freeze: boolean) => Promise<void>;
  joinSession: (pin: string, unsanitizedCode: string) => Promise<string>;
  studentId: string | null;
  studentPin: string | null;
  individualFrozen: boolean;
  connection: StudentConnection;
}

export const useLiveSession = (
  userId: string | undefined,
  role: 'teacher' | 'student',
  joinCode?: string,
  canAccess: boolean = true
): UseLiveSessionResult => {
  const [state, dispatch] = useReducer(liveSessionReducer, undefined, () =>
    initialLiveSessionState(role, joinCode)
  );
  const { session, loading, students, connection } = state;
  const studentId = connection.kind === 'joined' ? connection.studentId : null;
  const studentPin = connection.kind === 'joined' ? connection.pin : null;
  const individualFrozen = connection.kind === 'joined' && connection.frozen;

  // ⚡ REACT BEST PRACTICE: Adjusting state during rendering
  // We track prop/state changes that require resetting other state to prevent extra re-renders
  // and avoid the react-hooks/set-state-in-effect anti-pattern.
  const [prevDeps, setPrevDeps] = useState({
    role,
    userId,
    joinCode,
    isActive: session?.isActive,
  });

  if (
    role !== prevDeps.role ||
    userId !== prevDeps.userId ||
    joinCode !== prevDeps.joinCode ||
    session?.isActive !== prevDeps.isActive
  ) {
    // 1. Update the tracking state
    setPrevDeps({
      role,
      userId,
      joinCode,
      isActive: session?.isActive,
    });

    // 2. Synchronously adjust derived states
    const targetId = role === 'teacher' ? userId : joinCode;
    // A student switching codes drops the old session, so its widget can't show before the new one loads.
    const switchedCode =
      role !== 'teacher' &&
      !!prevDeps.joinCode &&
      joinCode !== prevDeps.joinCode;
    if (!targetId || switchedCode) dispatch({ type: 'targetCleared' });

    if (role !== 'teacher' || !userId || !session?.isActive) {
      dispatch({ type: 'rosterCleared' });
    }
  }

  // SESSION SUBSCRIPTION: Subscribe to session document (Teachers use userId, Students use joinCode)
  useEffect(() => {
    const targetId = role === 'teacher' ? userId : joinCode;
    if (!targetId) {
      return;
    }

    let isCurrent = true;
    const sessionRef = doc(db, SESSIONS_COLLECTION, targetId);

    const unsubscribeSession = onSnapshot(
      sessionRef,
      (docSnap) => {
        if (!isCurrent) return;
        dispatch({
          type: 'sessionSnapshot',
          session: docSnap.exists() ? (docSnap.data() as LiveSession) : null,
        });
      },
      (err) => {
        if (!isCurrent) return;
        console.error('Session subscription error:', err);
        dispatch({ type: 'sessionError' });
      }
    );

    return () => {
      isCurrent = false;
      unsubscribeSession();
    };
  }, [userId, joinCode, role]);

  // TEACHER: Subscribe to students (only when live)
  useEffect(() => {
    if (role !== 'teacher' || !userId || !session?.isActive) {
      return;
    }

    let isCurrent = true;
    const studentsRef = collection(
      db,
      SESSIONS_COLLECTION,
      userId,
      STUDENTS_COLLECTION
    );
    const unsubscribeStudents = onSnapshot(studentsRef, (snapshot) => {
      if (!isCurrent) return;
      const studentList = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as LiveStudent[];

      dispatch({ type: 'rosterSnapshot', students: studentList });
    });

    return () => {
      isCurrent = false;
      unsubscribeStudents();
    };
  }, [userId, role, session?.isActive]);

  // TEACHER: a live session from before pointers claims its code as soon as the tab sees it.
  const liveCode = role === 'teacher' && session?.isActive ? session.code : '';
  useEffect(() => {
    if (!userId || !liveCode) return;
    claimOwnCode(userId, liveCode).catch((err) => {
      console.error('Failed to claim live session code:', err);
    });
  }, [userId, liveCode]);

  // STUDENT: Subscribe to My Student Status (Am I individually frozen?)
  useEffect(() => {
    if (role !== 'student' || !joinCode || !studentId) {
      return;
    }

    let isCurrent = true;
    const myStudentRef = doc(
      db,
      SESSIONS_COLLECTION,
      joinCode,
      STUDENTS_COLLECTION,
      studentId
    );
    const unsubscribeStudent = onSnapshot(myStudentRef, (docSnap) => {
      if (!isCurrent) return;
      dispatch({
        type: 'myRecordSnapshot',
        studentId,
        record: docSnap.exists() ? (docSnap.data() as LiveStudent) : null,
      });
    });

    return () => {
      isCurrent = false;
      unsubscribeStudent();
    };
  }, [joinCode, role, studentId]);

  // --- ACTIONS ---

  const joinSession = async (pin: string, unsanitizedCode: string) => {
    // 1. Find session by Code with robust sanitization
    // Remove all non-alphanumeric characters and normalize to uppercase
    const normalizedCode = unsanitizedCode
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();

    if (!normalizedCode) {
      throw new Error('Invalid code format');
    }

    // Sanitize PIN (max length limit, simple trim)
    const sanitizedPin = pin.trim().substring(0, MAX_PIN_LENGTH);

    if (!sanitizedPin) {
      throw new Error('PIN is required');
    }

    // Students use their anonymous auth UID as the doc ID so rules can match it to the caller.
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Not authenticated — please wait and try again');
    }

    // The code's owner pointer names the only session it can resolve to.
    const pointer = await getDoc(doc(db, CODES_COLLECTION, normalizedCode));
    const teacherId = pointer.exists()
      ? (pointer.data() as { teacherUid?: string }).teacherUid
      : undefined;
    if (!teacherId) {
      throw new Error('Session not found');
    }

    // The session is readable only once this join record (carrying the live code) exists.
    const studentsRef = collection(
      db,
      SESSIONS_COLLECTION,
      teacherId,
      STUDENTS_COLLECTION
    );
    const newStudent: Omit<LiveStudent, 'id'> = {
      pin: sanitizedPin,
      status: 'active',
      joinedAt: Date.now(),
      lastActive: Date.now(),
      code: normalizedCode,
    };

    // Rules refuse the record when the session isn't live on this code.
    await setDoc(doc(studentsRef, uid), newStudent).catch((err: unknown) => {
      if (isPermissionDenied(err)) throw new Error('Session not found');
      throw err;
    });
    dispatch({ type: 'joined', studentId: uid, pin: sanitizedPin });
    return teacherId;
  };

  const leaveSession = useCallback(async () => {
    if (role !== 'student' || !joinCode || !studentId) return;
    const studentRef = doc(
      db,
      SESSIONS_COLLECTION,
      joinCode,
      STUDENTS_COLLECTION,
      studentId
    );
    try {
      await updateDoc(studentRef, { status: 'disconnected' });
    } catch (err) {
      console.error('Failed to leave session:', err);
    } finally {
      dispatch({ type: 'left' });
    }
  }, [role, joinCode, studentId]);

  const removeStudent = useCallback(
    async (targetStudentId: string) => {
      if (role !== 'teacher' || !userId) return;
      const studentRef = doc(
        db,
        SESSIONS_COLLECTION,
        userId,
        STUDENTS_COLLECTION,
        targetStudentId
      );
      await deleteDoc(studentRef).catch((err) => {
        console.error(`Failed to remove student ${targetStudentId}:`, err);
      });
    },
    [role, userId]
  );

  const startSession = useCallback(
    async (
      widgetId: string,
      widgetType: WidgetType,
      config?: WidgetConfig,
      background?: string
    ) => {
      if (!userId) {
        throw new Error('Not authenticated');
      }

      const sessionRef = doc(db, SESSIONS_COLLECTION, userId);
      const current = await getDoc(sessionRef).catch((err) => {
        console.error('Failed to read current session:', err);
        return null;
      });
      const currentSession = current?.exists()
        ? (current.data() as LiveSession)
        : null;
      // Already live on another widget: switch the broadcast, keeping the roster and join code.
      if (
        currentSession &&
        startKind(deriveLiveSessionState(currentSession)) === 'switch'
      ) {
        if (currentSession.code) {
          await claimOwnCode(userId, currentSession.code).catch((err) => {
            console.error('Failed to claim live session code:', err);
          });
        }
        await updateDoc(sessionRef, {
          activeWidgetId: widgetId,
          activeWidgetType: widgetType,
          activeWidgetConfig: config ?? deleteField(),
          background: background ?? deleteField(),
          frozen: false,
        }).catch((err) => {
          console.error('Failed to switch live widget:', err);
          throw err;
        });
        const switched: LiveSession = {
          ...currentSession,
          id: userId,
          activeWidgetId: widgetId,
          activeWidgetType: widgetType,
          activeWidgetConfig: config,
          background,
          frozen: false,
        };
        return switched;
      }

      // Old students are listed now but cleared only once the fresh start commits.
      const studentsSnapshot = await getDocs(
        collection(db, SESSIONS_COLLECTION, userId, STUDENTS_COLLECTION)
      );

      const newSession: LiveSession = {
        id: userId,
        isActive: true,
        activeWidgetId: widgetId,
        activeWidgetType: widgetType,
        activeWidgetConfig: config,
        background: background,
        code: await allocateSessionCode(),
        frozen: false,
        createdAt: Date.now(),
      };
      const batch = writeBatch(db);
      batch.set(doc(db, CODES_COLLECTION, newSession.code), {
        teacherUid: userId,
        createdAt: newSession.createdAt,
      });
      batch.set(sessionRef, newSession);
      await batch.commit().catch((err) => {
        console.error('Failed to start session:', err);
        throw err;
      });
      await Promise.all(
        studentsSnapshot.docs.map((d) => deleteDoc(d.ref))
      ).catch((err) => {
        console.error('Failed to clear old students:', err);
      });
      if (currentSession?.code && currentSession.code !== newSession.code) {
        void deleteDoc(doc(db, CODES_COLLECTION, currentSession.code)).catch(
          () => undefined
        );
      }

      return newSession;
    },
    [userId]
  );

  const updateSessionConfig = useCallback(
    async (config: WidgetConfig) => {
      if (!userId) return;
      const sessionRef = doc(db, SESSIONS_COLLECTION, userId);
      await updateDoc(sessionRef, { activeWidgetConfig: config }).catch(
        (err) => {
          console.error('Failed to update session config:', err);
        }
      );
    },
    [userId]
  );

  const updateSessionBackground = useCallback(
    async (background: string) => {
      if (!userId) return;
      const sessionRef = doc(db, SESSIONS_COLLECTION, userId);
      await updateDoc(sessionRef, { background }).catch((err) => {
        console.error('Failed to update session background:', err);
      });
    },
    [userId]
  );

  const endSession = useCallback(async () => {
    if (!userId) return;
    const sessionRef = doc(db, SESSIONS_COLLECTION, userId);
    const ended = await getDoc(sessionRef).catch(() => null);
    const endedCode = ended?.exists()
      ? (ended.data() as LiveSession).code
      : undefined;
    // An ended session keeps no widget config (it can carry roster names).
    const endedOk = await updateDoc(sessionRef, {
      isActive: false,
      activeWidgetId: null,
      activeWidgetType: null,
      activeWidgetConfig: deleteField(),
      frozen: false,
    }).then(
      () => true,
      (err: unknown) => {
        console.error('Failed to end session:', err);
        return false;
      }
    );
    // Frees the code so a stale join by it reports "not found".
    if (endedOk && endedCode) {
      void deleteDoc(doc(db, CODES_COLLECTION, endedCode)).catch(
        () => undefined
      );
    }

    // Mark students as disconnected when session ends
    const studentsRef = collection(
      db,
      SESSIONS_COLLECTION,
      userId,
      STUDENTS_COLLECTION
    );
    const studentsSnapshot = await getDocs(studentsRef).catch((err) => {
      console.error('Failed to fetch students for disconnection:', err);
      return null;
    });

    if (studentsSnapshot) {
      const disconnectPromises = studentsSnapshot.docs.map((doc) =>
        updateDoc(doc.ref, { status: 'disconnected' }).catch((err) => {
          console.error(`Failed to disconnect student ${doc.id}:`, err);
        })
      );
      await Promise.all(disconnectPromises);
    }
  }, [userId]);

  // AUTO-END SESSION: If feature is disabled globally, end the session automatically
  useEffect(() => {
    if (role === 'teacher' && session?.isActive && !canAccess) {
      console.warn(
        '[LiveSession] Feature disabled globally. Ending session...'
      );
      void endSession();
    }
  }, [canAccess, session?.isActive, role, endSession]);

  const toggleFreezeStudent = useCallback(
    async (
      studentId: string,
      currentStatus: 'active' | 'frozen' | 'disconnected'
    ) => {
      if (!userId) return;
      const studentRef = doc(
        db,
        SESSIONS_COLLECTION,
        userId,
        STUDENTS_COLLECTION,
        studentId
      );
      await updateDoc(studentRef, {
        status: currentStatus === 'active' ? 'frozen' : 'active',
      }).catch((err) => {
        console.error(`Failed to toggle freeze for student ${studentId}:`, err);
      });
    },
    [userId]
  );

  const toggleGlobalFreeze = useCallback(
    async (freeze: boolean) => {
      if (!userId) return;
      const sessionRef = doc(db, SESSIONS_COLLECTION, userId);
      await updateDoc(sessionRef, { frozen: freeze }).catch((err) => {
        console.error('Failed to toggle global freeze:', err);
      });
    },
    [userId]
  );

  return {
    session,
    students,
    loading,
    startSession,
    updateSessionConfig,
    updateSessionBackground,
    endSession,
    leaveSession,
    removeStudent,
    toggleFreezeStudent,
    toggleGlobalFreeze,
    joinSession,
    studentId,
    studentPin,
    individualFrozen,
    connection,
  };
};
