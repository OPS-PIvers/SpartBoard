/**
 * Schoology LTI 1.3 launch surface (Spike 0).
 *
 * Routes: /lti/student, /lti/teacher (and /lti/teacher?mode=deeplink).
 * The browser arrives here via a 302 from the ltiLaunch Cloud Function after the
 * OIDC handshake + id_token validation, carrying a one-time `?lc=<launchCode>`.
 *
 * This page exchanges that code (ltiExchange callable) for the validated launch
 * context. A Learner launch signs in with the studentRole custom token and
 * mounts the quiz runner; an Instructor launch of an attached quiz mounts the
 * in-iframe teacher review (responses, grading, publish, push to Schoology).
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { auth, functions } from '@/config/firebase';

const QuizStudentApp = lazy(() =>
  import('@/components/quiz/QuizStudentApp').then((m) => ({
    default: m.QuizStudentApp,
  }))
);
const TeacherReview = lazy(() =>
  import('@/components/classroomAddon/TeacherReviewRoute').then((m) => ({
    default: m.ClassroomAddonTeacherReview,
  }))
);

interface LtiExchangeResult {
  role: 'student' | 'teacher' | 'unknown';
  messageType: string;
  isDeepLinking: boolean;
  contextId: string | null;
  contextTitle: string | null;
  resourceLinkId: string | null;
  deploymentId: string;
  name: string | null;
  email: string | null;
  studentRole: boolean;
  customToken?: string;
  /** Content-item custom params replayed by Schoology (`kind`, `quiz_code`, `session_id`). */
  custom?: Record<string, unknown> | null;
}

type Phase = 'working' | 'done' | 'error';

const NO_CODE_MESSAGE =
  'No launch code found. Open SpartBoard from inside Schoology.';

const PageLoader: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <Loader2 className="h-10 w-10 animate-spin text-brand-blue-primary" />
  </div>
);

export const LtiLaunchPage: React.FC = () => {
  // Derive the launch code during render (stable for this page load) so the
  // "missing code" case is handled via initial state, not a synchronous
  // setState inside the effect.
  const params = new URLSearchParams(window.location.search);
  const code = params.get('lc') ?? '';
  const quizCode = params.get('code') ?? '';
  const [phase, setPhase] = useState<Phase>(code ? 'working' : 'error');
  const [result, setResult] = useState<LtiExchangeResult | null>(null);
  const [error, setError] = useState<string | null>(
    code ? null : NO_CODE_MESSAGE
  );
  const ranRef = useRef(false);

  useEffect(() => {
    if (!code || ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      try {
        const exchange = httpsCallable<{ code: string }, LtiExchangeResult>(
          functions,
          'ltiExchange'
        );
        const { data } = await exchange({ code });
        // A Learner launch MUST carry a custom token. Without it, proceeding
        // would mount the quiz runner as an anonymous/wrong identity instead of
        // the SSO student — so treat a missing token as a hard failure rather
        // than silently signing in as no one.
        if (data.studentRole) {
          if (!data.customToken) {
            throw new Error('Student sign-in token missing from launch.');
          }
          await signInWithCustomToken(auth, data.customToken);
        }
        setResult(data);
        setPhase('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Launch validation failed.');
        setPhase('error');
      }
    })();
  }, [code]);

  // Student launch with a quiz attached: after sign-in, hand off to the quiz
  // runner. It reads ?code= and SSO-auto-joins using the studentRole token.
  if (phase === 'done' && result?.studentRole && quizCode) {
    return (
      <Suspense fallback={<PageLoader />}>
        <QuizStudentApp
          embedded
          watermarkNameOverride={result.name ?? undefined}
        />
      </Suspense>
    );
  }

  // Instructor resource-link launch: review the attached quiz right here. Only
  // the /lti/teacher route mounts AuthProvider (the review needs useAuth).
  const isTeacherRoute = window.location.pathname.startsWith('/lti/teacher');
  if (
    phase === 'done' &&
    result &&
    !result.studentRole &&
    !result.isDeepLinking &&
    isTeacherRoute
  ) {
    const custom = result.custom ?? {};
    const kind = typeof custom['kind'] === 'string' ? custom['kind'] : 'quiz';
    const attachedCode =
      typeof custom['quiz_code'] === 'string' ? custom['quiz_code'] : '';
    if (kind !== 'quiz' || attachedCode) {
      return (
        <Suspense fallback={<PageLoader />}>
          <TeacherReview kind={kind} code={attachedCode} platform="schoology" />
        </Suspense>
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
        {phase === 'working' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-brand-blue-primary" />
            <p className="text-base font-medium text-slate-700">
              Validating your Schoology launch…
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertTriangle className="h-10 w-10 text-brand-red-primary" />
            <p className="text-base font-semibold text-slate-800">
              Launch couldn’t be validated
            </p>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-base font-semibold text-slate-800">
              Nothing to show for this link
            </p>
            <p className="text-sm text-slate-500">
              {result.studentRole
                ? 'This assignment isn’t linked to a SpartBoard quiz. Ask your teacher to re-add it.'
                : 'This assignment isn’t linked to a SpartBoard quiz. Remove it and add it again from Schoology’s resource picker.'}
            </p>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue-primary hover:underline"
            >
              Open SpartBoard
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default LtiLaunchPage;
