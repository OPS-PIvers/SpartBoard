/**
 * SubsAuthGate — gates the `/subs` portal on Google sign-in restricted to
 * the @orono.k12.mn.us domain.
 *
 * The teacher app's AuthProvider doesn't enforce a domain at sign-in
 * (parents/admins may use personal accounts in edge cases), so we layer
 * an additional check here:
 *   - Not signed in → show the sign-in panel.
 *   - Signed in with non-orono email → sign out, show "Not allowed" panel.
 *   - Signed in with orono email → render the portal.
 */

import React, { useEffect } from 'react';
import { GraduationCap, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/useAuth';

const ALLOWED_DOMAIN = '@orono.k12.mn.us';

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

interface Props {
  children: React.ReactNode;
}

export const SubsAuthGate: React.FC<Props> = ({ children }) => {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const email = user?.email ?? null;
  const allowed = isAllowedEmail(email);

  // If a teacher signed in with a non-orono account elsewhere and lands
  // on /subs, sign them out so the next sign-in attempt enforces the
  // domain. Fire-and-forget — the auth subscription will re-render us
  // into the sign-in panel.
  useEffect(() => {
    if (!loading && user && !allowed) {
      void signOut();
    }
  }, [loading, user, allowed, signOut]);

  if (loading) {
    return (
      <PortalShell>
        <div className="flex flex-col items-center gap-3 text-white/70">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">Checking sign-in…</span>
        </div>
      </PortalShell>
    );
  }

  if (!user) {
    return (
      <PortalShell>
        <div className="max-w-md w-full mx-auto text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Substitute Portal
          </h1>
          <p className="mt-3 text-sm text-white/60">
            Sign in with your @orono.k12.mn.us Google account to find the board
            for the classroom you&apos;re subbing in today.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white text-brand-blue-dark hover:bg-white/90 px-5 py-2.5 text-sm font-bold transition-colors shadow-lg cursor-pointer"
          >
            <GoogleGlyph />
            Sign in with Google
          </button>
        </div>
      </PortalShell>
    );
  }

  if (!allowed) {
    return (
      <PortalShell>
        <div className="max-w-md w-full mx-auto text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-red-300" />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            District account required
          </h1>
          <p className="mt-2 text-sm text-white/60">
            The Substitute Portal is restricted to{' '}
            <span className="font-mono text-white/80">@orono.k12.mn.us</span>{' '}
            accounts. Signing you out — try again with your district account.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </PortalShell>
    );
  }

  return <>{children}</>;
};

const PortalShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-blue-dark text-white flex flex-col">
    <header className="flex items-center gap-3 px-8 py-5">
      <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
        <GraduationCap className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-sm font-bold tracking-tight">SpartBoard</div>
        <div className="text-[11px] text-white/60 -mt-0.5">
          Substitute Portal
        </div>
      </div>
    </header>
    <main className="flex-1 flex items-center justify-center px-8 pb-16">
      {children}
    </main>
  </div>
);

const GoogleGlyph: React.FC = () => (
  <svg viewBox="0 0 18 18" className="w-4 h-4" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.255h2.908c1.702-1.567 2.684-3.874 2.684-6.612z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.255c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.713A5.41 5.41 0 013.682 9c0-.595.102-1.17.282-1.713V4.955H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.045l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.955L3.964 7.287C4.672 5.16 6.656 3.58 9 3.58z"
    />
  </svg>
);
