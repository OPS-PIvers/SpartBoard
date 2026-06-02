/**
 * Schoology LTI 1.3 launch surface (Spike 0).
 *
 * Routes: /lti/student, /lti/teacher (and /lti/teacher?mode=deeplink).
 * The browser arrives here via a 302 from the ltiLaunch Cloud Function after the
 * OIDC handshake + id_token validation, carrying a one-time `?lc=<launchCode>`.
 *
 * This page exchanges that code (ltiExchange callable) for the validated launch
 * context and — for a Learner launch — a studentRole custom token it signs in
 * with. For now it renders a diagnostic "launch validated" view that proves the
 * full handshake end-to-end; the real runner / deep-link picker / grader replace
 * this in Spikes 1+.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { auth, functions } from '@/config/firebase';
import { LTI_GRADER_ENABLED } from '@/config/constants';

const QuizStudentApp = lazy(() =>
  import('@/components/quiz/QuizStudentApp').then((m) => ({
    default: m.QuizStudentApp,
  }))
);
// Flag-gated instructor grader (pushes auto-graded scores to Schoology via AGS).
const LtiTeacherGrader = lazy(() =>
  import('@/components/lti/LtiTeacherGrader').then((m) => ({
    default: m.LtiTeacherGrader,
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
  /**
   * Server-issued AGS push credential for an instructor resource-link launch
   * (absent for student / deep-linking launches). The grader forwards it to
   * `ltiPushGradesForAssignmentV1` to write line-item Scores.
   */
  pushAuth?: string;
  /** Custom claim carried on an instructor launch — the attached quiz's join code. */
  custom?: { quiz_code?: string } | null;
}

type Phase = 'working' | 'done' | 'error';

const NO_CODE_MESSAGE =
  'No launch code found. Open SpartBoard from inside Schoology.';

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
    <span className="text-sm font-medium text-slate-500">{label}</span>
    <span className="text-right text-sm font-semibold text-slate-800">
      {value ?? <span className="text-slate-400">—</span>}
    </span>
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
        setResult(data);
        if (data.studentRole && data.customToken) {
          await signInWithCustomToken(auth, data.customToken);
        }
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
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <Loader2 className="h-10 w-10 animate-spin text-brand-blue-primary" />
          </div>
        }
      >
        <QuizStudentApp
          embedded
          watermarkNameOverride={result.name ?? undefined}
        />
      </Suspense>
    );
  }

  // Instructor resource-link launch (a teacher opened an already-attached quiz):
  // hand off to the in-iframe grader so they can push the auto-graded scores to
  // Schoology's gradebook. Flag-gated OFF — until then the instructor launch
  // keeps the validated-launch diagnostic card below. Requires the server-issued
  // `pushAuth` (AGS credential) and the attached quiz's join code. This page
  // never calls `useAuth`; the grader does, and it's mounted only on
  // /lti/teacher, which App.tsx wraps in AuthProvider.
  if (
    LTI_GRADER_ENABLED &&
    phase === 'done' &&
    result?.role === 'teacher' &&
    !result.isDeepLinking &&
    result.pushAuth &&
    result.custom?.quiz_code
  ) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <Loader2 className="h-10 w-10 animate-spin text-brand-blue-primary" />
          </div>
        }
      >
        <LtiTeacherGrader
          quizCode={result.custom.quiz_code}
          resourceLinkId={result.resourceLinkId ?? ''}
          pushAuth={result.pushAuth}
        />
      </Suspense>
    );
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
          <div>
            <div className="mb-5 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <h1 className="text-xl font-bold text-slate-800">
                Launch validated
              </h1>
              <p className="text-sm text-slate-500">
                {result.isDeepLinking
                  ? 'Deep-linking request received — the resource picker arrives in Spike 1.'
                  : result.studentRole
                    ? 'Signed in as a student — the quiz runner is wired up next.'
                    : 'Instructor launch — the grader is wired up next.'}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-2">
              <Row
                label="Role"
                value={<span className="capitalize">{result.role}</span>}
              />
              <Row label="Name" value={result.name} />
              <Row label="Course" value={result.contextTitle} />
              <Row label="Message type" value={result.messageType} />
              <Row label="Context ID" value={result.contextId} />
              <Row label="Resource link" value={result.resourceLinkId} />
              <Row label="Deployment" value={result.deploymentId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LtiLaunchPage;
