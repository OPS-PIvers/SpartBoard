import React from 'react';
import { ShieldOff } from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { useAuth } from '@/context/useAuth';
import { AuthShell } from './AuthShell';

/**
 * Full-page screen shown when the signed-in user's organization membership has
 * been deactivated (M1 full sign-in lockout). The membership snapshot in
 * AuthContext latches `accessDeactivated` and signs the user out; this screen
 * renders on that sticky flag REGARDLESS of `user`, so the deactivated teacher
 * gets a clear, actionable reason instead of being silently bounced to sign-in.
 *
 * Shares AuthShell with SignInPage so the two stay visually identical by
 * construction. Light surface, so the muted-text guidance for DARK surfaces
 * does not apply — slate-500/600 on a white card is correct.
 */
export const DeactivatedScreen: React.FC = () => {
  const { signInWithGoogle } = useAuth();

  return (
    <AuthShell>
      <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red-primary">
        <ShieldOff className="h-5 w-5 text-white" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Access deactivated
      </h1>
      <p className="mt-1.5 text-sm text-slate-600">
        Your access to {APP_NAME} has been deactivated.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Contact your administrator if you believe this is a mistake.
      </p>

      <button
        onClick={() => {
          // signInWithGoogle() re-throws (incl. popup-closed-by-user). Swallow it
          // so a cancelled popup doesn't surface as an unhandledrejection.
          void signInWithGoogle().catch(() => undefined);
        }}
        className="mt-7 w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
      >
        Sign in with a different account
      </button>
    </AuthShell>
  );
};
