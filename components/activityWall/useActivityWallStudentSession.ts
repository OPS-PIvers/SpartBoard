import { useCallback, useEffect, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { useResolvedFirebaseUser } from '@/hooks/useResolvedFirebaseUser';
import {
  normalizeActivityWallSession,
  normalizeActivityWallSubmission,
} from '@/utils/activityWallNormalize';
import type { ActivityWallSession, ActivityWallSubmission } from '@/types';

/** Extracts the session id from `/activity-wall/{sessionId}`. */
export function getSessionIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/activity-wall\/([^/?#]+)\/?$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1] ?? '');
  return id && id !== 'gallery' ? id : null;
}

export type ActivityWallStudentSessionState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'redirecting' }
  | {
      kind: 'ready';
      session: ActivityWallSession;
      uid: string;
      isGuest: boolean;
      participantLabel: string;
      myPosts: ActivityWallSubmission[];
    };

const STUDENT_FIRST_NAME_KEY = 'sb_student_first_name';

const readParticipantLabel = (isGuest: boolean): string => {
  if (isGuest) return 'Guest';
  try {
    const stored = window.sessionStorage.getItem(STUDENT_FIRST_NAME_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // sessionStorage can throw in privacy modes; fall through to the default.
  }
  return 'Student';
};

/**
 * Resolves the wall session, the student's identity, and their own posts for
 * `/activity-wall/{sessionId}`. Guests are signed in only when the wall allows
 * them; otherwise the visitor is bounced to the student login page.
 */
export function useActivityWallStudentSession(
  sessionId: string | null
): ActivityWallStudentSessionState {
  const { user, resolved } = useResolvedFirebaseUser();
  const [session, setSession] = useState<ActivityWallSession | null>(null);
  const [sessionMissing, setSessionMissing] = useState(false);
  const [claims, setClaims] = useState<{
    uid: string;
    isStudentRole: boolean;
  } | null>(null);
  const [myPosts, setMyPosts] = useState<ActivityWallSubmission[]>([]);

  useEffect(() => {
    if (!sessionId) return;
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
  }, [sessionId]);

  // Probe the custom claims of a non-anonymous user (external auth system).
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let cancelled = false;
    const probedUid = user.uid;
    void user
      .getIdTokenResult()
      .then((token) => {
        if (cancelled) return;
        setClaims({
          uid: probedUid,
          isStudentRole: token.claims?.studentRole === true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setClaims({ uid: probedUid, isStudentRole: false });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const claimsChecked =
    !user || user.isAnonymous ? resolved : claims?.uid === user.uid;
  const isStudentRole =
    !!user && !user.isAnonymous && claims?.uid === user.uid
      ? claims.isStudentRole
      : false;
  const needsLogin =
    resolved && claimsChecked && !!session && !user && !session.allowGuests;

  // Guest sign-in / login bounce: both talk to external systems only.
  useEffect(() => {
    if (!resolved || !claimsChecked || !session || user) return;
    if (session.allowGuests) {
      void signInAnonymously(auth).catch((error) => {
        console.error('[ActivityWallStudentApp] Guest sign-in failed:', error);
      });
      return;
    }
    const next = encodeURIComponent(window.location.pathname);
    window.location.replace(`/student/login?next=${next}`);
  }, [resolved, claimsChecked, session, user]);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!sessionId || !uid) return;
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
  }, [sessionId, uid]);

  const buildState = useCallback((): ActivityWallStudentSessionState => {
    if (!sessionId || sessionMissing) return { kind: 'not-found' };
    if (needsLogin) return { kind: 'redirecting' };
    if (!session || !resolved || !claimsChecked || !user)
      return { kind: 'loading' };
    const isGuest = user.isAnonymous || !isStudentRole;
    return {
      kind: 'ready',
      session,
      uid: user.uid,
      isGuest,
      participantLabel: readParticipantLabel(isGuest),
      myPosts,
    };
  }, [
    sessionId,
    sessionMissing,
    needsLogin,
    session,
    resolved,
    claimsChecked,
    user,
    isStudentRole,
    myPosts,
  ]);

  return buildState();
}
