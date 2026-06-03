/**
 * Schoology LTI 1.3 Deep Linking — teacher resource picker.
 *
 * Route: /lti/teacher?mode=deeplink  (Schoology opens this in an iframe when a
 * teacher clicks "Add Material → SpartBoard"; the browser arrives via a 302 from
 * the ltiLaunch Cloud Function carrying a one-time `?lc=<launchCode>`.)
 *
 * Why the two modes below: the teacher's Google OAuth CANNOT run inside the
 * Schoology iframe. Every context OPENED FROM the iframe — an in-iframe popup, a
 * `window.open` window, even a severed `noopener` tab — inherits Schoology's
 * storage partition, so Google Workspace Context-Aware Access denies the token
 * ("Account Restricted"). The ONLY first-party context is one where SpartBoard
 * is the TOP-LEVEL document (no longer a child of the iframe).
 *
 *  - LAUNCHER (when framed, i.e. inside Schoology): a thin screen whose "Continue
 *    to sign in" button navigates the ENTIRE top-level tab to this same launch
 *    URL (`window.top.location`). It does NOT consume the one-time launch code —
 *    the top-level instance does.
 *  - FLOW (when NOT framed, i.e. after the top redirect): SpartBoard is now the
 *    top-level document → first-party → Google sign-in passes CAA. It exchanges
 *    the launch code, loads the teacher's quiz library, creates the assignment,
 *    signs the LtiDeepLinkingResponse, delivers it (see postDeepLinkResponse),
 *    then sends the tab back to the teacher's Schoology course materials. The
 *    launch replaced the course tab to reach this first-party context, so the
 *    flow restores the teacher to the course itself — one tab, no manual return.
 *
 * Schoology's iframe DOES permit the top-navigation this relies on (verified
 * live); the deep-link RESPONSE is delivered via a hidden iframe rather than a
 * top-level POST — see postDeepLinkResponse for why.
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
import { ClipboardList, CheckCircle2, Send, LogIn } from 'lucide-react';
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

/** True when we're rendered inside a frame (the Schoology iframe), not a tab. */
function isFramed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.top !== window.self;
  } catch {
    // Cross-origin access throwing means we're framed by another origin.
    return true;
  }
}

/**
 * Deliver the signed LTI deep-linking response: an auto-submitting hidden-form
 * POST to the platform's `deep_link_return_url` carrying a single `JWT` field.
 *
 * Why a hidden IFRAME instead of a top-level navigation: Schoology's
 * `content-return` page is built to run inside its Add-Materials iframe. The
 * FIRST POST creates the material (HTTP 200), but the returned page then submits
 * ITSELF again — harmless inside Schoology's own frame, but loaded TOP-LEVEL
 * (this flow is top-level for sign-in) that re-POST replays our single-use JWT
 * and Schoology rejects it 401 "Duplicate timestamp/nonce", which the teacher
 * would see. Targeting a sandboxed hidden iframe keeps the material-creating
 * POST exactly as a first-party `schoology.com` request (the return URL is a
 * Schoology-signed token carrying the teacher uid + course), while the page's
 * self-resubmit and any 401 stay contained and invisible. `onDelivered` fires on
 * the iframe's first load (the POST round-trip completed → material created), so
 * the caller can then navigate the tab back to the course.
 *
 * SECURITY: the return URL is platform-supplied (validated server-side before
 * signing), but we re-validate it here — inline, so the guard dominates the
 * `form.action` sink — against the same https + schoology.com allowlist the
 * server uses (`isSchoologyReturnUrl`), then submit the PARSED href. A
 * tampered/forged value — a `javascript:`/`data:` scheme (DOM XSS) or a foreign
 * host (open redirect) — is rejected, never assigned to the form.
 */
function postDeepLinkResponse(
  returnUrl: string,
  jwt: string,
  onDelivered: () => void
): void {
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

  // Sandboxed so Schoology's returned page can run its scripts/auto-submit but
  // CANNOT bust out to navigate our top-level tab; allow-same-origin keeps its
  // real schoology.com origin so it can read its own session.
  const iframe = document.createElement('iframe');
  iframe.name = 'lti-dl-return';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.display = 'none';
  iframe.sandbox.add('allow-same-origin', 'allow-scripts', 'allow-forms');

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = parsed.href;
  form.target = 'lti-dl-return';
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'JWT';
  input.value = jwt;
  form.appendChild(input);

  // Fire onDelivered exactly once — on the iframe's first load (POST processed →
  // material created), or a generous timeout fallback if the load never fires.
  // Waiting matters: navigating the tab away before the POST round-trips would
  // abort the in-flight request and the material would never be created.
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onDelivered();
  };
  iframe.addEventListener('load', finish, { once: true });
  window.setTimeout(finish, 5000);

  document.body.appendChild(iframe);
  document.body.appendChild(form);
  form.submit();
}

/**
 * Shown inside the Schoology iframe. Navigates the entire top-level tab to this
 * same launch URL, where SpartBoard loads first-party (Google OAuth passes CAA).
 * Does NOT exchange the one-time launch code — the top-level instance does.
 */
const LtiDeepLinkLauncher: React.FC = () => {
  const [redirecting, setRedirecting] = useState(false);
  const hasCode =
    typeof window !== 'undefined' &&
    !!new URLSearchParams(window.location.search).get('lc');

  const continueTopLevel = useCallback(() => {
    // Navigate window.top to this same launch URL. A cross-origin child may SET
    // window.top.location (top navigation is permitted by the same-origin policy)
    // UNLESS the platform's iframe sandbox forbids it (no
    // allow-top-navigation[-by-user-activation]). A sandbox block fails silently
    // (no throw), so success is observed by the tab actually navigating away.
    setRedirecting(true);
    try {
      if (window.top) {
        window.top.location.href = window.location.href;
      }
    } catch {
      // Some browsers raise a SecurityError instead of failing silently.
      setRedirecting(false);
    }
  }, []);

  return (
    <AddonShell>
      <AddonHeader
        icon={ClipboardList}
        title="Add a SpartBoard quiz"
        subtitle="Pick a quiz from your library. Students take it inside Schoology and their score posts back to the gradebook."
      />

      {!hasCode ? (
        <AddonError message={NO_CODE_MESSAGE} />
      ) : (
        <AddonCard className="p-6">
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            Schoology runs SpartBoard in a frame, where Google sign-in is
            blocked. Continue to open SpartBoard in this tab, sign in, and pick
            your quiz — you’ll come right back to this course when you’re done.
          </p>
          <AddonButton
            onClick={continueTopLevel}
            icon={LogIn}
            loading={redirecting}
          >
            Continue to sign in
          </AddonButton>
          {redirecting && (
            <p className="mt-3 text-xs text-slate-400">
              Opening SpartBoard… If this page doesn’t change, your browser
              blocked the redirect — let your SpartBoard admin know.
            </p>
          )}
        </AddonCard>
      )}
    </AddonShell>
  );
};

/**
 * Runs as the top-level document (first-party) after the launcher's redirect:
 * exchange launch code → sign in → pick → create assignment → sign response →
 * POST it back to Schoology (which navigates this tab back into the course).
 */
const LtiDeepLinkFlow: React.FC = () => {
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
  // The Schoology course-materials URL we send the teacher back to once the
  // material is created (also offered as a manual link if auto-redirect stalls).
  const [returnHref, setReturnHref] = useState<string | null>(null);
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

      // Where to send the teacher once the material is created: their Schoology
      // course materials. The launch replaced the course tab to get a first-party
      // sign-in context, so we restore them to the course ourselves. Guard the URL
      // inline (same https + schoology.com allowlist as the response POST, fixed
      // path, encoded course id) so window.location can't be pointed off-platform.
      let courseUrl: string | null = null;
      try {
        const u = new URL(returnUrl);
        if (
          u.protocol === 'https:' &&
          /(^|\.)schoology\.com$/.test(u.hostname)
        ) {
          courseUrl = `${u.origin}/course/${encodeURIComponent(contextId)}/materials`;
        }
      } catch {
        courseUrl = null;
      }

      setReturnHref(courseUrl);
      setSubmitted(true);
      setStatusMsg('Adding the quiz and returning to your course…');
      // Deliver the signed response into a hidden iframe (this is the POST that
      // creates the material); when it round-trips, send the tab to the course.
      postDeepLinkResponse(returnUrl, data.jwt, () => {
        if (courseUrl) window.location.assign(courseUrl);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('LtiDeepLinkFlow.addQuiz', err, { quizId: selectedQuiz.id });
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
            <div className="text-sm leading-relaxed text-slate-600">
              <p>Quiz added — taking you back to your course…</p>
              {returnHref && (
                <p className="mt-2 text-slate-500">
                  Not redirected?{' '}
                  <a
                    href={returnHref}
                    className="font-medium text-blue-600 underline"
                  >
                    Return to your course
                  </a>
                  .
                </p>
              )}
            </div>
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

/**
 * Dispatcher: inside the Schoology iframe → the launcher (which redirects the
 * top-level tab to SpartBoard); as the top-level document → the real picker flow.
 */
export const LtiDeepLinkPicker: React.FC = () => {
  return isFramed() ? <LtiDeepLinkLauncher /> : <LtiDeepLinkFlow />;
};

export default LtiDeepLinkPicker;
