/**
 * Schoology LTI 1.3 Deep Linking — teacher resource picker.
 *
 * Route: /lti/teacher?mode=deeplink  (Schoology opens this iframe when a teacher
 * clicks "Add Material → SpartBoard"; the browser arrives via a 302 from the
 * ltiLaunch Cloud Function carrying a one-time `?lc=<launchCode>`.)
 *
 * Two modes, dispatched on the `handoff` query param:
 *
 *  - LAUNCHER (default, in the Schoology iframe): the teacher's Google OAuth
 *    CANNOT run here — a sign-in popup spawned from Schoology's partitioned
 *    iframe is denied by Google Workspace Context-Aware Access ("Account
 *    Restricted"). So the iframe is a thin launcher: it exchanges the one-time
 *    launch code for the deep-link context, opens a TOP-LEVEL window to do the
 *    real work (LtiDeepLinkWindow), and — when that window hands back the signed
 *    LtiDeepLinkingResponse — form-POSTs it to Schoology to finish the attach.
 *
 *  - WINDOW (`handoff=1`, opened top-level by the launcher): LtiDeepLinkWindow,
 *    where the first-party Google sign-in + quiz pick + response signing happen.
 *
 * See deepLinkHandoff.ts for the cross-window protocol + rationale. UI reuses the
 * Classroom add-on's light-theme AddonShell kit (Schoology's chrome is light).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ClipboardList, CheckCircle2, ExternalLink } from 'lucide-react';
import { functions } from '@/config/firebase';
import {
  DL_HANDOFF_READY,
  DL_HANDOFF_RESPONSE,
  DL_HANDOFF_CONTEXT,
  DL_HANDOFF_WINDOW_PATH,
  type DlHandoffContext,
  parseHandoffMessage,
  postHandoffMessage,
  postDeepLinkResponse,
} from './deepLinkHandoff';
import { LtiDeepLinkWindow } from './LtiDeepLinkWindow';
import {
  AddonShell,
  AddonHeader,
  AddonCard,
  AddonButton,
  AddonStatus,
  AddonError,
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

/** Subset of the `ltiExchange` result this launcher depends on. */
interface LtiExchangeResult {
  isDeepLinking: boolean;
  contextId?: string | null;
  deepLinking?: DeepLinkingSettings;
}

type Phase = 'exchanging' | 'ready' | 'error';

const NO_CODE_MESSAGE =
  'No launch code found. Add SpartBoard from inside a Schoology course.';

/**
 * In-iframe launcher: exchanges the launch code, then hands off to a top-level
 * window for the (Context-Aware-Access-sensitive) Google sign-in + quiz pick,
 * and completes the deep-link return when the window posts back the signed JWT.
 */
const LtiDeepLinkLauncher: React.FC = () => {
  // Derive the launch code during render so the "missing code" case is initial
  // state, never a synchronous setState inside an effect.
  const code =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('lc') ?? '');

  const [phase, setPhase] = useState<Phase>(code ? 'exchanging' : 'error');
  const [errorMsg, setErrorMsg] = useState<string | null>(
    code ? null : NO_CODE_MESSAGE
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);
  // Latches once the response form is submitted (terminal "returning" state).
  const [submitted, setSubmitted] = useState(false);

  // Deep-link context lives in a ref so the (mount-once) message listener always
  // reads the latest without re-subscribing. Populated by the exchange below.
  const ctxRef = useRef<DlHandoffContext | null>(null);
  const ranRef = useRef(false);

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
        const returnUrl = data.deepLinking?.deep_link_return_url;
        if (!data.isDeepLinking || !returnUrl) {
          setErrorMsg(
            'This launch is not a deep-linking request. Add SpartBoard from ' +
              'the course materials menu.'
          );
          setPhase('error');
          return;
        }
        if (!data.contextId) {
          setErrorMsg(
            'Missing course context — re-open SpartBoard from the course.'
          );
          setPhase('error');
          return;
        }
        ctxRef.current = {
          returnUrl,
          ...(data.deepLinking?.data !== undefined
            ? { dlData: data.deepLinking.data }
            : {}),
          contextId: data.contextId,
        };
        setPhase('ready');
      } catch (e) {
        setErrorMsg(
          e instanceof Error ? e.message : 'Launch validation failed.'
        );
        setPhase('error');
      }
    })();
  }, [code]);

  // Listen for the handoff window: reply to its READY with the deep-link context,
  // and on its signed RESPONSE, navigate this iframe back to Schoology.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = parseHandoffMessage(event);
      if (!msg) return;
      if (msg.type === DL_HANDOFF_READY) {
        const ctx = ctxRef.current;
        const source = event.source as Window | null;
        if (ctx && source) {
          postHandoffMessage(source, {
            type: DL_HANDOFF_CONTEXT,
            context: ctx,
          });
        }
      } else if (msg.type === DL_HANDOFF_RESPONSE) {
        try {
          postDeepLinkResponse(msg.response.returnUrl, msg.response.jwt);
          setSubmitted(true);
          setStatusMsg('Returning to Schoology…');
        } catch (err) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Failed to return to Schoology.'
          );
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const openWindow = useCallback(() => {
    setErrorMsg(null);
    const win = window.open(
      DL_HANDOFF_WINDOW_PATH,
      'spartboard_lti_deeplink',
      'popup,width=560,height=720'
    );
    if (!win) {
      setErrorMsg(
        'Your browser blocked the SpartBoard window. Allow pop-ups for ' +
          'Schoology, then click again.'
      );
      return;
    }
    win.focus();
    setLaunched(true);
    setStatusMsg(
      'Sign in and pick your quiz in the SpartBoard window. It returns here ' +
        'automatically when you’re done.'
    );
  }, []);

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
      ) : (
        <AddonCard className="p-6">
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            Choosing a quiz opens a SpartBoard window where you sign in and
            pick. It closes and finishes here automatically. (Schoology runs
            SpartBoard in a frame, so sign-in has to happen in its own window.)
          </p>
          <AddonButton onClick={openWindow} icon={ExternalLink}>
            {launched ? 'Reopen the SpartBoard window' : 'Choose a quiz'}
          </AddonButton>
        </AddonCard>
      )}

      {phase !== 'error' && (
        <div className="mt-4 space-y-2">
          <AddonError message={errorMsg} />
          <AddonStatus message={statusMsg} />
        </div>
      )}
    </AddonShell>
  );
};

/**
 * Dispatcher: the top-level handoff window (`?handoff=1`) renders the real
 * picker; the in-Schoology iframe renders the launcher.
 */
export const LtiDeepLinkPicker: React.FC = () => {
  const isHandoffWindow =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('handoff') === '1';

  return isHandoffWindow ? <LtiDeepLinkWindow /> : <LtiDeepLinkLauncher />;
};

export default LtiDeepLinkPicker;
