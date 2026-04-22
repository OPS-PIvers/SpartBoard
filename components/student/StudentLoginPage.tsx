import React, { useCallback, useEffect, useRef, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { Loader2, GraduationCap, AlertCircle, Inbox } from 'lucide-react';
import { auth, functions } from '@/config/firebase';
import { APP_NAME } from '@/config/constants';

/**
 * Student login page (Phase 2A of the ClassLink-via-Google auth flow).
 *
 * This page is intentionally PII-free on the client:
 *   - We never render, log, or persist the student's email, name, or `sub`.
 *   - The Google ID token is passed directly to `studentLoginV1` and discarded.
 *   - Firebase Auth only ever sees the minted custom token, which contains an
 *     opaque pseudonym UID.
 *
 * We use Google Identity Services (GIS) directly — NOT
 * `signInWithPopup(googleProvider)` — because the built-in provider writes
 * email / displayName / photoURL onto the Firebase Auth user record, which
 * defeats the entire PII constraint.
 */

// ---------------------------------------------------------------------------
// Minimal type declarations for Google Identity Services (no official types
// exist for the `id` namespace). The project already pulls in
// `@types/google.accounts` which covers `oauth2` but NOT `id`.
// ---------------------------------------------------------------------------

interface GsiCredentialResponse {
  credential?: string;
  select_by?: string;
  clientId?: string;
}

interface GsiButtonConfig {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number | string;
  locale?: string;
}

interface GsiInitializeOptions {
  client_id: string;
  callback: (response: GsiCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
  itp_support?: boolean;
  ux_mode?: 'popup' | 'redirect';
  context?: 'signin' | 'signup' | 'use';
}

interface GsiIdApi {
  initialize(options: GsiInitializeOptions): void;
  prompt(listener?: (notification: unknown) => void): void;
  renderButton(parent: HTMLElement, config: GsiButtonConfig): void;
  cancel(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GsiIdApi;
      };
    };
  }
}

// ---------------------------------------------------------------------------
// Response + error-code shapes for the studentLoginV1 callable.
// Kept narrow on purpose — any claim about the student is server-side only.
// ---------------------------------------------------------------------------

interface StudentLoginV1Response {
  customToken: string;
  /** Organization id the student was matched to (non-PII, shared across students). */
  orgId?: string;
  /** Count of ClassLink classes the student is enrolled in. */
  classCount?: number;
  /** Optional future extension; if the function ever returns it, we forward a hint to /my-assignments. */
  hasAssignments?: boolean;
  /** Reserved for future shape evolution. */
  classIds?: string[];
}

type ErrorKind =
  | 'config-missing'
  | 'domain-not-registered'
  | 'not-in-roster'
  | 'service-unavailable'
  | 'generic';

const ERROR_COPY: Record<ErrorKind, { title: string; body: string }> = {
  'config-missing': {
    title: 'Sign-in is not configured',
    body: 'Ask your teacher to let their admin know SpartBoard is missing a Google client ID.',
  },
  'domain-not-registered': {
    title: "We don't recognize your school",
    body: 'This SpartBoard is only available to schools that have signed up. Ask your teacher to reach out to their admin if you think this is wrong.',
  },
  'not-in-roster': {
    title: "You're not on a roster yet",
    body: "You're not on any class rosters yet. If you just started at your school, ask a teacher to sync their roster.",
  },
  'service-unavailable': {
    title: 'Roster service is unreachable',
    body: "We can't reach the roster service right now. Try again in a few minutes.",
  },
  generic: {
    title: 'Something went wrong',
    body: 'Something went wrong. Please try again.',
  },
};

/** Map a FunctionsError code to our four user-facing error buckets. */
function classifyError(err: unknown): ErrorKind {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') {
      // Firebase callable errors use the form "functions/<grpc-code>".
      const normalized = code.startsWith('functions/')
        ? code.slice('functions/'.length)
        : code;
      switch (normalized) {
        case 'permission-denied':
          return 'domain-not-registered';
        case 'not-found':
          return 'not-in-roster';
        case 'unavailable':
        case 'internal':
        case 'deadline-exceeded':
          return 'service-unavailable';
        default:
          return 'generic';
      }
    }
  }
  return 'generic';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Status =
  | { kind: 'loading-sdk' }
  | { kind: 'ready' }
  | { kind: 'verifying' }
  | { kind: 'success' }
  | { kind: 'error'; error: ErrorKind };

const StudentLoginPage: React.FC = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  const [status, setStatus] = useState<Status>(() =>
    !clientId
      ? { kind: 'error', error: 'config-missing' }
      : { kind: 'loading-sdk' }
  );
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);

  // The callable handle is stable across retries — create once.
  const studentLoginRef = useRef(
    httpsCallable<{ idToken: string }, StudentLoginV1Response>(
      functions,
      'studentLoginV1'
    )
  );

  const handleCredential = useCallback(
    async (response: GsiCredentialResponse) => {
      if (!response.credential) {
        setStatus({ kind: 'error', error: 'generic' });
        return;
      }

      setStatus({ kind: 'verifying' });
      try {
        const result = await studentLoginRef.current({
          idToken: response.credential,
        });
        const { customToken, hasAssignments } = result.data;
        if (!customToken) {
          setStatus({ kind: 'error', error: 'generic' });
          return;
        }

        await signInWithCustomToken(auth, customToken);
        setStatus({ kind: 'success' });

        // Forward a hint about emptiness if the function told us — the
        // assignments page will render its own empty state either way.
        const target =
          hasAssignments === false
            ? '/my-assignments?empty=1'
            : '/my-assignments';
        window.location.assign(target);
      } catch (err) {
        // IMPORTANT: never log the id_token or the raw error object — either
        // could carry PII. We only pull out `code` via classifyError.
        const kind = classifyError(err);
        if (err instanceof FunctionsError) {
          // Log only the error code for debugging. Never log `err.message` or
          // `err.details` — the server may include email-derived diagnostics.
          console.warn('[studentLogin] callable failed:', err.code);
        } else {
          console.warn(
            '[studentLogin] callable failed with non-callable error'
          );
        }
        setStatus({ kind: 'error', error: kind });
      }
    },
    []
  );

  // Poll briefly for the GIS SDK (the script tag is `async`), then init
  // once it's available. This is an "external system" sync, hence useEffect.
  useEffect(() => {
    if (!clientId) return;
    if (status.kind === 'error' && status.error !== 'config-missing') return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 50; // ~5s at 100ms intervals

    const init = () => {
      const idApi = window.google?.accounts?.id;
      if (!idApi) return false;

      idApi.initialize({
        client_id: clientId,
        callback: handleCredential,
        auto_select: true,
        cancel_on_tap_outside: false,
        itp_support: true,
        context: 'signin',
        ux_mode: 'popup',
      });

      if (buttonContainerRef.current) {
        idApi.renderButton(buttonContainerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
        });
      }

      // Try One-Tap. If it's suppressed the fallback button remains available.
      idApi.prompt();

      if (!cancelled) setStatus({ kind: 'ready' });
      return true;
    };

    if (init()) return;

    const interval = window.setInterval(() => {
      attempts += 1;
      if (init() || attempts >= maxAttempts) {
        window.clearInterval(interval);
        if (attempts >= maxAttempts && !cancelled) {
          setStatus({ kind: 'error', error: 'service-unavailable' });
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      // Best-effort: cancel any outstanding One-Tap prompt on unmount.
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // Non-fatal — SDK may not be loaded.
      }
    };
    // `handleCredential` is stable via useCallback; intentionally not reinit-ing
    // GIS on status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, handleCredential]);

  const handleRetry = useCallback(() => {
    setStatus(
      !clientId
        ? { kind: 'error', error: 'config-missing' }
        : { kind: 'loading-sdk' }
    );
  }, [clientId]);

  return (
    <div className="relative min-h-screen w-screen flex items-center justify-center bg-slate-50 overflow-hidden font-sans px-4 py-8">
      {/* Subtle radial dotted background, matching the teacher login tone. */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
      <div className="absolute top-1/4 -left-1/4 w-[500px] h-[500px] rounded-full blur-[100px] bg-brand-blue-primary/20 animate-pulse" />
      <div className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-brand-red-primary/10 rounded-full blur-[100px] animate-pulse delay-1000" />

      <div className="relative z-10 bg-white/80 backdrop-blur-xl p-10 sm:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 ring-1 ring-slate-900/5 max-w-md w-full text-center">
        {/* Brand mark */}
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-brand-blue-primary to-brand-blue-dark rounded-2xl flex items-center justify-center shadow-lg shadow-brand-blue-primary/20 mb-8 transform -rotate-3 hover:rotate-0 transition-transform duration-300">
          <GraduationCap className="w-8 h-8 text-white" strokeWidth={2.5} />
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mb-3">
          {APP_NAME}
        </h1>
        <p className="text-slate-500 mb-8 font-medium text-sm sm:text-base">
          Sign in with your school Google account to see your assignments.
        </p>

        <StatusContent
          status={status}
          buttonContainerRef={buttonContainerRef}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Status sub-view — split out to keep the top-level component readable.
// ---------------------------------------------------------------------------

interface StatusContentProps {
  status: Status;
  buttonContainerRef: React.RefObject<HTMLDivElement | null>;
  onRetry: () => void;
}

const StatusContent: React.FC<StatusContentProps> = ({
  status,
  buttonContainerRef,
  onRetry,
}) => {
  // The GIS button must stay mounted whenever we're in the `ready` (or
  // early `loading-sdk`) states so that `renderButton` has a target. We
  // toggle visibility with `hidden` rather than unmounting.
  const showButton = status.kind === 'ready' || status.kind === 'loading-sdk';

  return (
    <div className="min-h-[140px] flex flex-col items-center justify-center gap-4">
      {status.kind === 'loading-sdk' && (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-brand-blue-primary" />
          <p className="text-sm font-medium">Loading sign-in…</p>
        </div>
      )}

      {status.kind === 'verifying' && (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-brand-blue-primary" />
          <p className="text-sm font-medium">Checking your classes…</p>
        </div>
      )}

      {status.kind === 'success' && (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-brand-blue-primary" />
          <p className="text-sm font-medium">Signing you in…</p>
        </div>
      )}

      {status.kind === 'error' && (
        <ErrorView error={status.error} onRetry={onRetry} />
      )}

      <div
        ref={buttonContainerRef}
        className="flex justify-center w-full"
        aria-hidden={!showButton}
        hidden={!showButton}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

interface ErrorViewProps {
  error: ErrorKind;
  onRetry: () => void;
}

const ErrorView: React.FC<ErrorViewProps> = ({ error, onRetry }) => {
  const copy = ERROR_COPY[error];
  // "Not in roster" is an empty-state, not a hard error — softer tone.
  const isSoft = error === 'not-in-roster';
  const Icon = isSoft ? Inbox : AlertCircle;
  const iconColor = isSoft ? 'text-slate-400' : 'text-brand-red-primary';
  const canRetry =
    error !== 'domain-not-registered' && error !== 'config-missing';

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
          isSoft ? 'bg-slate-100' : 'bg-brand-red-primary/10'
        }`}
      >
        <Icon className={`w-6 h-6 ${iconColor}`} strokeWidth={2} />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-bold text-slate-800">{copy.title}</h2>
        <p className="text-sm text-slate-500 leading-relaxed">{copy.body}</p>
      </div>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 px-5 py-2.5 bg-brand-blue-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-blue-dark transition-colors shadow-md shadow-brand-blue-primary/20"
        >
          Try again
        </button>
      )}
    </div>
  );
};

export default StudentLoginPage;
export { StudentLoginPage };
