/**
 * Schoology LTI 1.3 Deep Linking — top-level handoff WINDOW.
 *
 * Route: /lti/teacher?mode=deeplink&handoff=1 (opened via window.open by the
 * in-iframe launcher in LtiDeepLinkPicker).
 *
 * This window runs at TOP LEVEL on spartboard.web.app (NOT embedded in
 * Schoology), so the teacher's Google OAuth is first-party and Google Workspace
 * Context-Aware Access passes — the popup-in-iframe path fails CAA with
 * "Account Restricted". See deepLinkHandoff.ts for the full rationale.
 *
 * Flow:
 *   1. Signal the opener (the iframe) we're READY; receive the deep-link context
 *      (`returnUrl` / `dlData` / `contextId`) it got from its one-time launch-code
 *      exchange. (This window has no launch code — it's single-use, already spent.)
 *   2. Teacher signs into SpartBoard (Google, first-party → CAA OK); we load
 *      THEIR quiz library via `useQuiz`.
 *   3. Teacher picks a quiz → load content → maxPoints → create a class-targeted
 *      assignment → `ltiSignDeepLinkResponseV1` signs the response JWT.
 *   4. We hand the signed JWT back to the iframe (postMessage), which form-POSTs
 *      it to Schoology and finishes the attach — the normal deep-link ending. If
 *      the opener is gone, we fall back to POSTing the response from here.
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
  DL_HANDOFF_READY,
  DL_HANDOFF_CONTEXT,
  DL_HANDOFF_RESPONSE,
  type DlHandoffContext,
  parseHandoffMessage,
  postHandoffMessage,
  postDeepLinkResponse,
} from './deepLinkHandoff';
import {
  AddonShell,
  AddonHeader,
  AddonCard,
  AddonButton,
  AddonStatus,
  AddonError,
  AddonSelect,
} from '@/components/classroomAddon/AddonShell';

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

type Phase = 'waiting' | 'ready' | 'error';

const NO_OPENER_MESSAGE =
  'Open SpartBoard from inside a Schoology course (Add Materials → SpartBoard), then choose your quiz when prompted.';

export const LtiDeepLinkWindow: React.FC = () => {
  // Whether we were opened by the iframe launcher. Derived at init (not in an
  // effect) so the "no opener" case is handled via initial state.
  const initialOpener =
    typeof window === 'undefined' ? null : (window.opener as Window | null);
  const hasOpener = !!initialOpener && !initialOpener.closed;

  const [phase, setPhase] = useState<Phase>(hasOpener ? 'waiting' : 'error');
  const [errorMsg, setErrorMsg] = useState<string | null>(
    hasOpener ? null : NO_OPENER_MESSAGE
  );
  const [ctx, setCtx] = useState<DlHandoffContext | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const quizSelectId = useId();
  // Caches the created assignment per quiz id so a retry after a failed sign /
  // POST reuses it instead of spawning a SECOND orphaned session + join code.
  const createdRef = useRef<
    Map<string, { quizCode: string; maxPoints: number }>
  >(new Map());

  const { user, signInWithGoogle, googleAccessToken } = useAuth();
  // First-party Google session required (uid + Drive token) — same guard as the
  // launcher. Here it WORKS because the window is top-level, not iframed.
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

  // Handshake with the launcher: announce READY, then receive the deep-link
  // context. Effect is correct here — it wires up a DOM event listener (external
  // system). setState happens only inside the event handler, never synchronously.
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) return;

    const onMessage = (event: MessageEvent) => {
      const msg = parseHandoffMessage(event);
      if (msg?.type === DL_HANDOFF_CONTEXT) {
        setCtx(msg.context);
        setPhase('ready');
      }
    };
    window.addEventListener('message', onMessage);
    postHandoffMessage(opener, { type: DL_HANDOFF_READY });
    // Re-announce once in case our first READY landed before the launcher's
    // listener was attached (it replies with CONTEXT on either).
    const retry = window.setTimeout(() => {
      if (!opener.closed)
        postHandoffMessage(opener, { type: DL_HANDOFF_READY });
    }, 800);

    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(retry);
    };
  }, []);

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
    if (!ctx) {
      setErrorMsg(
        'Lost the Schoology context — reopen SpartBoard from the course.'
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
            classIds: [`schoology:${ctx.contextId}`],
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
        returnUrl: ctx.returnUrl,
        ...(ctx.dlData !== undefined ? { dlData: ctx.dlData } : {}),
        kind: 'quiz',
        quizCode: created.quizCode,
        title: selectedQuiz.title,
        maxPoints: created.maxPoints,
      });

      setSubmitted(true);

      // Hand the signed response back to the iframe, which navigates back to
      // Schoology. If the opener is gone, complete the deep-link return from
      // this window as a fallback.
      const opener = window.opener as Window | null;
      if (opener && !opener.closed) {
        postHandoffMessage(opener, {
          type: DL_HANDOFF_RESPONSE,
          response: { jwt: data.jwt, returnUrl: data.returnUrl },
        });
        setStatusMsg('Added — returning to Schoology…');
        // Give the message a tick to flush before closing ourselves.
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            // Some browsers block close() for non-script-opened windows; the
            // teacher can close the tab manually — the attach already completed.
          }
        }, 500);
      } else {
        setStatusMsg('Returning to Schoology…');
        postDeepLinkResponse(data.returnUrl, data.jwt);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('LtiDeepLinkWindow.addQuiz', err, { quizId: selectedQuiz.id });
      setErrorMsg(`Couldn't add the quiz: ${message}`);
      setStatusMsg(null);
      setSubmitted(false);
    } finally {
      setBusy(false);
    }
  }, [selectedQuiz, ctx, loadQuizData, createAssignment]);

  return (
    <AddonShell>
      <AddonHeader
        icon={ClipboardList}
        title="Add a SpartBoard quiz"
        subtitle="Pick a quiz from your library. Students take it inside Schoology and their score posts back to the gradebook."
      />

      {phase === 'error' ? (
        <AddonError message={errorMsg} />
      ) : phase === 'waiting' ? (
        <AddonStatus message="Connecting to your Schoology course…" busy />
      ) : submitted ? (
        <AddonCard className="p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <p className="text-sm leading-relaxed text-slate-600">
              Quiz added. You can close this window — it’ll return to Schoology
              automatically.
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

export default LtiDeepLinkWindow;
