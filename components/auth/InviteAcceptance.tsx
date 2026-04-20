import React from 'react';
import {
  Loader2,
  LogIn,
  CheckCircle2,
  AlertCircle,
  MailQuestion,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { APP_NAME } from '@/config/constants';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';

// Phase 4 hardcodes the org id to match AuthContext's DEFAULT_ORG_ID.
// Multi-org support is an open question tracked in the implementation plan.
const DEFAULT_ORG_ID = 'orono';

/**
 * Extract the invite token from the current URL.
 *
 * Strips the leading `/invite/` segment, stops at a query string or trailing
 * slash, and returns an empty string when the token is missing or blank.
 */
const extractToken = (): string => {
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : '';
  const prefix = '/invite/';
  if (!pathname.startsWith(prefix)) return '';
  const rest = pathname.slice(prefix.length);
  // Stop at query string, hash, or trailing slash.
  const stopAt = rest.search(/[/?#]/);
  const token = stopAt === -1 ? rest : rest.slice(0, stopAt);
  return token.trim();
};

type ClaimStatus =
  | { kind: 'idle' }
  | { kind: 'claiming' }
  | { kind: 'success' }
  | { kind: 'error'; code: string; message: string };

const FullPageSpinner: React.FC = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
    <Loader2 className="w-12 h-12 text-brand-blue-primary animate-spin" />
  </div>
);

const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative h-screen w-screen flex items-center justify-center bg-slate-50 overflow-hidden font-sans">
    <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
    <div className="absolute top-1/4 -left-1/4 w-[500px] h-[500px] rounded-full blur-[100px] bg-brand-blue-primary/20" />
    <div className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-brand-red-primary/10 rounded-full blur-[100px]" />
    <div className="relative z-10 bg-white/90 backdrop-blur-xl p-8 sm:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 ring-1 ring-slate-900/5 max-w-md w-full mx-4">
      {children}
    </div>
  </div>
);

const ErrorCard: React.FC<{
  title: string;
  message: string;
  action?: React.ReactNode;
}> = ({ title, message, action }) => (
  <AuthShell>
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-red-primary/10 flex items-center justify-center mb-5">
        <AlertCircle className="w-7 h-7 text-brand-red-primary" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
        {title}
      </h1>
      <p className="text-slate-600 mb-6 text-sm sm:text-base leading-relaxed">
        {message}
      </p>
      {action}
      <a
        href="/"
        className="mt-4 text-sm text-brand-blue-primary hover:text-brand-blue-dark font-medium"
      >
        Return to {APP_NAME}
      </a>
    </div>
  </AuthShell>
);

const MissingTokenView: React.FC = () => (
  <ErrorCard
    title="Invalid invite link"
    message="This invitation link is missing its token. Ask the admin who invited you for a new link."
  />
);

const SuccessCard: React.FC = () => (
  <AuthShell>
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
        Invitation accepted!
      </h1>
      <p className="text-slate-600 mb-2 text-sm sm:text-base">
        Redirecting you to {APP_NAME}…
      </p>
      <Loader2 className="w-5 h-5 text-brand-blue-primary animate-spin mt-2" />
    </div>
  </AuthShell>
);

const ClaimingCard: React.FC = () => (
  <AuthShell>
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-blue-primary/10 flex items-center justify-center mb-5">
        <Loader2 className="w-7 h-7 text-brand-blue-primary animate-spin" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
        Accepting your invitation
      </h1>
      <p className="text-slate-600 text-sm sm:text-base">
        Hang tight — we&rsquo;re linking your account to {APP_NAME}.
      </p>
    </div>
  </AuthShell>
);

const SignInPromptCard: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Invite sign-in failed:', error);
      setSigningIn(false);
    }
  };

  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-blue-primary/10 flex items-center justify-center mb-5">
          <MailQuestion className="w-7 h-7 text-brand-blue-primary" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
          You&rsquo;re invited to {APP_NAME}
        </h1>
        <p className="text-slate-600 mb-7 text-sm sm:text-base leading-relaxed">
          Sign in to accept your invitation to {APP_NAME}.
        </p>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="group relative w-full bg-brand-blue-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 overflow-hidden shadow-lg shadow-brand-blue-primary/25 hover:shadow-brand-blue-primary/40 hover:bg-brand-blue-dark transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed"
        >
          {signingIn ? (
            <Loader2 className="w-5 h-5 animate-spin relative z-10" />
          ) : (
            <span className="flex items-center gap-3 relative z-10">
              <LogIn className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
              Sign in with Google
            </span>
          )}
        </button>
      </div>
    </AuthShell>
  );
};

const getErrorContent = (
  code: string
): { title: string; message: string; showSignOut?: boolean } => {
  switch (code) {
    case 'not-found':
      return {
        title: 'Invitation not valid',
        message:
          'This invitation is no longer valid. It may have been used or revoked. Ask the admin who invited you for a new link.',
      };
    case 'failed-precondition':
      return {
        title: 'Invitation already accepted',
        message:
          "This invitation has already been accepted. If you're signed in with the right account, refresh this page.",
      };
    case 'deadline-exceeded':
      return {
        title: 'Invitation expired',
        message:
          'This invitation has expired. Ask the admin who invited you for a new link.',
      };
    case 'permission-denied':
      return {
        title: 'Wrong account',
        message:
          'This invitation was sent to a different account. Sign out and sign in with the invited email.',
        showSignOut: true,
      };
    default:
      return {
        title: 'Something went wrong',
        message:
          'We couldn&rsquo;t accept this invitation. Try again, or contact your admin.',
      };
  }
};

const getErrorCodeFromUnknown = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const raw = (error as { code: string }).code;
    // Firebase callable errors come through as `functions/<code>` — normalize.
    const slash = raw.indexOf('/');
    return slash === -1 ? raw : raw.slice(slash + 1);
  }
  return 'unknown';
};

export const InviteAcceptance: React.FC = () => {
  // Capture the token once on mount — even if the URL changes during the auth
  // flip, we keep the same token through the whole flow.
  const [token] = React.useState(() => extractToken());
  const { user, loading, signOut } = useAuth();
  const [status, setStatus] = React.useState<ClaimStatus>({ kind: 'idle' });
  const claimRanRef = React.useRef(false);

  React.useEffect(() => {
    if (!token) return;
    if (loading) return;
    if (!user) return;
    if (claimRanRef.current) return;
    if (status.kind !== 'idle') return;

    claimRanRef.current = true;
    setStatus({ kind: 'claiming' });

    const run = async () => {
      try {
        const claim = httpsCallable<
          { token: string; orgId: string },
          { ok: true }
        >(functions, 'claimOrganizationInvite');
        await claim({ token, orgId: DEFAULT_ORG_ID });
        setStatus({ kind: 'success' });
        // Brief success state before dropping the user into the app.
        window.setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } catch (error) {
        const code = getErrorCodeFromUnknown(error);
        const message =
          error instanceof Error ? error.message : 'Unexpected error';
        console.error('Invite claim failed:', error);
        setStatus({ kind: 'error', code, message });
      }
    };

    void run();
  }, [token, loading, user, status.kind]);

  if (!token) {
    return <MissingTokenView />;
  }

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <SignInPromptCard />;
  }

  if (status.kind === 'claiming' || status.kind === 'idle') {
    return <ClaimingCard />;
  }

  if (status.kind === 'success') {
    return <SuccessCard />;
  }

  // status.kind === 'error'
  const content = getErrorContent(status.code);
  const action = content.showSignOut ? (
    <button
      onClick={() => {
        void signOut();
      }}
      className="w-full bg-brand-blue-primary text-white py-3 rounded-2xl font-semibold hover:bg-brand-blue-dark transition-colors"
    >
      Sign out
    </button>
  ) : undefined;

  return (
    <ErrorCard
      title={content.title}
      message={content.message}
      action={action}
    />
  );
};
