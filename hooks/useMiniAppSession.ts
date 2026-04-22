/**
 * useMiniAppSession — teacher hook for managing persistent MiniApp assignment sessions.
 *
 * Firestore structure:
 *   /mini_app_sessions/{sessionId}  — MiniAppSession
 *
 * Students access sessions via the `/miniapp/{sessionId}` route.
 * Teachers create, list, rename, and end sessions here.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc,
  collection,
  setDoc,
  onSnapshot,
  updateDoc,
  Unsubscribe,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { MiniAppItem, MiniAppSession } from '@/types';

const SESSIONS_COLLECTION = 'mini_app_sessions';

const normalizeSession = (
  sessionId: string,
  data: Partial<MiniAppSession>
): MiniAppSession => {
  const appTitle = data.appTitle ?? 'Mini App';
  const createdAt = data.createdAt ?? Date.now();

  const classIds = Array.isArray(data.classIds)
    ? data.classIds.filter(
        (c): c is string => typeof c === 'string' && c.length > 0
      )
    : [];

  return {
    id: sessionId,
    appId: data.appId ?? '',
    appTitle,
    appHtml: data.appHtml ?? '',
    teacherUid: data.teacherUid ?? '',
    assignmentName:
      data.assignmentName && data.assignmentName.trim().length > 0
        ? data.assignmentName
        : `${appTitle} — ${new Date(createdAt).toLocaleString()}`,
    status: data.status === 'ended' ? 'ended' : 'active',
    createdAt,
    ...(typeof data.endedAt === 'number' ? { endedAt: data.endedAt } : {}),
    ...(classIds.length > 0 ? { classIds } : {}),
    ...(data.submissionsEnabled === true ? { submissionsEnabled: true } : {}),
  };
};

export interface CreateMiniAppSessionOptions {
  /** ClassLink class sourcedIds the teacher targeted (multi-select). */
  classIds?: string[];
  /** Whether the runner should reveal the Submit button and persist
   *  submissions. Defaults to `false` (view-only). */
  submissionsEnabled?: boolean;
}

export interface UseMiniAppSessionTeacherResult {
  /** Create a session for an app and return the sessionId (used as the share link). */
  createSession: (
    app: MiniAppItem,
    teacherUid: string,
    assignmentName: string,
    options?: CreateMiniAppSessionOptions
  ) => Promise<string>;
  /** Sessions created by this teacher for the currently subscribed app. */
  sessions: MiniAppSession[];
  sessionsLoading: boolean;
  /** Subscribe to all sessions for a specific app by this teacher. Cleans up any previous listener. */
  subscribeToAppSessions: (appId: string, teacherUid: string) => void;
  /** Unsubscribe from the current session list listener. */
  unsubscribeFromAppSessions: () => void;
  /** Rename a session. */
  renameSession: (sessionId: string, assignmentName: string) => Promise<void>;
  /** End a session so the share link shows "session ended" to students. */
  endSession: (sessionId: string) => Promise<void>;
}

export const useMiniAppSessionTeacher = (): UseMiniAppSessionTeacherResult => {
  const [sessions, setSessions] = useState<MiniAppSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const sessionsUnsubRef = useRef<Unsubscribe | null>(null);

  const createSession = useCallback(
    async (
      app: MiniAppItem,
      teacherUid: string,
      assignmentName: string,
      options?: CreateMiniAppSessionOptions
    ): Promise<string> => {
      const sessionId = crypto.randomUUID();
      const trimmedName = assignmentName.trim();
      const cleanedClassIds = (options?.classIds ?? []).filter(
        (c): c is string => typeof c === 'string' && c.length > 0
      );
      const submissionsEnabled = options?.submissionsEnabled === true;

      const session: MiniAppSession = {
        id: sessionId,
        appId: app.id,
        appTitle: app.title,
        appHtml: app.html,
        teacherUid,
        assignmentName:
          trimmedName.length > 0
            ? trimmedName
            : `${app.title} — ${new Date().toLocaleString()}`,
        status: 'active',
        createdAt: Date.now(),
        ...(cleanedClassIds.length > 0 ? { classIds: cleanedClassIds } : {}),
        submissionsEnabled,
      };

      await setDoc(doc(db, SESSIONS_COLLECTION, sessionId), session);
      return sessionId;
    },
    []
  );

  const subscribeToAppSessions = useCallback(
    (appId: string, teacherUid: string) => {
      if (sessionsUnsubRef.current) {
        sessionsUnsubRef.current();
        sessionsUnsubRef.current = null;
      }

      setSessionsLoading(true);
      sessionsUnsubRef.current = onSnapshot(
        query(
          collection(db, SESSIONS_COLLECTION),
          where('appId', '==', appId),
          where('teacherUid', '==', teacherUid),
          orderBy('createdAt', 'desc')
        ),
        (snap) => {
          setSessions(
            snap.docs.map((sessionDoc) => {
              const data = sessionDoc.data() as Partial<MiniAppSession>;
              return normalizeSession(sessionDoc.id, data);
            })
          );
          setSessionsLoading(false);
        },
        (err) => {
          console.error('[useMiniAppSessionTeacher] Session list error:', err);
          setSessions([]);
          setSessionsLoading(false);
        }
      );
    },
    []
  );

  const unsubscribeFromAppSessions = useCallback(() => {
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
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      status: 'ended',
      endedAt: Date.now(),
    });
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sessionsUnsubRef.current) {
        sessionsUnsubRef.current();
        sessionsUnsubRef.current = null;
      }
    };
  }, []);

  return {
    createSession,
    sessions,
    sessionsLoading,
    subscribeToAppSessions,
    unsubscribeFromAppSessions,
    renameSession,
    endSession,
  };
};
