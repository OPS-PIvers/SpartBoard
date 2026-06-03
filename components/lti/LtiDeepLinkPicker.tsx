/**
 * Schoology LTI 1.3 Deep Linking — teacher resource picker.
 *
 * Route: /lti/teacher?mode=deeplink  (Schoology opens this iframe when a teacher
 * clicks "Add Material → SpartBoard"; the browser arrives via a 302 from the
 * ltiLaunch Cloud Function carrying a one-time `?lc=<launchCode>`.)
 *
 * Flow: exchange the launch code → the teacher signs in (Google) → load THEIR
 * quiz library → pick one → create a class-targeted assignment → sign the
 * LtiDeepLinkingResponse → auto-POST it to `deep_link_return_url`, which Schoology
 * consumes to create the graded material.
 *
 * IMPORTANT — Context-Aware Access dependency: the teacher's Google sign-in runs
 * inside Schoology's iframe. That only works if the Orono Workspace admin has
 * EXEMPTED the SpartBoard OAuth app from the Context-Aware Access rule (or marked
 * it Trusted under API Controls → App Access Control). Without that, Google
 * returns "Account Restricted" (access_not_configured) at the token step. We
 * proved this can't be worked around client-side: any context opened FROM the
 * iframe (in-iframe popup, window.open, even a severed `noopener` tab) inherits
 * the iframe's storage partition and is denied; only a context with no
 * creation-relationship to the iframe is first-party. So the fix lives in the
 * Workspace admin console, and this picker is the clean in-iframe experience for
 * once the app is exempted. (Students are unaffected — server-minted token.)
 *
 * UI reuses the Classroom add-on's light-theme AddonShell kit.
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
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import { logError } from '@/utils/logError';
import { isGoogleSession } from '@/utils/googleSession';
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
  isDeepLinking: boolean;
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
 * Deliver the signed LTI deep-linking response: an auto-submitting hidden-form
 * POST to the platform's `deep_link_return_url` carrying a single `JWT` field.
 * The form is attached just long enough to submit (a detached form cannot
 * navigate); submitting navigates this iframe back to Schoology.
 *
 * SECURITY: the return URL is platform-supplied (validated server-side before
 * signing), but we re-validate it here — inline, so the guard dominates the
 * `form.action` sink — against the same https + schoology.com allowlist the
 * server uses (`isSchoologyReturnUrl`), then submit the PARSED href. A
 * tampered/forged value — a `javascript:`/`data:` scheme (DOM XSS) or a foreign
 * host (open redirect) — is rejected, never assigned to the form.
 */
function postDeepLinkResponse(returnUrl: string, jwt: string): void {
  let parsed: URL | null = null;
  try {
    parsed = new URL(returnUrl);
  } catch {
    parsed = null;
  }
  if (
    !parsed ||
    parsed.protocol !== 'https:' ||
    !/(^|\.)schoology\.com$/.test(parsed.hostname)
  ) {
    throw new Error(
      'Refusing to submit the deep-link response: invalid or non-Schoology return URL.'
    );
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = parsed.href;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'JWT';
  input.value = jwt;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

export const LtiDeepLinkPicker: React.FC = () => {
  // Derive the launch code during render so the "missing code" case is initial
  // state, never a synchronous setState inside an effect.
  const code =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('lc') ?? '');

  const [phase, setPhase] = useState<Phase>(code ? 'exchanging' : 'error');
  const [deepLinking, setDeepLinking] = useState<DeepLinkingSettings | null>(
    null
  );
  const [contextId, setContextId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    code ? null : NO_CODE_MESSAGE
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const quizSelectId = useId();
  const ranRef = useRef(false);
  // Caches the created assignment per quiz id so a retry after a failed sign /
  // POST reuses it instead of spawning a SECOND orphaned session + join code.
  const createdRef = useRef<
    Map<string, { quizCode: string; maxPoints: number }>
  >(new Map());

  const { user, signInWithGoogle, googleAccessToken } = useAuth();
  // First-party Google session required (uid + Drive token) — NOT just any
  // Firebase session. A leftover studentRole custom-token session restored in
  // the partitioned iframe has a uid but no google.com provider/Drive token;
  // gating on it would list the wrong (empty) library and skip sign-in.
  const teacherReady = isGoogleSession(user) && !!googleAccessToken;
  const libraryUid = teacherReady ? user?.uid : undefined;
  const {
    quizzes,
    loadQuizData,
    loading: quizzesLoading,
  } = useQuiz(libraryUid);
  const { createAssignment } = useQuizAssignments(libraryUid);

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId),
    [quizzes, selectedQuizId]
  );

  // Exchange the one-time launch code for the validated deep-linking context.
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
    if (!contextId) {
      setErrorMsg(
        'Missing course context — re-open SpartBoard from the course.'
      );
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      // Reuse a previously-created assignment for this quiz on retry, so a failed
      // sign / POST never spawns a SECOND orphaned session + join code. The create
      // step runs at most once per quiz; only the idempotent sign re-runs.
      let created = createdRef.current.get(selectedQuiz.id);
      if (!created) {
        setStatusMsg(`Loading "${selectedQuiz.title}"…`);
        const quizData = await loadQuizData(selectedQuiz.driveFileId);

        // Gradebook scale = the quiz's total points, so a 17/20 quiz reads 17/20
        // in Schoology (not a percentage). Shared with the grader via quizMaxPoints.
        const maxPoints = quizMaxPoints(quizData.questions);

        // Class-targeted session (join code) the student runner joins by —
        // classIds scope it to this Schoology course so a studentRole token
        // (classIds: ['schoology:<id>']) passes the Firestore class-gate.
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
        created = { quizCode, maxPoints };
        createdRef.current.set(selectedQuiz.id, created);
      }

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
        quizCode: created.quizCode,
        title: selectedQuiz.title,
        maxPoints: created.maxPoints,
      });

      setSubmitted(true);
      setStatusMsg('Returning to Schoology…');
      // Auto-submitting form POST navigates this iframe back to the platform,
      // which creates the graded material.
      postDeepLinkResponse(data.returnUrl, data.jwt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('LtiDeepLinkPicker.addQuiz', err, { quizId: selectedQuiz.id });
      setErrorMsg(`Couldn't add the quiz: ${message}`);
      setStatusMsg(null);
      setSubmitted(false);
    } finally {
      setBusy(false);
    }
  }, [selectedQuiz, deepLinking, contextId, loadQuizData, createAssignment]);

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
      ) : !teacherReady ? (
        <AddonCard className="p-6">
          <p className="mb-4 text-sm text-slate-500">
            {user
              ? 'Sign in with your teacher Google account to load your SpartBoard quiz library.'
              : 'Sign in with your school Google account to load your SpartBoard quiz library.'}
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
