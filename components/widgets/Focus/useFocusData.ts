// Firestore listeners and callables behind the Focus widget (CHROME_EXTENSION.md F8, F11).
import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  FOCUS_SESSIONS_COLLECTION,
  FOCUS_STUDENTS_SUBCOLLECTION,
  type FocusAddSiteReply,
  type FocusAddSiteRequest,
  type FocusEndReply,
  type FocusEndRequest,
  type FocusExtendReply,
  type FocusExtendRequest,
  type FocusOpenReply,
  type FocusOpenRequest,
  type FocusReleaseReply,
  type FocusReleaseRequest,
  type FocusSessionDoc,
  type FocusStartReply,
  type FocusStartRequest,
  type FocusStudentDoc,
  type FocusStudentSummary,
} from '@/utils/focus/contract';
import type { FocusSessionRow } from './focusWidgetState';

/** Sessions the teacher can read for one class, newest first; TTL keeps it to 30 days. */
const SESSION_HISTORY_LIMIT = 200;

export interface FocusListState<T> {
  rows: T[];
  loading: boolean;
  error: boolean;
}

export function useFocusClassSessions(
  uid: string | null | undefined,
  classId: string | null | undefined
): FocusListState<FocusSessionRow> {
  const key = uid && classId ? `${uid}::${classId}` : '';
  const [state, setState] = useState<
    FocusListState<FocusSessionRow> & { key: string }
  >({ key: '', rows: [], loading: false, error: false });

  useEffect(() => {
    if (!uid || !classId) return;
    const q = query(
      collection(db, FOCUS_SESSIONS_COLLECTION),
      where('teacherUids', 'array-contains', uid),
      where('classId', '==', classId),
      orderBy('startedAt', 'desc'),
      limit(SESSION_HISTORY_LIMIT)
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          key: `${uid}::${classId}`,
          rows: snap.docs.map((d) => ({
            ...(d.data() as FocusSessionDoc),
            id: d.id,
          })),
          loading: false,
          error: false,
        }),
      (err) => {
        logError('focusWidget.sessions', err);
        setState({
          key: `${uid}::${classId}`,
          rows: [],
          loading: false,
          error: true,
        });
      }
    );
  }, [uid, classId]);

  if (!key) return { rows: [], loading: false, error: false };
  if (state.key !== key) return { rows: [], loading: true, error: false };
  return state;
}

/** One session by id, for a substitute who can't run the teacher query. */
export function useFocusSession(
  sessionId: string | null
): FocusListState<FocusSessionRow> {
  const [state, setState] = useState<
    FocusListState<FocusSessionRow> & { key: string }
  >({ key: '', rows: [], loading: false, error: false });

  useEffect(() => {
    if (!sessionId) return;
    return onSnapshot(
      doc(db, FOCUS_SESSIONS_COLLECTION, sessionId),
      (snap) =>
        setState({
          key: sessionId,
          rows: snap.exists()
            ? [{ ...(snap.data() as FocusSessionDoc), id: snap.id }]
            : [],
          loading: false,
          error: false,
        }),
      (err) => {
        logError('focusWidget.session', err);
        setState({ key: sessionId, rows: [], loading: false, error: true });
      }
    );
  }, [sessionId]);

  if (!sessionId) return { rows: [], loading: false, error: false };
  if (state.key !== sessionId) return { rows: [], loading: true, error: false };
  return state;
}

export interface FocusStudentRow {
  uid: string;
  doc: FocusStudentDoc | FocusStudentSummary;
}

export function useFocusStudents(
  sessionId: string | null
): FocusListState<FocusStudentRow> {
  const [state, setState] = useState<
    FocusListState<FocusStudentRow> & { key: string }
  >({ key: '', rows: [], loading: false, error: false });

  useEffect(() => {
    if (!sessionId) return;
    return onSnapshot(
      collection(
        db,
        FOCUS_SESSIONS_COLLECTION,
        sessionId,
        FOCUS_STUDENTS_SUBCOLLECTION
      ),
      (snap) =>
        setState({
          key: sessionId,
          rows: snap.docs.map((d) => ({
            uid: d.id,
            doc: d.data() as FocusStudentDoc | FocusStudentSummary,
          })),
          loading: false,
          error: false,
        }),
      (err) => {
        logError('focusWidget.students', err);
        setState({ key: sessionId, rows: [], loading: false, error: true });
      }
    );
  }, [sessionId]);

  if (!sessionId) return { rows: [], loading: false, error: false };
  if (state.key !== sessionId) return { rows: [], loading: true, error: false };
  return state;
}

/** The server's own message for a refused call; it is written for teachers. */
export function focusErrorMessage(err: unknown): string {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String(err.message)
      : '';
  const code =
    err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  if (
    message &&
    /(permission-denied|failed-precondition|invalid-argument|not-found)$/.test(
      code
    )
  )
    return message;
  return 'Something went wrong. Try again.';
}

export const isRunningConflict = (err: unknown): boolean =>
  focusErrorMessage(err) === 'That class already has a focus session running.';

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (req: Req): Promise<Res> => (await fn(req)).data;
}

export const focusApi = {
  start: call<FocusStartRequest, FocusStartReply>('focusStartV1'),
  extend: call<FocusExtendRequest, FocusExtendReply>('focusExtendV1'),
  release: call<FocusReleaseRequest, FocusReleaseReply>('focusReleaseV1'),
  addSite: call<FocusAddSiteRequest, FocusAddSiteReply>('focusAddSiteV1'),
  end: call<FocusEndRequest, FocusEndReply>('focusEndV1'),
  open: call<FocusOpenRequest, FocusOpenReply>('focusOpenV1'),
};

/**
 * Asks the server for the class's running session once per class, which also adds a co-teacher (or a
 * sub naming their share) as a reader; returns its id and a way to ask again.
 */
export function useFocusOpen(
  classId: string | null | undefined,
  shareId: string | null | undefined,
  enabled: boolean
): { sessionId: string | null; checking: boolean; recheck: () => void } {
  const key = enabled && classId ? `${classId}::${shareId ?? ''}` : '';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    sessionId: string | null;
  }>({ key: '', sessionId: null });
  const recheck = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !classId) return;
    let cancelled = false;
    const k = `${classId}::${shareId ?? ''}::${attempt}`;
    focusApi
      .open(shareId ? { classId, shareId } : { classId })
      .then((r) => {
        if (!cancelled) setState({ key: k, sessionId: r.sessionId });
      })
      .catch(() => {
        // Expected for a teacher who doesn't teach the class or a lapsed share: they just see no session.
        if (!cancelled) setState({ key: k, sessionId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, classId, shareId, attempt]);

  const current = `${key}::${attempt}`;
  if (!key) return { sessionId: null, checking: false, recheck };
  return {
    sessionId: state.key === current ? state.sessionId : null,
    checking: state.key !== current,
    recheck,
  };
}
