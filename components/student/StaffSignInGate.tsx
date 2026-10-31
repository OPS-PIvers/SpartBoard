// Sign-in and loading screens for Staff-audience assignment links (district Google accounts only).
import React, { useState } from 'react';
import { Loader2, ShieldAlert, UsersRound } from 'lucide-react';
import { auth } from '@/config/firebase';
import { signInAsStaff, STAFF_EMAIL_DOMAIN } from '@/utils/staffAudience';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="h-screen h-dvh overflow-y-auto bg-slate-50 text-slate-900 flex items-center justify-center px-6 pb-16 pt-10">
    <div className="max-w-md w-full text-center">{children}</div>
  </div>
);

export const StaffChecking: React.FC<{ message?: string }> = ({
  message = 'Checking sign-in…',
}) => (
  <Shell>
    <Loader2
      className="mx-auto w-8 h-8 animate-spin text-slate-400"
      aria-hidden="true"
    />
    <p className="mt-3 text-sm text-slate-500">{message}</p>
  </Shell>
);

export const StaffSignInScreen: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'domain' | 'failed' | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInAsStaff(auth);
      // The activity read its uid on load, so start it fresh as the staff account.
      window.location.reload();
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setBusy(false);
        return;
      }
      setError(
        (err as Error).message === 'not-district-staff' ? 'domain' : 'failed'
      );
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto w-12 h-12 rounded-full bg-brand-blue-primary/10 flex items-center justify-center">
        <UsersRound
          className="w-6 h-6 text-brand-blue-primary"
          aria-hidden="true"
        />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Staff sign-in</h1>
      <p className="mt-2 text-sm text-slate-600">
        This activity is for district staff. Sign in with your @
        {STAFF_EMAIL_DOMAIN} account.
      </p>
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={busy}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 px-5 py-2.5 text-sm font-bold transition-colors shadow-xs disabled:opacity-60"
      >
        {busy && (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        )}
        Sign in with Google
      </button>
      {error && (
        <p
          role="alert"
          className="mt-5 inline-flex items-start gap-2 text-sm text-red-700"
        >
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {error === 'domain'
            ? `Use your @${STAFF_EMAIL_DOMAIN} account.`
            : "Sign-in didn't work. Try again."}
        </p>
      )}
    </Shell>
  );
};
