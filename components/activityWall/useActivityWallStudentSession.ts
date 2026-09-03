import { useEffect, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { STUDENT_FIRST_NAME_KEY } from '@/context/StudentAuthContextValue';
import { useResolvedFirebaseUser } from '@/hooks/useResolvedFirebaseUser';
import {
  normalizeActivityWallSession,
  normalizeActivityWallSubmission,
} from '@/utils/activityWallNormalize';
import type {
  ActivityWallIdentificationMode,
  ActivityWallSession,
  ActivityWallSubmission,
} from '@/types';

/** Extracts the session id from `/activity-wall/{sessionId}`. */
export function getSessionIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/activity-wall\/([^/?#]+)\/?$/);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1] ?? '');
  } catch {
    return null;
  }
  return id && id !== 'gallery' ? id : null;
}

/** Same label shape the public gallery uses for commenters. */
export const buildParticipantLabel = (
  identificationMode: ActivityWallIdentificationMode,
  name: string,
  pin: string
): string => {
  if (identificationMode === 'name') return name.trim() || 'Visitor';
  if (identificationMode === 'pin') return `PIN: ${pin.trim()}`;
  if (identificationMode === 'name-pin')
    return `${name.trim()} (${pin.trim()})`;
  return 'Anonymous';
};

export type ActivityWallStudentSessionState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'redirecting' }
  | {
      kind: 'ready';
      session: ActivityWallSession;
      uid: string;
      isGuest: boolean;
      isStudent: boolean;
      participantLabel: string;
      myPosts: ActivityWallSubmission[];
      /** Approved posts merged with the viewer's own (own copy wins). */
      posts: ActivityWallSubmission[];
      /** False when the teacher has hidden the wall (`studentsCanSeePosts === false`). */
      wallVisible: boolean;
    };

const readSsoFirstName = (): string => {
  try {
    const stored = window.sessionStorage.getItem(STUDENT_FIRST_NAME_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // sessionStorage can throw in privacy modes; fall through to the default.
  }
  return 'Student';
};

const participantLabelFor = (
  isStudent: boolean,
  isAnonymous: boolean,
  displayName: string | null
): string => {
  if (isStudent) return readSsoFirstName();
  const firstWord = displayName?.trim().split(/\s+/)[0];
  if (!isAnonymous && firstWord) return firstWord;
  return 'Guest';
};

/** Approved ∪ own by id; the own-posts copy wins so pending edits show immediately. */
export const mergeWallPosts = (
  approved: ActivityWallSubmission[],
  own: ActivityWallSubmission[]
): ActivityWallSubmission[] => {
  const byId = new Map<string, ActivityWallSubmission>();
  approved.forEach((post) => byId.set(post.id, post));
  own.forEach((post) => byId.set(post.id, post));
  return Array.from(byId.values());
};

/** Resolves the wall session, the visitor's identity, and the posts they may see for `/activity-wall/{sessionId}`. */
export function useActivityWallStudentSession(
  sessionId: string | null
): ActivityWallStudentSessionState {
  const { user, resolved } = useResolvedFirebaseUser();
  const [session, setSession] = useState<ActivityWallSession | null>(null);
  const [sessionMissing, setSessionMissing] = useState(false);
  const [claims, setClaims] = useState<{
    uid: string;
    isStudent: boolean;
  } | null>(null);
  const [myPosts, setMyPosts] = useState<ActivityWallSubmission[]>([]);
  const [approvedPosts, setApprovedPosts] = useState<ActivityWallSubmission[]>(
    []
  );

  const uid = user?.uid ?? null;

  // The session doc requires auth to read, so guests get an anonymous identity first.
  useEffect(() => {
    if (!resolved || user) return;
    void signInAnonymously(auth).catch((error) => {
      console.error('[ActivityWallStudentApp] Guest sign-in failed:', error);
    });
  }, [resolved, user]);

  useEffect(() => {
    if (!sessionId || !uid) return;
    const unsubscribe = onSnapshot(
      doc(db, 'activity_wall_sessions', sessionId),
      (snap) => {
        if (!snap.exists()) {
          setSessionMissing(true);
          setSession(null);
          return;
        }
        setSessionMissing(false);
        setSession(
          normalizeActivityWallSession(
            snap.id,
            snap.data() as Partial<ActivityWallSession>
          )
        );
      },
      (error) => {
        console.error('[ActivityWallStudentApp] Session read failed:', error);
        setSessionMissing(true);
      }
    );
    return unsubscribe;
  }, [sessionId, uid]);

  // Custom claims come from the external auth system; read them once per user.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const probedUid = user.uid;
    void user
      .getIdTokenResult()
      .then((token) => {
        if (!cancelled)
          setClaims({
            uid: probedUid,
            isStudent: token.claims?.studentRole === true,
          });
      })
      .catch(() => {
        if (!cancelled) setClaims({ uid: probedUid, isStudent: false });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const resolvedClaims = claims && claims.uid === uid ? claims : null;
  const isStudent = resolvedClaims?.isStudent === true;
  const needsLogin =
    !!resolvedClaims && !!session && !isStudent && !session.allowGuests;
  const wallVisible = !!session && session.studentsCanSeePosts !== false;

  useEffect(() => {
    if (!needsLogin) return;
    const next = encodeURIComponent(window.location.pathname);
    window.location.replace(`/student/login?next=${next}`);
  }, [needsLogin]);

  useEffect(() => {
    if (!sessionId || !uid || needsLogin) return;
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'activity_wall_sessions', sessionId, 'submissions'),
        where('authorUid', '==', uid)
      ),
      (snap) => {
        setMyPosts(
          snap.docs.map((entry) =>
            normalizeActivityWallSubmission(
              entry.id,
              entry.data() as Partial<ActivityWallSubmission>
            )
          )
        );
      },
      (error) => {
        console.error('[ActivityWallStudentApp] My posts read failed:', error);
      }
    );
    return unsubscribe;
  }, [sessionId, uid, needsLogin]);

  // Only subscribe while the wall is visible so a hidden wall never trips the rules denial; stale rows are ignored via `wallVisible`.
  useEffect(() => {
    if (!sessionId || !uid || needsLogin || !wallVisible) return;
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'activity_wall_sessions', sessionId, 'submissions'),
        where('status', '==', 'approved')
      ),
      (snap) => {
        setApprovedPosts(
          snap.docs.map((entry) =>
            normalizeActivityWallSubmission(
              entry.id,
              entry.data() as Partial<ActivityWallSubmission>
            )
          )
        );
      },
      (error) => {
        console.error('[ActivityWallStudentApp] Wall read failed:', error);
      }
    );
    return unsubscribe;
  }, [sessionId, uid, needsLogin, wallVisible]);

  if (!sessionId || sessionMissing) return { kind: 'not-found' };
  if (needsLogin) return { kind: 'redirecting' };
  if (!user || !session || !resolvedClaims) return { kind: 'loading' };

  return {
    kind: 'ready',
    session,
    uid: user.uid,
    isGuest: user.isAnonymous,
    isStudent,
    participantLabel: participantLabelFor(
      isStudent,
      user.isAnonymous,
      user.displayName
    ),
    myPosts,
    posts: wallVisible ? mergeWallPosts(approvedPosts, myPosts) : myPosts,
    wallVisible,
  };
}
