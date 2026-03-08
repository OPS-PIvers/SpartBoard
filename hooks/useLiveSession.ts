import { useState, useEffect, useCallback } from 'react';
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  collection,
  deleteDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { LiveSession, LiveStudent, WidgetType, WidgetConfig } from '../types';

// Constants for Firestore Paths
const SESSIONS_COLLECTION = 'sessions';
const STUDENTS_COLLECTION = 'students';

const MAX_PIN_LENGTH = 10; // Prevent storage abuse on the PIN field

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
  ) => Promise<void>;
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
}

export const useLiveSession = (
  userId: string | undefined,
  role: 'teacher' | 'student',
  joinCode?: string
): UseLiveSessionResult => {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [students, setStudents] = useState<LiveStudent[]>([]);
  const [loading, setLoading] = useState(
    role === 'teacher' || (role === 'student' && !!joinCode)
  );
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentPin, setStudentPin] = useState<string | null>(null);
  const [individualFrozen, setIndividualFrozen] = useState(false);

  // SESSION SUBSCRIPTION: Subscribe to session document (Teachers use userId, Students use joinCode)
  useEffect(() => {
    const targetId = role === 'teacher' ? userId : joinCode;
    if (!targetId) {
      if (role === 'student' && !joinCode) {
        setTimeout(() => {
          setSession(null);
          setLoading(false);
        }, 0);
      }
      return;
    }

    const sessionRef = doc(db, SESSIONS_COLLECTION, targetId);

    const unsubscribeSession = onSnapshot(
      sessionRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setSession(docSnap.data() as LiveSession);
        } else {
          setSession(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Session subscription error:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeSession();
    };
  }, [userId, joinCode, role]);

  // TEACHER: Subscribe to students (only when live)
  useEffect(() => {
    if (role !== 'teacher' || !userId || !session?.isActive) {
      setTimeout(() => setStudents([]), 0);
      return;
    }

    const studentsRef = collection(
      db,
      SESSIONS_COLLECTION,
      userId,
      STUDENTS_COLLECTION
    );
    const unsubscribeStudents = onSnapshot(studentsRef, (snapshot) => {
      const studentList = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as LiveStudent[];

      // Only update state if the data has actually changed to prevent unnecessary re-renders
      setStudents((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(studentList)) {
          return prev;
        }
        return studentList;
      });
    });

    return () => {
      unsubscribeStudents();
    };
  }, [userId, role, session?.isActive]);

  // STUDENT: Subscribe to My Student Status (Am I individually frozen?)
  useEffect(() => {
    if (role !== 'student' || !joinCode || !studentId) {
      setTimeout(() => {
        setIndividualFrozen(false);
        setStudentPin(null);
      }, 0);
      return;
    }

    const myStudentRef = doc(
      db,
      SESSIONS_COLLECTION,
      joinCode,
      STUDENTS_COLLECTION,
      studentId
    );
    const unsubscribeStudent = onSnapshot(myStudentRef, (docSnap) => {
      if (docSnap.exists()) {
        const studentData = docSnap.data() as LiveStudent;
        setIndividualFrozen(studentData.status === 'frozen');
        setStudentPin(studentData.pin);
      }
    });

    return () => {
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

    const sessionsRef = collection(db, SESSIONS_COLLECTION);
    const q = query(sessionsRef, where('code', '==', normalizedCode));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('Session not found');
    }

    const sessionDoc = querySnapshot.docs[0];
    const teacherId = sessionDoc.id;

    // Sanitize PIN (max length limit, simple trim)
    const sanitizedPin = pin.trim().substring(0, MAX_PIN_LENGTH);

    if (!sanitizedPin) {
      throw new Error('PIN is required');
    }

    // 2. Add student to subcollection using their anonymous auth UID as the doc ID.
    // This ties the record to the authenticated user so Firestore rules can
    // allow students to update their own heartbeat/disconnect status.
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Not authenticated — please wait and try again');
    }

    const studentsRef = collection(
      db,
      SESSIONS_COLLECTION,
      teacherId,
      STUDENTS_COLLECTION
    );
    // Reject duplicate PINs to prevent students from being indistinguishable
    // in the teacher's roster view during live sessions.
    const existingSnap = await getDocs(studentsRef);
    const pinInUse = existingSnap.docs.some(
      (d) => (d.data() as { pin?: string }).pin === sanitizedPin
    );
    if (pinInUse) {
      throw new Error(
        `PIN "${sanitizedPin}" is already in use in this session. ` +
          'Please contact your teacher for a unique PIN.'
      );
    }

    const newStudent: Omit<LiveStudent, 'id'> = {
      pin: sanitizedPin,
      status: 'active',
      joinedAt: Date.now(),
      lastActive: Date.now(),
    };

    await setDoc(doc(studentsRef, uid), newStudent);
    setStudentId(uid);
    setStudentPin(sanitizedPin);
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
      setStudentId(null);
      setStudentPin(null);
      setSession(null);
    } catch (err) {
      console.error('Failed to leave session:', err);
    }
  }, [role, joinCode, studentId, setStudentId, setStudentPin, setSession]);

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
      if (!userId) return;

      // Clear existing students for a fresh start
      const studentsRef = collection(
        db,
        SESSIONS_COLLECTION,
        userId,
        STUDENTS_COLLECTION
      );
      const studentsSnapshot = await getDocs(studentsRef);
      const deletePromises = studentsSnapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises).catch((err) => {
        console.error('Failed to clear old students:', err);
      });

      const sessionRef = doc(db, SESSIONS_COLLECTION, userId);
      const newSession: LiveSession = {
        id: userId,
        isActive: true,
        activeWidgetId: widgetId,
        activeWidgetType: widgetType,
        activeWidgetConfig: config,
        background: background,
        code: Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase()
          .padEnd(6, '0'),
        frozen: false,
        createdAt: Date.now(),
      };
      await setDoc(sessionRef, newSession).catch((err) => {
        console.error('Failed to start session:', err);
        throw err;
      });
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
    await updateDoc(sessionRef, {
      isActive: false,
      activeWidgetId: null,
      frozen: false,
    }).catch((err) => {
      console.error('Failed to end session:', err);
    });

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
  };
};
