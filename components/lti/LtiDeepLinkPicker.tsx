/**
 * Schoology LTI 1.3 Deep Linking — teacher resource picker.
 *
 * Route: /lti/teacher?mode=deeplink  (Schoology opens this in an iframe when a
 * teacher clicks "Add Material → SpartBoard"; the browser arrives via a 302 from
 * the ltiLaunch Cloud Function carrying a one-time `?lc=<launchCode>`.)
 *
 * The picker runs INSIDE Schoology's iframe. Google sign-in works there now that
 * the app's Workspace Marketplace listing declares the Drive/Sheets/Calendar
 * scopes — the earlier "Account Restricted" failures were that listing
 * UNDER-DECLARING scopes, not a frame/partition problem. Running in-frame matters
 * for the return too: the signed deep-link RESPONSE is POSTed from within the
 * iframe, so Schoology's content-return page runs in its native context and
 * closes the dialog cleanly — no top-level self-resubmit, no "Duplicate
 * timestamp/nonce" 401.
 *
 * FALLBACK: if a teacher's in-iframe Google popup is ever blocked, the sign-in
 * card offers a link that navigates the whole top-level tab to this same launch
 * URL (`window.top.location`); SpartBoard then loads first-party in the tab and
 * the flow completes there. The one-time launch code is therefore exchanged only
 * AFTER sign-in, so that fallback can redirect with the code still unconsumed
 * (the launch code's 5-minute TTL comfortably covers a sign-in).
 *
 * PARITY: this picker mirrors the Google Classroom add-on's
 * TeacherDiscoveryRoute — a Quiz / Video Activity segmented selector, the
 * activity's configured behavior carried through, per-assignment settings
 * (teacher name + optional PLC share), and the Schoology section connected to
 * the assignment AT CREATION (periodNames + classPeriodByClassId) so the
 * teacher's monitor shows the class immediately, before any student launches.
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
import {
  ClipboardList,
  Video,
  CheckCircle2,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { usePlcs } from '@/hooks/usePlcs';
import type {
  PlcLinkage,
  VideoActivitySessionOptions,
  VideoActivitySessionSettings,
} from '@/types';
import { getQuizBehavior, formatBehaviorSummary } from '@/utils/quizBehavior';
import {
  getVideoActivityBehavior,
  formatVideoActivityBehaviorSummary,
} from '@/utils/videoActivityBehavior';
import { buildPlcLinkage } from '@/utils/plcLinkage';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import { videoActivityMaxPoints } from '@/utils/videoActivityGrading';
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
  /**
   * The Schoology section name (e.g. "Algebra 1 - Period 2"). The CF returns
   * it from the validated launch; we connect it to the assignment at creation
   * so the teacher's monitor shows the class immediately — before any student
   * launches and triggers the server's first-launch backstop.
   */
  contextTitle?: string | null;
  deepLinking?: DeepLinkingSettings;
}

/**
 * Pinned contract for the deep-link response signer (built server-side). A
 * discriminated union over `kind`: a quiz carries its persistent join `quizCode`;
 * a video activity carries its `sessionId` (VA has no join code). The callable
 * sets the right launch custom claim from whichever set we pass.
 */
type SignDeepLinkResponseParams = {
  returnUrl: string;
  dlData?: string;
  title: string;
  maxPoints?: number;
  /** Optional due date (epoch ms). Server emits it as `submission.endDateTime`
   *  so Schoology sets the created assignment's due date. */
  dueAt?: number;
} & ({ kind: 'quiz'; quizCode: string } | { kind: 'va'; sessionId: string });

interface SignDeepLinkResponseResult {
  jwt: string;
  returnUrl: string;
}

type Phase = 'exchanging' | 'ready' | 'error';
type ContentKind = 'quiz' | 'va';

const NO_CODE_MESSAGE =
  'No launch code found. Add SpartBoard from inside a Schoology course.';

// Conservative PLAYER defaults for an async Schoology attachment — mirrors the
// VA widget's own `defaultSessionSettings` (require a correct answer, no
// skipping, no autoplay). This covers ONLY the player-behavior surface
// (`sessionSettings`); the assignment-policy knobs (`sessionOptions`,
// `attemptLimit`) come from the activity's own configured behavior via
// `getVideoActivityBehavior` at attach time, mirroring the normal VA flow and
// the Classroom add-on route. The LTI route has no widget config to read a
// per-teacher player default from, so this constant stands in for it.
const VA_SESSION_SETTINGS: VideoActivitySessionSettings = {
  autoPlay: false,
  requireCorrectAnswer: true,
  allowSkipping: false,
};

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
 * Submitting navigates the current browsing context — the Schoology iframe when
 * we're framed (so Schoology's content-return page runs in its native context),
 * or the whole tab on the top-level fallback.
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

/**
 * The teacher resource picker. Runs inside Schoology's iframe (primary) and, via
 * the sign-in card's fallback link, can also run top-level after a redirect:
 * sign in → exchange launch code → pick → create assignment/session → sign
 * response → POST it back to Schoology.
 */
const LtiDeepLinkFlow: React.FC = () => {
  // Derive the launch code during render so the "missing code" case is initial
  // state, never a synchronous setState inside an effect.
  const code =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('lc') ?? '');
  // Inside Schoology's iframe? Drives the sign-in fallback affordance.
  const framed = isFramed();

  const [phase, setPhase] = useState<Phase>(code ? 'ready' : 'error');
  const [deepLinking, setDeepLinking] = useState<DeepLinkingSettings | null>(
    null
  );
  const [contextId, setContextId] = useState<string | null>(null);
  const [contextTitle, setContextTitle] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    code ? null : NO_CODE_MESSAGE
  );
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [kind, setKind] = useState<ContentKind>('quiz');
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const quizSelectId = useId();
  const vaSelectId = useId();
  const teacherNameId = useId();
  const ranRef = useRef(false);
  // Caches the created assignment/session per content id so a retry after a
  // failed sign / POST reuses it instead of spawning a SECOND orphaned session
  // + join code. Keyed `${kind}:${contentId}` so a quiz and a VA that happen to
  // share an id never collide. The cached value carries the right discriminator
  // for the sign() payload.
  const createdRef = useRef<
    Map<
      string,
      | {
          kind: 'quiz';
          quizCode: string;
          maxPoints: number;
          dueAt: number | null;
        }
      | {
          kind: 'va';
          sessionId: string;
          maxPoints: number;
          dueAt: number | null;
        }
    >
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
  const {
    activities,
    loadActivityData,
    loading: activitiesLoading,
  } = useVideoActivity(libraryUid);
  const { createAssignment: createVideoActivityAssignment } =
    useVideoActivityAssignments(libraryUid);
  // PLC list for the "Share with PLC" picker. usePlcs() reads `useAuth` (mounted
  // on this route) — no DashboardProvider required.
  const { plcs } = usePlcs();

  // ── Per-assignment settings (parity with the normal SpartBoard assign flow
  // and the Classroom add-on). All optional. Class targeting is NOT here; it's
  // auto-derived from the Schoology launch context.
  const defaultTeacherName =
    user?.displayName ?? user?.email?.split('@')[0] ?? '';
  const [teacherName, setTeacherName] = useState('');
  const [plcShareEnabled, setPlcShareEnabled] = useState(false);
  const [selectedPlcId, setSelectedPlcId] = useState('');
  // Optional due date (epoch ms; null = none). Mirrors the normal assign modal's
  // `<input type="date">` convention: the value is UTC midnight of the picked
  // date. Set on BOTH the SpartBoard assignment AND the Schoology line item
  // (`submission.endDateTime`) so the teacher enters it once.
  const dueDateId = useId();
  const [dueAt, setDueAt] = useState<number | null>(null);
  const dueDateInputValue = dueAt
    ? new Date(dueAt).toISOString().slice(0, 10)
    : '';
  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target?.value ?? '';
    setDueAt(val ? new Date(val).getTime() : null);
  };

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId),
    [quizzes, selectedQuizId]
  );
  const selectedActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivityId),
    [activities, selectedActivityId]
  );

  // Read-only summary of the configured behavior the assignment will inherit —
  // surfaces the parity (the quiz/VA's own session mode, attempts, etc.) so the
  // teacher can see what students will get before adding it.
  const behaviorSummary = useMemo(() => {
    if (kind === 'quiz') {
      return selectedQuiz
        ? formatBehaviorSummary(getQuizBehavior(selectedQuiz))
        : null;
    }
    return selectedActivity
      ? formatVideoActivityBehaviorSummary(
          getVideoActivityBehavior(selectedActivity)
        )
      : null;
  }, [kind, selectedQuiz, selectedActivity]);

  const canAdd = kind === 'quiz' ? !!selectedQuizId : !!selectedActivityId;

  // Fallback only: bounce the whole top-level tab to this same launch URL (the
  // `lc` is still in the address bar and still unconsumed). SpartBoard then loads
  // first-party in the tab and the flow runs there. `window.top` navigation is
  // permitted unless Schoology's sandbox forbids it (verified it allows it); a
  // SecurityError means it was blocked, with nothing more we can do client-side.
  const continueTopLevel = useCallback(() => {
    try {
      if (window.top) window.top.location.href = window.location.href;
    } catch {
      /* sandbox blocked top navigation */
    }
  }, []);

  // Exchange the one-time launch code for the validated deep-linking context —
  // AFTER sign-in, not on mount. The pre-sign-in card offers the top-level
  // fallback, which must redirect with the code STILL UNCONSUMED; the 5-minute
  // launch-code TTL comfortably covers the sign-in round trip.
  useEffect(() => {
    if (!code || !teacherReady || ranRef.current) return;
    ranRef.current = true;
    setPhase('exchanging');

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
        setContextTitle(data.contextTitle ?? null);
        setPhase('ready');
      } catch (e) {
        setErrorMsg(
          e instanceof Error ? e.message : 'Launch validation failed.'
        );
        setPhase('error');
      }
    })();
  }, [code, teacherReady]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
      // No success status here: the button's own spinner covers the popup, and
      // the next screen ("Validating…" then the picker) is itself the signal. A
      // lingering "Signed in. Pick a quiz to add." used to show before the picker
      // even appeared and stay under it afterward — confusing noise.
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Couldn't sign in: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [signInWithGoogle]);

  // Build the PLC linkage when the teacher opted into "Share with PLC" and
  // picked a PLC — same shared builder the normal flow + the Classroom add-on
  // use, so the linkage shape (auto-created sheet + name + member snapshot) is
  // identical. A failed sheet auto-create falls through to no linkage and is
  // surfaced as a non-fatal note. Shared by both the quiz and VA paths;
  // `sheetTitle` only names the auto-created sheet (the builder is widget-
  // agnostic), so either a quiz or a VA title is fine.
  const resolvePlcLinkage = useCallback(
    async (sheetTitle: string): Promise<PlcLinkage | undefined> => {
      if (!plcShareEnabled) return undefined;
      // Cache the selected PLC up front. `plcs` can repopulate on a cold load
      // (usePlcs streams in after first render), so a picked-then-vanished id
      // must not silently attach with an undefined `plc`.
      const selectedPlc = plcs.find((p) => p.id === selectedPlcId);
      if (!selectedPlcId || !selectedPlc || !user) {
        setErrorMsg(
          'PLC sharing was on but no PLC was available — adding without it.'
        );
        return undefined;
      }
      const { linkage, error: plcSheetError } = await buildPlcLinkage({
        plc: selectedPlc,
        quizTitle: sheetTitle,
        selfUid: user.uid,
        googleAccessToken,
      });
      if (plcSheetError) {
        setErrorMsg(
          `Note: couldn't create the shared PLC sheet (${plcSheetError.message}). ` +
            'Adding without PLC sharing.'
        );
      }
      return linkage;
    },
    [plcShareEnabled, selectedPlcId, plcs, user, googleAccessToken]
  );

  // Sign the deep-link response for an already-created assignment/session and
  // POST it back to Schoology. Shared tail of both the quiz and VA paths — the
  // create step is idempotent (cached in createdRef), so only this sign/POST
  // re-runs on retry.
  const signAndReturn = useCallback(
    async (
      created:
        | {
            kind: 'quiz';
            quizCode: string;
            maxPoints: number;
            dueAt: number | null;
          }
        | {
            kind: 'va';
            sessionId: string;
            maxPoints: number;
            dueAt: number | null;
          },
      title: string,
      returnUrl: string
    ): Promise<void> => {
      const sign = httpsCallable<
        SignDeepLinkResponseParams,
        SignDeepLinkResponseResult
      >(functions, 'ltiSignDeepLinkResponseV1');
      const base = {
        returnUrl,
        ...(deepLinking?.data !== undefined
          ? { dlData: deepLinking.data }
          : {}),
        title,
        maxPoints: created.maxPoints,
        // Forward the due date captured at create time (kept on `created` so a
        // retry signs the SAME due date that was persisted on the assignment).
        ...(created.dueAt ? { dueAt: created.dueAt } : {}),
      };
      const params: SignDeepLinkResponseParams =
        created.kind === 'quiz'
          ? { ...base, kind: 'quiz', quizCode: created.quizCode }
          : { ...base, kind: 'va', sessionId: created.sessionId };
      const { data } = await sign(params);

      setSubmitted(true);
      // Auto-submitting form POST navigates this browsing context back to the
      // platform, which creates the graded material. Framed (the normal case),
      // this navigates the Schoology iframe, so the content-return page runs in
      // its native context and closes the dialog cleanly.
      postDeepLinkResponse(data.returnUrl, data.jwt);
    },
    [deepLinking]
  );

  const addQuiz = useCallback(
    async (returnUrl: string): Promise<void> => {
      // The "Add" button is disabled until a quiz is selected — defensive guard.
      if (!selectedQuiz) return;

      // Reuse a previously-created assignment for this quiz on retry, so a failed
      // sign / POST never spawns a SECOND orphaned session + join code. The create
      // step runs at most once per quiz; only the idempotent sign re-runs.
      const cacheKey = `quiz:${selectedQuiz.id}`;
      let created = createdRef.current.get(cacheKey);
      if (!created) {
        const quizData = await loadQuizData(selectedQuiz.driveFileId);

        // Gradebook scale = the quiz's total points, so a 17/20 quiz reads 17/20
        // in Schoology (not a percentage). Shared with the Results push via
        // quizMaxPoints so the line item and the push denominator can't drift.
        const maxPoints = quizMaxPoints(quizData.questions);

        // Respect the quiz's OWN configured behavior (session mode, per-attempt
        // options, attempt limit) exactly as the normal SpartBoard assign flow
        // does. (A Schoology launch has no live teacher session, so the runner
        // self-paces regardless; carrying the configured options/attemptLimit
        // keeps per-attempt behavior matching.)
        const { sessionMode, sessionOptions, attemptLimit } =
          getQuizBehavior(selectedQuiz);

        const effectiveTeacherName = teacherName.trim() || defaultTeacherName;
        const plcLinkage = await resolvePlcLinkage(selectedQuiz.title);

        // Class-targeted session (join code) the student runner joins by —
        // classIds scope it to this Schoology course so a studentRole token
        // (classIds: ['schoology:<id>']) passes the Firestore class-gate.
        //
        // Connect the Schoology section to the assignment AT CREATION:
        // `periodNames` (on settings — where the hook reads it for both the
        // assignment + session docs) and `classPeriodByClassId` (on options —
        // the post-PIN period snapshot). Both make the teacher's monitor show
        // the Schoology section immediately, before any student launches. Only
        // set when the section name is known.
        const periodNames = contextTitle ? [contextTitle] : undefined;
        const classPeriodByClassId =
          contextTitle && contextId
            ? { [`schoology:${contextId}`]: contextTitle }
            : undefined;

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
            ...(effectiveTeacherName
              ? { teacherName: effectiveTeacherName }
              : {}),
            ...(plcLinkage ? { plc: plcLinkage } : {}),
            ...(periodNames ? { periodNames } : {}),
            // Persist the due date on the SpartBoard assignment too (quiz keeps
            // it directly on settings), so the teacher's single entry drives
            // both SpartBoard and the Schoology line item.
            ...(dueAt ? { dueAt } : {}),
          },
          {
            classIds: [`schoology:${contextId}`],
            initialStatus: 'active',
            ...(classPeriodByClassId ? { classPeriodByClassId } : {}),
          }
        );
        created = { kind: 'quiz', quizCode, maxPoints, dueAt };
        createdRef.current.set(cacheKey, created);
      }

      await signAndReturn(created, selectedQuiz.title, returnUrl);
    },
    [
      selectedQuiz,
      loadQuizData,
      createAssignment,
      contextId,
      contextTitle,
      teacherName,
      defaultTeacherName,
      dueAt,
      resolvePlcLinkage,
      signAndReturn,
    ]
  );

  const addVideoActivity = useCallback(
    async (returnUrl: string): Promise<void> => {
      // The "Add" button is disabled until a VA is selected — defensive guard.
      if (!selectedActivity) return;

      const cacheKey = `va:${selectedActivity.id}`;
      let created = createdRef.current.get(cacheKey);
      if (!created) {
        const activityData = await loadActivityData(
          selectedActivity.driveFileId
        );

        // Gradebook scale = the activity's total points, so pushed grades read
        // identically in Schoology (not a percentage). Shared with the VA
        // Results push via videoActivityMaxPoints so the line item and the push
        // denominator can't drift.
        const maxPoints = videoActivityMaxPoints(activityData.questions);

        // Respect the activity's OWN configured behavior, mirroring the normal
        // VA assign flow: `sessionOptions` + `attemptLimit` come from the
        // activity's behavior. `sessionSettings` (player behavior) has no home
        // on `behavior`, so it stays the conservative VA_SESSION_SETTINGS
        // default the route uses.
        const behavior = getVideoActivityBehavior(selectedActivity);
        const sessionOptions: VideoActivitySessionOptions = {
          ...behavior.sessionOptions,
          attemptLimit: behavior.attemptLimit,
          // VA carries its due date on sessionOptions (no top-level settings
          // field). Persist it so SpartBoard + the Schoology line item match.
          ...(dueAt ? { dueAt } : {}),
        };

        const effectiveTeacherName = teacherName.trim() || defaultTeacherName;
        const plcLinkage = await resolvePlcLinkage(selectedActivity.title);

        // VA has no join code — the assignment is identified by its sessionId
        // (== assignment id). Connect the Schoology section at creation:
        // `periodNames` rides BOTH on the settings object (the hook writes the
        // assignment doc's `periodNames` from `settings.periodNames`) AND the
        // positional 5th arg (which reaches the SESSION doc) — without it on
        // settings the VA monitor's class label is empty. VA's
        // createAssignment has no `classPeriodByClassId` channel, so only
        // periodNames connects the section here.
        const periodNames = contextTitle ? [contextTitle] : [];

        const { id: sessionId } = await createVideoActivityAssignment(
          {
            id: selectedActivity.id,
            title: selectedActivity.title,
            driveFileId: selectedActivity.driveFileId,
            youtubeUrl: activityData.youtubeUrl,
            questions: activityData.questions,
          },
          {
            className: 'Schoology',
            sessionSettings: VA_SESSION_SETTINGS,
            sessionOptions,
            ...(effectiveTeacherName
              ? { teacherName: effectiveTeacherName }
              : {}),
            ...(plcLinkage ? { plc: plcLinkage } : {}),
            ...(periodNames.length > 0 ? { periodNames } : {}),
          },
          'active',
          [`schoology:${contextId}`],
          periodNames
        );
        created = { kind: 'va', sessionId, maxPoints, dueAt };
        createdRef.current.set(cacheKey, created);
      }

      await signAndReturn(created, selectedActivity.title, returnUrl);
    },
    [
      selectedActivity,
      loadActivityData,
      createVideoActivityAssignment,
      contextId,
      contextTitle,
      teacherName,
      defaultTeacherName,
      dueAt,
      resolvePlcLinkage,
      signAndReturn,
    ]
  );

  const add = useCallback(async () => {
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
      if (kind === 'quiz') {
        await addQuiz(returnUrl);
      } else {
        await addVideoActivity(returnUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('LtiDeepLinkFlow.add', err, {
        kind,
        contentId: kind === 'quiz' ? selectedQuizId : selectedActivityId,
      });
      setErrorMsg(
        `Couldn't add the ${kind === 'quiz' ? 'quiz' : 'video activity'}: ${message}`
      );
      setSubmitted(false);
    } finally {
      setBusy(false);
    }
  }, [
    deepLinking,
    contextId,
    kind,
    addQuiz,
    addVideoActivity,
    selectedQuizId,
    selectedActivityId,
  ]);

  // Branded segmented selector for the activity type.
  const KIND_TABS: { value: ContentKind; label: string; icon: LucideIcon }[] = [
    { value: 'quiz', label: 'Quiz', icon: ClipboardList },
    { value: 'va', label: 'Video Activity', icon: Video },
  ];

  return (
    <AddonShell>
      <AddonHeader
        icon={ClipboardList}
        title="Add a SpartBoard activity"
        subtitle="Pick a quiz or video activity from your library. Students complete it inside Schoology and their score posts back to the gradebook."
      />

      {phase === 'error' ? (
        <AddonError message={errorMsg} />
      ) : submitted ? (
        <AddonCard className="p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <p className="text-sm leading-relaxed text-slate-600">
              Adding your activity to Schoology…
            </p>
          </div>
        </AddonCard>
      ) : !teacherReady && !deepLinking ? (
        // Sign-in card only BEFORE the exchange. Once `deepLinking` is loaded we
        // stay on the picker even if `teacherReady` momentarily blips false (e.g.
        // a token refresh) — the one-time `lc` is already consumed, so falling
        // back to the sign-in card here would strand the teacher on a dead button.
        <AddonCard className="p-6">
          <p className="mb-4 text-sm text-slate-500">
            {user
              ? 'Sign in with your teacher Google account to load your SpartBoard library.'
              : 'Sign in with your school Google account to load your SpartBoard library.'}
          </p>
          <AddonButton onClick={() => void signIn()} loading={busy}>
            Sign in to SpartBoard
          </AddonButton>
          {framed && (
            <button
              type="button"
              onClick={continueTopLevel}
              className="mt-3 block text-xs text-slate-400 underline transition-colors hover:text-slate-600"
            >
              Trouble signing in? Continue in the full tab instead.
            </button>
          )}
        </AddonCard>
      ) : phase === 'exchanging' || !deepLinking ? (
        <div className="flex justify-center py-2">
          <AddonStatus message="Validating your Schoology launch…" busy />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Segmented Quiz / Video Activity selector */}
          <div
            role="tablist"
            aria-label="Activity type"
            className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1"
          >
            {KIND_TABS.map((tab) => {
              const active = kind === tab.value;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={busy}
                  onClick={() => setKind(tab.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                    active
                      ? 'bg-gradient-to-r from-brand-blue-primary to-brand-blue-light text-white shadow'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Library picker */}
          <AddonCard className="p-4">
            <label
              htmlFor={kind === 'quiz' ? quizSelectId : vaSelectId}
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              {kind === 'quiz' ? 'Select a quiz' : 'Select a video activity'}
            </label>
            {kind === 'quiz' ? (
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
            ) : (
              <AddonSelect
                id={vaSelectId}
                ariaLabel="Video Activity"
                value={selectedActivityId}
                onChange={setSelectedActivityId}
                disabled={busy || activitiesLoading}
                placeholder={
                  activitiesLoading
                    ? 'Loading your video activities…'
                    : activities.length === 0
                      ? 'No video activities in your library yet'
                      : 'Select a video activity…'
                }
                options={activities.map((a) => ({
                  value: a.id,
                  label: a.title,
                }))}
              />
            )}
          </AddonCard>

          {/* Per-assignment settings — parity with the normal SpartBoard assign
              flow + the Classroom add-on. Shown only once something is
              selected; all fields are optional. Class targeting is auto-derived
              from the Schoology launch context, so there's no class picker. */}
          {canAdd && (
            <AddonCard className="space-y-4 p-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Assignment settings
              </h2>

              {behaviorSummary && (
                <p className="text-xs text-slate-500">
                  Inherits this {kind === 'quiz' ? 'quiz' : 'activity'}
                  &rsquo;s settings:{' '}
                  <span className="font-medium text-slate-700">
                    {behaviorSummary}
                  </span>
                </p>
              )}

              <div>
                <label
                  htmlFor={teacherNameId}
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Your name{' '}
                  <span className="font-normal text-slate-500">
                    (optional — shown on shared PLC results)
                  </span>
                </label>
                <input
                  id={teacherNameId}
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target?.value ?? '')}
                  placeholder={defaultTeacherName || 'Teacher name'}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* Due date — set once here, applied to BOTH the SpartBoard
                  assignment and the Schoology gradebook item (submission end
                  date). Optional; date-only, matching the normal assign flow. */}
              <div>
                <label
                  htmlFor={dueDateId}
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Due date{' '}
                  <span className="font-normal text-slate-500">
                    (optional — also set in Schoology)
                  </span>
                </label>
                <input
                  id={dueDateId}
                  type="date"
                  value={dueDateInputValue}
                  onChange={handleDueDateChange}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* PLC sharing applies to BOTH quizzes and video activities —
                  `buildPlcLinkage` is widget-agnostic, so the same control
                  drives the quiz and VA paths. */}
              {plcs.length > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={plcShareEnabled}
                      onChange={(e) => {
                        const on = e.target?.checked ?? false;
                        setPlcShareEnabled(on);
                        // Preselect the sole PLC so a one-PLC teacher doesn't
                        // have to also pick from a single-item list.
                        if (on && !selectedPlcId && plcs.length === 1) {
                          setSelectedPlcId(plcs[0].id);
                        }
                      }}
                      disabled={busy}
                      className="h-4 w-4 rounded accent-brand-blue-light"
                    />
                    Share results with a PLC
                  </label>
                  {plcShareEnabled && (
                    <AddonSelect
                      ariaLabel="PLC to share results with"
                      value={selectedPlcId}
                      onChange={setSelectedPlcId}
                      disabled={busy}
                      placeholder="Select a PLC…"
                      options={plcs.map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                    />
                  )}
                </div>
              )}
            </AddonCard>
          )}

          <div className="flex justify-center">
            <AddonButton
              onClick={() => void add()}
              loading={busy}
              disabled={!canAdd}
              icon={Send}
            >
              {kind === 'quiz'
                ? 'Add quiz to Schoology'
                : 'Add video activity to Schoology'}
            </AddonButton>
          </div>
        </div>
      )}

      {phase !== 'error' && !submitted && (
        <div className="mt-4">
          <AddonError message={errorMsg} />
        </div>
      )}
    </AddonShell>
  );
};

/**
 * Renders the deep-link picker. It runs inside Schoology's iframe (primary) and
 * can re-run top-level via the sign-in card's fallback link.
 */
export const LtiDeepLinkPicker: React.FC = () => {
  return <LtiDeepLinkFlow />;
};

export default LtiDeepLinkPicker;
