/**
 * Google Classroom Add-on student view route.
 *
 * Route: /classroom-addon/student  (the add-on's Student View URI).
 * Classroom opens this iframe when a student opens a SpartBoard attachment,
 * passing courseId/itemId/itemType/attachmentId (+ login_hint) and the params
 * the teacher discovery flow embedded in the studentViewUri:
 *   - Quiz attachment → `?code=<quizCode>`
 *   - Video Activity   → `?kind=va&sessionId=<sessionId>`
 *
 * Flow:
 *   1. The student runs the identity handshake: a GIS OAuth popup (top-level —
 *      OAuth consent can't redirect inside Classroom's partitioned iframe)
 *      yields an access token, which `classroomAddonLoginV1` validates via
 *      getAddOnContext. For a student launch it mints a Firebase custom token
 *      carrying `studentRole: true` and the ClassLink-bridged `classIds`.
 *   2. We `signInWithCustomToken`, establishing the studentRole session.
 *   3. After a FRESH handshake (this page load) we render the matching runner:
 *        - Quiz → `<QuizStudentApp/>`, which reads `?code=` and SSO-auto-joins
 *          without a PIN (its studentRole branch).
 *        - Video Activity → `<VideoActivityStudentApp/>`, mounted exactly like
 *          the `/activity` route. Its SSO branch reads the studentRole token
 *          and joins by sessionId, skipping the PIN.
 */
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from '@/config/firebase';
import { ensureGis, requestAccessToken } from './gisOAuth';

// QuizStudentApp is the real quiz runner. It reads `?code=` from the URL and,
// because our handshake already signed the student in with a studentRole custom
// token, its SSO branch auto-joins without a PIN. Lazy so the handshake page
// stays light when there's no runner to render.
const QuizStudentApp = lazy(() =>
  import('@/components/quiz/QuizStudentApp').then((m) => ({
    default: m.QuizStudentApp,
  }))
);

// VideoActivityStudentApp is the real video-activity runner. It derives its
// sessionId from `window.location.pathname` (`/activity/:sessionId`) and, like
// the quiz runner, SSO-auto-joins on the studentRole token without a PIN. We
// rewrite the URL to `/activity/<sessionId>` before mounting it (see the VA
// render branch below) so it reads the right session.
const VideoActivityStudentApp = lazy(() =>
  import('@/components/videoActivity/VideoActivityStudentApp').then((m) => ({
    default: m.VideoActivityStudentApp,
  }))
);

const FullPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100">
    {children}
  </div>
);

// The student iframe only needs to read context + identity.
const ADDON_STUDENT_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/classroom.addons.student',
].join(' ');

interface ClassroomAddonLoginResult {
  role: 'student' | 'teacher' | 'unknown';
  studentRole: boolean;
  customToken?: string;
  submissionId?: string;
}

interface SessionInfo {
  uid: string;
  isAnonymous: boolean;
  studentRole: boolean;
  classIds: unknown;
}

export const ClassroomAddonStudentSpike: React.FC = () => {
  const params =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const loginHint = params.get('login_hint') ?? undefined;
  const courseId = params.get('courseId') ?? '';
  const itemId = params.get('itemId') ?? '';
  const itemType = params.get('itemType') ?? 'courseWork';
  // The student VIEW iframe carries an attachmentId; getAddOnContext requires it
  // for non-discovery launches.
  const attachmentId = params.get('attachmentId') ?? '';
  // Runner discriminator. The teacher discovery flow embeds either a quiz join
  // `code` or `kind=va&sessionId=…` in the studentViewUri:
  //   - VA   → kind === 'va' AND a sessionId is present.
  //   - Quiz → the (default) `?code=` path.
  const kind = params.get('kind') ?? '';
  const code = params.get('code') ?? '';
  const sessionId = params.get('sessionId') ?? '';
  const isVideoActivity = kind === 'va' && sessionId !== '';

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  // True only after a handshake completes IN THIS page load. We gate the runner
  // render on this (not merely on a persisted studentRole session) so a stale
  // session from another student/course can never mount the runner with the
  // wrong classIds — the student always re-handshakes for THIS attachment.
  const [handshakeDone, setHandshakeDone] = useState(false);

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  // Report whatever Firebase session is already present on mount — this is the
  // persistence check: after a reload inside the iframe, does the studentRole
  // user come back?
  useEffect(() => {
    // `active` guards the async `getIdTokenResult` continuation so we don't
    // setState after the component unmounts (the listener can resolve late).
    let active = true;
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (active) setSession(null);
        return;
      }
      try {
        const token = await user.getIdTokenResult();
        if (!active) return;
        setSession({
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          studentRole: token.claims.studentRole === true,
          classIds: token.claims.classIds,
        });
      } catch {
        if (!active) return;
        setSession({
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          studentRole: false,
          classIds: undefined,
        });
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const runHandshake = useCallback(async () => {
    setBusy(true);
    try {
      if (!courseId || !itemId) {
        append(
          'Missing courseId/itemId in the URL — set them as query params.'
        );
        return;
      }
      append('Loading Google Identity Services…');
      await ensureGis();
      append('Opening OAuth popup…');
      const accessToken = await requestAccessToken(
        ADDON_STUDENT_SCOPES,
        loginHint
      );
      append('Got access token. Calling classroomAddonLoginV1…');

      const callable = httpsCallable<
        {
          accessToken: string;
          courseId: string;
          itemId: string;
          itemType: string;
          attachmentId: string;
        },
        ClassroomAddonLoginResult
      >(functions, 'classroomAddonLoginV1');
      const { data } = await callable({
        accessToken,
        courseId,
        itemId,
        itemType,
        attachmentId,
      });

      append(`Server says role=${data.role}, studentRole=${data.studentRole}.`);
      if (data.role !== 'student' || !data.customToken) {
        append(
          'Not a student launch — no token minted. (Expected for teachers.)'
        );
        return;
      }
      append(
        `submissionId=${data.submissionId}. Signing in with custom token…`
      );
      await signInWithCustomToken(auth, data.customToken);
      append('Signed in.');
      setHandshakeDone(true);
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, courseId, itemId, itemType, attachmentId, loginHint]);

  // Render the runner only after a handshake completed in THIS page load (not on
  // a merely-persisted session) so a stale session from another student/course
  // can't mount the runner with mismatched classIds. The handshake re-mints the
  // correct token (incl. the ClassLink bridge) for this exact attachment. The
  // authoritative class-gate is still enforced server-side at write time.
  const handshakeReady = handshakeDone && session?.studentRole === true;

  if (handshakeReady && isVideoActivity) {
    // VideoActivityStudentApp reads its sessionId from the pathname
    // (`/activity/:sessionId`). Rewrite the URL in place so it mounts exactly
    // as it does on the `/activity` route — same providers (DialogProvider),
    // same SSO-auto-join path — while preserving the query string for any
    // params the runner inspects. Idempotent: only rewrites when the path
    // isn't already `/activity/<sessionId>`.
    const targetPath = `/activity/${sessionId}`;
    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== targetPath
    ) {
      window.history.replaceState(
        null,
        '',
        `${targetPath}${window.location.search}`
      );
    }
    return (
      <Suspense
        fallback={
          <FullPage>
            <p className="text-sm text-slate-400">Loading activity…</p>
          </FullPage>
        }
      >
        <VideoActivityStudentApp />
      </Suspense>
    );
  }

  if (code && handshakeReady) {
    return (
      <Suspense
        fallback={
          <FullPage>
            <p className="text-sm text-slate-400">Loading quiz…</p>
          </FullPage>
        }
      >
        <QuizStudentApp />
      </Suspense>
    );
  }

  const hasRunner = isVideoActivity || code !== '';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">SpartBoard — Classroom Add-on</h1>
          <p className="text-sm text-slate-400">
            Sign in to start your{' '}
            {isVideoActivity ? 'video activity' : 'assignment'}. This confirms
            who you are inside Classroom.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-y-1">
            <span className="text-slate-400">courseId</span>
            <span className="font-mono break-all">
              {courseId === '' ? '(missing)' : courseId}
            </span>
            <span className="text-slate-400">itemId</span>
            <span className="font-mono break-all">
              {itemId === '' ? '(missing)' : itemId}
            </span>
            <span className="text-slate-400">itemType</span>
            <span className="font-mono">{itemType}</span>
            <span className="text-slate-400">attachmentId</span>
            <span className="font-mono break-all">
              {attachmentId === '' ? '(missing)' : attachmentId}
            </span>
            <span className="text-slate-400">kind</span>
            <span className="font-mono">
              {isVideoActivity ? 'video-activity' : 'quiz'}
            </span>
            <span className="text-slate-400">login_hint</span>
            <span className="font-mono break-all">{loginHint ?? '(none)'}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void runHandshake()}
            disabled={busy}
            className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {busy
              ? 'Working…'
              : hasRunner
                ? isVideoActivity
                  ? 'Start activity'
                  : 'Start quiz'
                : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-white/20 px-4 py-2 font-medium transition hover:bg-white/10"
          >
            Reload
          </button>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Current Firebase session</h2>
          {session ? (
            <div className="grid grid-cols-[8rem_1fr] gap-y-1">
              <span className="text-slate-400">uid</span>
              <span className="font-mono break-all">{session.uid}</span>
              <span className="text-slate-400">isAnonymous</span>
              <span className="font-mono">{String(session.isAnonymous)}</span>
              <span className="text-slate-400">studentRole</span>
              <span className="font-mono">{String(session.studentRole)}</span>
              <span className="text-slate-400">classIds</span>
              <span className="font-mono break-all">
                {JSON.stringify(session.classIds)}
              </span>
            </div>
          ) : (
            <p className="text-slate-400">
              No Firebase user yet — sign in above to begin.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <h2 className="mb-2 text-sm font-semibold">Log</h2>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-300">
            {log.length ? log.join('\n') : '(no output yet)'}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ClassroomAddonStudentSpike;
