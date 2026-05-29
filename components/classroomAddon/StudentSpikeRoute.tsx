/**
 * SPIKE — Google Classroom Add-on student handshake de-risk page.
 *
 * Route: /classroom-addon/student  (set this as the add-on's Student View URI
 * on the test domain, e.g. .../classroom-addon/student?courseId=…&itemId=…)
 *
 * The ONLY purpose of this throwaway page is to answer the single riskiest
 * question in the whole integration, against a REAL Classroom iframe:
 *   1. Can we run Google OAuth in a popup from inside the partitioned iframe?
 *   2. Does `classroomAddonLoginV1` (server-side getAddOnContext) return the
 *      student role + submissionId and mint a Firebase custom token?
 *   3. After `signInWithCustomToken`, does the Firebase `studentRole` session
 *      SURVIVE A RELOAD inside the partitioned iframe? (Use the "Reload" button
 *      below — if the session is gone after reload, we need CHIPS / Storage
 *      Access API and must plan for it before building the real runner.)
 *
 * This is NOT the real student runner — no quiz, no Firestore writes. Delete
 * once the handshake is proven and Phase 3-shell takes over.
 */
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from '@/config/firebase';
import { ensureGis, requestAccessToken } from './gisOAuth';

// QuizStudentApp is the real quiz runner. It reads `?code=` from the URL and,
// because our handshake already signed the student in with a studentRole custom
// token, its SSO branch auto-joins without a PIN. Lazy so the handshake page
// stays light when there's no quiz to render.
const QuizStudentApp = lazy(() =>
  import('@/components/quiz/QuizStudentApp').then((m) => ({
    default: m.QuizStudentApp,
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
  // The quiz join code that the teacher discovery flow embedded in the
  // studentViewUri. Present on a real quiz attachment; absent in the bare
  // handshake spike.
  const code = params.get('code') ?? '';

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);

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
      append(
        'signInWithCustomToken OK. Now RELOAD to test session persistence.'
      );
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, courseId, itemId, itemType, attachmentId, loginHint]);

  // Once the student holds a studentRole session whose classIds cover THIS
  // course, and the attachment carried a quiz code, render the real quiz runner.
  // Gating on the course claim means a stale session from another course falls
  // back to the handshake (which re-mints the token for this courseId) instead
  // of silently failing the Firestore class-gate. This also makes re-entry
  // frictionless: a persisted session renders the quiz with no extra click.
  const sessionClassIds = Array.isArray(session?.classIds)
    ? (session?.classIds as unknown[]).map((c) => String(c))
    : [];
  const hasCourseClaim = courseId
    ? sessionClassIds.includes(`classroom:${courseId}`)
    : sessionClassIds.length > 0;
  if (code && session?.studentRole === true && hasCourseClaim) {
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">
            Classroom Add-on — student handshake spike
          </h1>
          <p className="text-sm text-slate-400">
            Throwaway de-risk page. Proves OAuth-popup → getAddOnContext →
            custom-token sign-in survives Classroom&apos;s partitioned iframe.
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
            {busy ? 'Working…' : code ? 'Start quiz' : 'Run handshake'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-white/20 px-4 py-2 font-medium transition hover:bg-white/10"
          >
            Reload (test persistence)
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
              No Firebase user. (After reload, this is the persistence signal.)
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
