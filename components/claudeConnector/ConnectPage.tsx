// OAuth consent page for the Claude connector (docs/plans/CLAUDE_CONNECTOR.md CC-D1).
import React from 'react';
import { httpsCallable } from 'firebase/functions';
import { AlertCircle, Check, Loader2, LogIn, Sparkles, X } from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { refreshAccessTokenViaBackend } from '@/utils/googleOAuthRefresh';

// Mirrors AuthorizeRequest / AuthorizeResponse in functions/src/mcp/authorizeCallables.ts.
interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  resource: string;
  decision: 'preview' | 'approve' | 'deny';
}
type AuthorizeResponse =
  | {
      decision: 'preview';
      clientName: string;
      email: string;
      eligible: boolean;
      reason: 'not-member' | 'feature-off' | null;
    }
  | { decision: 'approve' | 'deny'; redirectTo: string };

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'ready'; clientName: string; email: string }
  | { kind: 'ineligible'; reason: 'not-member' | 'feature-off' | null }
  | { kind: 'error'; message: string };

const readParams = (): Omit<AuthorizeRequest, 'decision'> | null => {
  const q = new URLSearchParams(window.location.search);
  if (q.get('response_type') !== 'code') return null;
  return {
    clientId: q.get('client_id') ?? '',
    redirectUri: q.get('redirect_uri') ?? '',
    codeChallenge: q.get('code_challenge') ?? '',
    codeChallengeMethod: q.get('code_challenge_method') ?? '',
    state: q.get('state') ?? '',
    resource: q.get('resource') ?? '',
  };
};

const errorMessage = (err: unknown): string =>
  err instanceof Error && err.message
    ? err.message
    : 'Something went wrong. Start again from Claude.';

const callAuthorize = async (
  req: AuthorizeRequest
): Promise<AuthorizeResponse> => {
  const fn = httpsCallable<AuthorizeRequest, AuthorizeResponse>(
    functions,
    'mcpAuthorizeV1'
  );
  return (await fn(req)).data;
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-50 font-sans p-4">
    <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
    <div className="relative z-10 bg-white/90 backdrop-blur-xl p-8 sm:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 ring-1 ring-slate-900/5 max-w-md w-full">
      {children}
    </div>
  </div>
);

const Spinner: React.FC = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
    <Loader2 className="w-12 h-12 text-brand-blue-primary animate-spin" />
  </div>
);

const Message: React.FC<{
  title: string;
  body: string;
  action?: React.ReactNode;
}> = ({ title, body, action }) => (
  <Shell>
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-red-primary/10 flex items-center justify-center mb-5">
        <AlertCircle className="w-7 h-7 text-brand-red-primary" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
        {title}
      </h1>
      <p className="text-slate-600 mb-6 text-sm sm:text-base leading-relaxed">
        {body}
      </p>
      {action}
    </div>
  </Shell>
);

const CAN = [
  'Create flashcards, quizzes and question banks in your library',
  'Edit items you ask it to change',
  'Undo its own edits for 30 days',
];
const CANNOT = [
  'Delete anything',
  'Assign or share work with students',
  'See student names, answers or scores',
];

export const ConnectPage: React.FC = () => {
  const { user, loading, signInWithGoogle, signOut, captureOfflineGrant } =
    useAuth();
  const params = React.useMemo(readParams, []);
  const [preview, setPreview] = React.useState<PreviewState>({
    kind: 'loading',
  });
  const [busy, setBusy] = React.useState<'approve' | 'deny' | 'signin' | null>(
    null
  );
  const [actionError, setActionError] = React.useState<string | null>(null);
  // Quizzes and banks live in Drive, so the server needs the teacher's offline grant.
  const [drive, setDrive] = React.useState<
    'checking' | 'ok' | 'missing' | 'granting'
  >('checking');

  const [trackedUid, setTrackedUid] = React.useState(user?.uid);
  if (user?.uid !== trackedUid) {
    setTrackedUid(user?.uid);
    setPreview({ kind: 'loading' });
  }

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    refreshAccessTokenViaBackend()
      .then((out) => {
        if (!cancelled)
          setDrive(out.status === 'needs-consent' ? 'missing' : 'ok');
      })
      .catch(() => {
        if (!cancelled) setDrive('ok');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  React.useEffect(() => {
    if (!user || !params) return;
    let cancelled = false;
    callAuthorize({ ...params, decision: 'preview' })
      .then((res) => {
        if (cancelled || res.decision !== 'preview') return;
        setPreview(
          res.eligible
            ? { kind: 'ready', clientName: res.clientName, email: res.email }
            : { kind: 'ineligible', reason: res.reason }
        );
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setPreview({ kind: 'error', message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [user, params]);

  const decide = async (decision: 'approve' | 'deny') => {
    if (!params) return;
    setBusy(decision);
    setActionError(null);
    try {
      const res = await callAuthorize({ ...params, decision });
      if (res.decision === 'preview') throw new Error('Unexpected response.');
      window.location.assign(res.redirectTo);
    } catch (err) {
      setActionError(errorMessage(err));
      setBusy(null);
    }
  };

  const switchAccount = (
    <button
      onClick={() => {
        void signOut();
      }}
      className="text-sm text-brand-blue-primary hover:text-brand-blue-dark font-medium"
    >
      Use a different account
    </button>
  );

  if (!params) {
    return (
      <Message
        title="Open this from Claude"
        body={`This page connects Claude to ${APP_NAME}. In Claude, open Settings > Connectors, find ${APP_NAME}, and choose Connect.`}
      />
    );
  }
  if (loading) return <Spinner />;

  if (!user) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-blue-primary/10 flex items-center justify-center mb-5">
            <Sparkles className="w-7 h-7 text-brand-blue-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
            Connect Claude to {APP_NAME}
          </h1>
          <p className="text-slate-600 mb-7 text-sm sm:text-base leading-relaxed">
            Sign in with your school Google account to continue.
          </p>
          <button
            onClick={() => {
              setBusy('signin');
              signInWithGoogle().catch(() => setBusy(null));
            }}
            disabled={busy === 'signin'}
            className="w-full bg-brand-blue-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-brand-blue-primary/25 hover:bg-brand-blue-dark transition-all active:scale-[0.98] disabled:opacity-70"
          >
            {busy === 'signin' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Sign in with Google
              </>
            )}
          </button>
        </div>
      </Shell>
    );
  }

  if (preview.kind === 'loading') return <Spinner />;
  if (preview.kind === 'error') {
    return <Message title="This link didn't work" body={preview.message} />;
  }
  if (preview.kind === 'ineligible') {
    return (
      <Message
        title="Not available for this account"
        body={
          preview.reason === 'not-member'
            ? `Only teacher accounts in a district that uses ${APP_NAME} can connect Claude. Signed in as ${user.email ?? 'this account'}.`
            : `Connecting Claude isn't turned on for your account yet. Your ${APP_NAME} administrator can tell you when it is.`
        }
        action={switchAccount}
      />
    );
  }

  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-blue-primary/10 flex items-center justify-center mb-5">
          <Sparkles className="w-7 h-7 text-brand-blue-primary" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
          Allow {preview.clientName} to use your {APP_NAME}?
        </h1>
        <p className="text-slate-500 mb-6 text-sm">{preview.email}</p>
      </div>
      <div className="grid gap-4 text-left text-sm mb-7">
        <div>
          <p className="font-semibold text-slate-800 mb-2">Claude can</p>
          <ul className="grid gap-1.5">
            {CAN.map((line) => (
              <li key={line} className="flex gap-2 text-slate-600">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-800 mb-2">
            Claude can&rsquo;t
          </p>
          <ul className="grid gap-1.5">
            {CANNOT.map((line) => (
              <li key={line} className="flex gap-2 text-slate-600">
                <X className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        {(drive === 'missing' || drive === 'granting') && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-slate-700 mb-2">
              Quizzes and question banks are saved in your Google Drive. Allow
              Drive access so Claude can work with them.
            </p>
            <button
              onClick={() => {
                setDrive('granting');
                captureOfflineGrant()
                  .then((ok) => setDrive(ok ? 'ok' : 'missing'))
                  .catch(() => setDrive('missing'));
              }}
              disabled={drive === 'granting'}
              className="text-sm font-semibold text-brand-blue-primary hover:text-brand-blue-dark disabled:opacity-60"
            >
              {drive === 'granting'
                ? 'Waiting for Google…'
                : 'Allow Drive access'}
            </button>
          </div>
        )}
        <p className="text-xs text-slate-500">
          You can disconnect anytime in {APP_NAME} under Profile &amp; Settings
          &gt; Connected apps.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            void decide('approve');
          }}
          disabled={busy !== null}
          className="w-full bg-brand-blue-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center shadow-lg shadow-brand-blue-primary/25 hover:bg-brand-blue-dark transition-all active:scale-[0.98] disabled:opacity-70"
        >
          {busy === 'approve' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            'Allow'
          )}
        </button>
        <button
          onClick={() => {
            void decide('deny');
          }}
          disabled={busy !== null}
          className="w-full bg-white text-slate-700 py-4 rounded-2xl font-semibold border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-70"
        >
          {busy === 'deny' ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            'Cancel'
          )}
        </button>
        {actionError && (
          <p
            className="text-sm text-brand-red-primary text-center"
            role="alert"
          >
            {actionError}
          </p>
        )}
        <div className="text-center">{switchAccount}</div>
      </div>
    </Shell>
  );
};

export default ConnectPage;
