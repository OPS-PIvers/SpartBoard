/**
 * Schoology LTI 1.3 Deep Linking — teacher resource picker (Spike 1).
 *
 * Route: /lti/teacher?mode=deeplink
 * Schoology opens this iframe for a `LtiDeepLinkingRequest` instructor launch
 * (the teacher clicked "Add Material → SpartBoard" in a course). The browser
 * arrives via a 302 from the ltiLaunch Cloud Function carrying a one-time
 * `?lc=<launchCode>`.
 *
 * Flow (mirrors the Google Classroom add-on TeacherDiscoveryRoute "attach"
 * pipe, adapted for LTI deep linking):
 *   1. Exchange the launch code (`ltiExchange` callable) for the validated
 *      deep-linking context — specifically `deepLinking.deep_link_return_url`
 *      and the opaque `deepLinking.data` round-trip string.
 *   2. The teacher signs into SpartBoard (Google) and we load THEIR quiz
 *      library via `useQuiz` — exactly as TeacherDiscoveryRoute does.
 *   3. The teacher picks one quiz. We load its content from Drive and compute
 *      `maxPoints` = total question points (so Schoology's gradebook column
 *      reads e.g. 17/20, not a percentage) — the same computation as the
 *      Classroom attach flow.
 *   4. `ltiSignDeepLinkResponseV1` signs a JWT deep-linking response carrying
 *      the chosen quiz. We deliver it the LTI way: auto-submit a hidden HTML
 *      form POST to `deep_link_return_url` with a single `JWT` field. Schoology
 *      consumes the response and creates the graded material.
 *
 * UI reuses the Classroom add-on's light-theme AddonShell kit (Schoology's
 * chrome is light), matching the add-on's teacher screens.
 */
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { httpsCallable } from 'firebase/functions';
import { ClipboardList, CheckCircle2, Send } from 'lucide-react';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { getQuizBehavior } from '@/utils/quizBehavior';
import { logError } from '@/utils/logError';
import {
  AddonShell,
  AddonHeader,
  AddonCard,
  AddonButton,
  AddonStatus,
  AddonError,
  AddonSelect,
} from '@/components/classroomAddon/AddonShell';

/**
 * Raw LTI `deep_linking_settings` claim. Only the fields we consume are typed;
 * `deep_link_return_url` is where the signed response is POSTed and `data` is an
 * opaque platform round-trip value that MUST be echoed back in the response.
 */
interface DeepLinkingSettings {
  deep_link_return_url?: string;
  data?: string;
}

/** Subset of the `ltiExchange` result this picker depends on. */
interface LtiExchangeResult {
  role: 'student' | 'teacher' | 'unknown';
  messageType: string;
  isDeepLinking: boolean;
  studentRole: boolean;
  contextId?: string | null;
  deepLinking?: DeepLinkingSettings;
}

/** Pinned contract for the deep-link response signer (built server-side). */
interface SignDeepLinkResponseParams {
  returnUrl: string;
  dlData?: string;
  kind: 'quiz';
  quizCode: string;
  title: string;
  maxPoints?: number;
}

interface SignDeepLinkResponseResult {
  jwt: string;
  returnUrl: string;
}

type Phase = 'exchanging' | 'ready' | 'error';

const NO_CODE_MESSAGE =
  'No launch code found. Add SpartBoard from inside a Schoology course.';

/**
 * Deliver the signed LTI deep-linking response. Per the spec, this is an
 * auto-submitting HTML form POST to the platform's `deep_link_return_url`
 * carrying a single `JWT` field. We build the form detached, attach it to the
 * document just long enough to submit (a detached form cannot navigate), and
 * submit it — which navigates the iframe back to Schoology.
 */
function postDeepLinkResponse(returnUrl: string, jwt: string): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = returnUrl;
  // No target → submit navigates this (iframe) window back to the platform.
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'JWT';
  input.value = jwt;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

export const LtiDeepLinkPicker: React.FC = () => {
  // Derive the launch code during render (stable for this page load) so the
  // "missing code" case is handled via initial state — never a synchronous
  // setState inside an effect (the repo lints react-hooks/set-state-in-effect).
  const code =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('lc') ?? '');

  const [phase, setPhase] = useState<Phase>(code ? 'exchanging' : 'error');
  const [deepLinking, setDeepLinking] = useState<DeepLinkingSettings | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(
    code ? null : NO_CODE_MESSAGE
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Latches once the response form is submitted so the picker shows a terminal
  // "returning to Schoology" state instead of an interactive picker.
  const [submitted, setSubmitted] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [contextId, setContextId] = useState<string | null>(null);
  const ranRef = useRef(false);
  const quizSelectId = useId();

  const { user, signInWithGoogle } = useAuth();
  const { quizzes, loadQuizData, loading: quizzesLoading } = useQuiz(user?.uid);
  const { createAssignment } = useQuizAssignments(user?.uid);

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId),
    [quizzes, selectedQuizId]
  );

  // Exchange the one-time launch code for the validated deep-linking context.
  // Effect is the right tool here: it synchronizes with an external system (the
  // Cloud Function) on mount. Run-once via ref guard.
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
        if (!data.isDeepLinking || !data.deepLinking?.deep_link_return_url) {
          setErrorMsg(
            'This launch is not a deep-linking request. Add SpartBoard from ' +
              'the course materials menu.'
          );
          setPhase('error');
          return;
        }
        setDeepLinking(data.deepLinking);
        setContextId(data.contextId ?? null);
        setPhase('ready');
      } catch (e) {
        setErrorMsg(
          e instanceof Error ? e.message : 'Launch validation failed.'
        );
        setPhase('error');
      }
    })();
  }, [code]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      setStatusMsg('Signing in to SpartBoard…');
      await signInWithGoogle();
      setStatusMsg('Signed in. Pick a quiz to add.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Couldn't sign in: ${message}`);
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  }, [signInWithGoogle]);

  const addQuiz = useCallback(async () => {
    if (!selectedQuiz) {
      setStatusMsg('Pick a quiz first.');
      return;
    }
    const returnUrl = deepLinking?.deep_link_return_url;
    if (!returnUrl) {
      setErrorMsg(
        'Missing the Schoology return URL — re-open SpartBoard from the ' +
          'course materials menu.'
      );
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      setStatusMsg(`Loading "${selectedQuiz.title}"…`);
      const quizData = await loadQuizData(selectedQuiz.driveFileId);

      // The gradebook scale = the quiz's total points, so a 17/20 quiz reads as
      // 17/20 in Schoology (not a percentage out of 100). Fall back to 100 only
      // when the quiz has no questions/points to sum. Same computation as the
      // Classroom attach flow (TeacherDiscoveryRoute.attachQuiz).
      const maxPoints =
        quizData.questions.reduce((sum, q) => sum + (q.points ?? 1), 0) || 100;

      if (!contextId) {
        throw new Error(
          'Missing course context — re-open SpartBoard from the course.'
        );
      }
      // Create a class-targeted quiz session (join code) the student runner joins
      // by — exactly like the Classroom attach flow. classIds scope the session to
      // this Schoology course so a studentRole token (classIds: ['schoology:<id>'])
      // passes the Firestore class-gate.
      setStatusMsg('Creating the assignment…');
      const { sessionMode, sessionOptions, attemptLimit } =
        getQuizBehavior(selectedQuiz);
      const { code: quizCode } = await createAssignment(
        {
          id: selectedQuiz.id,
          title: selectedQuiz.title,
          driveFileId: selectedQuiz.driveFileId,
          questions: quizData.questions,
        },
        {
          className: 'Schoology',
          sessionMode,
          sessionOptions,
          attemptLimit,
        },
        {
          classIds: [`schoology:${contextId}`],
          initialStatus: 'active',
        }
      );

      setStatusMsg('Adding the quiz to Schoology…');
      const sign = httpsCallable<
        SignDeepLinkResponseParams,
        SignDeepLinkResponseResult
      >(functions, 'ltiSignDeepLinkResponseV1');
      const { data } = await sign({
        returnUrl,
        ...(deepLinking?.data !== undefined
          ? { dlData: deepLinking.data }
          : {}),
        kind: 'quiz',
        quizCode,
        title: selectedQuiz.title,
        maxPoints,
      });

      setSubmitted(true);
      setStatusMsg('Returning to Schoology…');
      // Deliver the signed response: auto-submitting form POST navigates this
      // iframe back to the platform, which creates the graded material.
      postDeepLinkResponse(data.returnUrl, data.jwt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('LtiDeepLinkPicker.addQuiz', err, {
        quizId: selectedQuiz.id,
      });
      setErrorMsg(`Couldn't add the quiz: ${message}`);
      setStatusMsg(null);
      setSubmitted(false);
    } finally {
      setBusy(false);
    }
  }, [selectedQuiz, deepLinking, loadQuizData, createAssignment, contextId]);

  return (
    <AddonShell>
      <AddonHeader
        icon={ClipboardList}
        title="Add a SpartBoard quiz"
        subtitle="Pick a quiz from your library. Students take it inside Schoology and their score posts back to the gradebook."
      />

      {phase === 'error' ? (
        <AddonError message={errorMsg} />
      ) : phase === 'exchanging' ? (
        <AddonStatus message="Validating your Schoology launch…" busy />
      ) : submitted ? (
        <AddonCard className="p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <p className="text-sm leading-relaxed text-slate-600">
              Adding your quiz to Schoology…
            </p>
          </div>
        </AddonCard>
      ) : !user ? (
        <AddonCard className="p-6">
          <p className="mb-4 text-sm text-slate-500">
            Sign in with your school Google account to load your SpartBoard quiz
            library.
          </p>
          <AddonButton onClick={() => void signIn()} loading={busy}>
            Sign in to SpartBoard
          </AddonButton>
        </AddonCard>
      ) : (
        <div className="space-y-4">
          <AddonCard className="p-4">
            <label
              htmlFor={quizSelectId}
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Quiz
            </label>
            <AddonSelect
              id={quizSelectId}
              ariaLabel="Quiz"
              value={selectedQuizId}
              onChange={setSelectedQuizId}
              disabled={busy || quizzesLoading}
              placeholder={
                quizzesLoading
                  ? 'Loading your quizzes…'
                  : quizzes.length === 0
                    ? 'No quizzes in your library yet'
                    : 'Select a quiz…'
              }
              options={quizzes.map((q) => ({ value: q.id, label: q.title }))}
            />
          </AddonCard>

          <AddonButton
            onClick={() => void addQuiz()}
            loading={busy}
            disabled={!selectedQuizId}
            icon={Send}
          >
            Add quiz to Schoology
          </AddonButton>
        </div>
      )}

      {phase !== 'error' && (
        <div className="mt-4 space-y-2">
          <AddonError message={errorMsg} />
          <AddonStatus message={statusMsg} busy={busy} />
        </div>
      )}
    </AddonShell>
  );
};

export default LtiDeepLinkPicker;
