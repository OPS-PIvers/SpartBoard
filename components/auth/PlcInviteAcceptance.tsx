import React from 'react';
import {
  Loader2,
  LogIn,
  CheckCircle2,
  AlertCircle,
  Users2,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { APP_NAME } from '@/config/constants';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import type { PlcInvitation } from '@/types';

const INVITATIONS_COLLECTION = 'plc_invitations';

/**
 * Extract the invite id from the current URL.
 *
 * Strips the leading `/plc-invite/` segment, stops at a query string or
 * trailing slash, and returns an empty string when the id is missing or
 * blank.
 */
const extractInviteId = (): string => {
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : '';
  const prefix = '/plc-invite/';
  if (!pathname.startsWith(prefix)) return '';
  const rest = pathname.slice(prefix.length);
  const stopAt = rest.search(/[/?#]/);
  const id = stopAt === -1 ? rest : rest.slice(0, stopAt);
  return id.trim();
};

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; invite: PlcInvitation }
  | { kind: 'not-found' }
  | { kind: 'wrong-account'; expectedEmail: string }
  | { kind: 'already-used'; status: 'accepted' | 'declined' }
  | { kind: 'error'; message: string };

type ActionState =
  | { kind: 'idle' }
  | { kind: 'accepting' }
  | { kind: 'declining' }
  | { kind: 'accepted' }
  | { kind: 'declined' }
  | { kind: 'action-error'; message: string };

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

const SignInPromptCard: React.FC<{ plcName?: string }> = ({ plcName }) => {
  const { signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('PLC invite sign-in failed:', error);
      setSigningIn(false);
    }
  };

  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-blue-primary/10 flex items-center justify-center mb-5">
          <Users2 className="w-7 h-7 text-brand-blue-primary" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
          You&rsquo;re invited to a PLC
        </h1>
        <p className="text-slate-600 mb-7 text-sm sm:text-base leading-relaxed">
          {plcName
            ? `Sign in to accept your invitation to "${plcName}" on ${APP_NAME}.`
            : `Sign in to accept your invitation to ${APP_NAME}.`}
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

const AcceptedCard: React.FC<{ plcName: string }> = ({ plcName }) => (
  <AuthShell>
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
        Welcome to {plcName}
      </h1>
      <p className="text-slate-600 mb-2 text-sm sm:text-base">
        Redirecting you to {APP_NAME}…
      </p>
      <Loader2 className="w-5 h-5 text-brand-blue-primary animate-spin mt-2" />
    </div>
  </AuthShell>
);

const DeclinedCard: React.FC<{ plcName: string }> = ({ plcName }) => (
  <AuthShell>
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center mb-5">
        <Users2 className="w-7 h-7 text-slate-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
        Invitation declined
      </h1>
      <p className="text-slate-600 mb-6 text-sm sm:text-base">
        You&rsquo;ve declined the invitation to {plcName}. The lead can send a
        new invite anytime.
      </p>
      <a
        href="/"
        className="text-sm text-brand-blue-primary hover:text-brand-blue-dark font-medium"
      >
        Return to {APP_NAME}
      </a>
    </div>
  </AuthShell>
);

const AcceptPanel: React.FC<{
  invite: PlcInvitation;
  action: ActionState;
  onAccept: () => void;
  onDecline: () => void;
}> = ({ invite, action, onAccept, onDecline }) => {
  const busy = action.kind === 'accepting' || action.kind === 'declining';
  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-blue-primary/10 flex items-center justify-center mb-5">
          <Users2 className="w-7 h-7 text-brand-blue-primary" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
          Join &ldquo;{invite.plcName}&rdquo;
        </h1>
        <p className="text-slate-600 mb-7 text-sm sm:text-base leading-relaxed">
          <span className="font-semibold">{invite.invitedByName}</span> has
          invited you to join this Professional Learning Community on {APP_NAME}
          .
        </p>
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={onAccept}
            disabled={busy}
            className="group relative w-full bg-brand-blue-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-brand-blue-primary/25 hover:shadow-brand-blue-primary/40 hover:bg-brand-blue-dark transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed"
          >
            {action.kind === 'accepting' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Accept invitation'
            )}
          </button>
          <button
            onClick={onDecline}
            disabled={busy}
            className="w-full bg-white text-slate-700 py-4 rounded-2xl font-semibold border border-slate-200 hover:bg-slate-50 transition-colors active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed"
          >
            {action.kind === 'declining' ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              'Decline'
            )}
          </button>
        </div>
        {action.kind === 'action-error' && (
          <p className="mt-4 text-sm text-brand-red-primary" role="alert">
            {action.message}
          </p>
        )}
      </div>
    </AuthShell>
  );
};

export const PlcInviteAcceptance: React.FC = () => {
  const [inviteId] = React.useState(() => extractInviteId());
  const { user, loading, signOut } = useAuth();
  const { acceptInvite, declineInvite } = usePlcInvitations();
  const [load, setLoad] = React.useState<LoadState>({ kind: 'idle' });
  const [action, setAction] = React.useState<ActionState>({ kind: 'idle' });

  const myEmailLower = (user?.email ?? '').toLowerCase();

  // Read the invite doc once we have an authenticated user. The rules only
  // allow the invitee (by email) or inviter (by uid) to read it, so we need
  // auth before reading. Bad reads map to friendly error states rather than
  // leaking a raw PERMISSION_DENIED.
  React.useEffect(() => {
    if (!inviteId) return;
    if (loading) return;
    if (!user) return;
    if (load.kind !== 'idle') return;

    setLoad({ kind: 'loading' });
    const run = async () => {
      try {
        const snap = await getDoc(doc(db, INVITATIONS_COLLECTION, inviteId));
        if (!snap.exists()) {
          setLoad({ kind: 'not-found' });
          return;
        }
        const data = snap.data();
        const expectedEmail =
          typeof data.inviteeEmailLower === 'string'
            ? data.inviteeEmailLower
            : '';
        if (expectedEmail && expectedEmail !== myEmailLower) {
          setLoad({ kind: 'wrong-account', expectedEmail });
          return;
        }
        const status = typeof data.status === 'string' ? data.status : '';
        if (status === 'accepted' || status === 'declined') {
          setLoad({ kind: 'already-used', status });
          return;
        }
        if (status !== 'pending') {
          setLoad({ kind: 'not-found' });
          return;
        }
        const invite: PlcInvitation = {
          id: snap.id,
          plcId: String(data.plcId ?? ''),
          plcName: String(data.plcName ?? 'a Professional Learning Community'),
          inviteeEmailLower: expectedEmail,
          invitedByUid: String(data.invitedByUid ?? ''),
          invitedByName: String(data.invitedByName ?? 'A teacher'),
          invitedAt:
            typeof data.invitedAt === 'number' ? data.invitedAt : Date.now(),
          status: 'pending',
        };
        setLoad({ kind: 'ready', invite });
      } catch (error) {
        console.error('Failed to load PLC invite:', error);
        const code = (error as { code?: string } | null)?.code;
        if (code === 'permission-denied') {
          // Signed in with an account the rules won't let read this doc —
          // most commonly, a different email than the invitee.
          setLoad({ kind: 'wrong-account', expectedEmail: '' });
          return;
        }
        setLoad({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unexpected error',
        });
      }
    };

    void run();
  }, [inviteId, loading, user, myEmailLower, load.kind]);

  const handleAccept = async () => {
    if (load.kind !== 'ready') return;
    setAction({ kind: 'accepting' });
    try {
      await acceptInvite(load.invite);
      setAction({ kind: 'accepted' });
      window.setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch (error) {
      console.error('Failed to accept PLC invite:', error);
      setAction({
        kind: 'action-error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not accept this invitation. Try again in a moment.',
      });
    }
  };

  const handleDecline = async () => {
    if (load.kind !== 'ready') return;
    setAction({ kind: 'declining' });
    try {
      await declineInvite(load.invite);
      setAction({ kind: 'declined' });
    } catch (error) {
      console.error('Failed to decline PLC invite:', error);
      setAction({
        kind: 'action-error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not decline this invitation. Try again in a moment.',
      });
    }
  };

  if (!inviteId) {
    return (
      <ErrorCard
        title="Invalid invite link"
        message="This invitation link is missing its id. Ask the teacher who invited you for a new link."
      />
    );
  }

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <SignInPromptCard />;
  }

  if (load.kind === 'idle' || load.kind === 'loading') {
    return <FullPageSpinner />;
  }

  if (load.kind === 'not-found') {
    return (
      <ErrorCard
        title="Invitation not found"
        message="This invitation is no longer available. It may have been revoked by the lead. Ask them for a new link."
      />
    );
  }

  if (load.kind === 'already-used') {
    if (load.status === 'accepted') {
      return (
        <ErrorCard
          title="Already accepted"
          message={`You've already accepted this invitation. Head to ${APP_NAME} to find your PLC in the sidebar.`}
        />
      );
    }
    return (
      <ErrorCard
        title="Invitation declined"
        message="This invitation was declined. Ask the lead to send a new one if you'd like to reconsider."
      />
    );
  }

  if (load.kind === 'wrong-account') {
    const expected = load.expectedEmail
      ? ` to ${load.expectedEmail}`
      : ' to a different account';
    return (
      <ErrorCard
        title="Wrong account"
        message={`This invitation was sent${expected}. Sign out and sign in with the invited email.`}
        action={
          <button
            onClick={() => {
              void signOut();
            }}
            className="w-full bg-brand-blue-primary text-white py-3 rounded-2xl font-semibold hover:bg-brand-blue-dark transition-colors"
          >
            Sign out
          </button>
        }
      />
    );
  }

  if (load.kind === 'error') {
    return <ErrorCard title="Something went wrong" message={load.message} />;
  }

  // load.kind === 'ready'
  if (action.kind === 'accepted') {
    return <AcceptedCard plcName={load.invite.plcName} />;
  }
  if (action.kind === 'declined') {
    return <DeclinedCard plcName={load.invite.plcName} />;
  }

  return (
    <AcceptPanel
      invite={load.invite}
      action={action}
      onAccept={() => {
        void handleAccept();
      }}
      onDecline={() => {
        void handleDecline();
      }}
    />
  );
};

export default PlcInviteAcceptance;
