import React from 'react';
import { ShieldOff } from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { useAuth } from '@/context/useAuth';

/**
 * Full-page screen shown when the signed-in user's organization membership has
 * been deactivated (M1 full sign-in lockout). The membership snapshot in
 * AuthContext latches `accessDeactivated` and signs the user out; this screen
 * renders on that sticky flag REGARDLESS of `user`, so the deactivated teacher
 * gets a clear, actionable reason instead of being silently bounced to the
 * login page.
 *
 * Light surface (mirrors LoginScreen / student / login UI), so the muted-text
 * contrast guidance for DARK surfaces does not apply here — slate-500/600 on a
 * white card is correct.
 */
export const DeactivatedScreen: React.FC = () => {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="relative h-screen w-screen flex items-center justify-center bg-slate-50 overflow-hidden font-sans">
      {/* Subtle radial dotted background (matches LoginScreen) */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
      <div className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-brand-red-primary/10 rounded-full blur-[100px]" />

      <div className="relative z-10 bg-white/80 backdrop-blur-xl p-10 sm:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 ring-1 ring-slate-900/5 max-w-md w-full mx-4 text-center">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-brand-red-primary to-brand-red-dark rounded-2xl flex items-center justify-center shadow-lg shadow-brand-red-primary/20 mb-8">
          <ShieldOff className="w-8 h-8 text-white" strokeWidth={2.5} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mb-3">
          Access deactivated
        </h1>
        <p className="text-slate-600 mb-2 font-medium text-sm sm:text-base">
          Your access to {APP_NAME} has been deactivated.
        </p>
        <p className="text-slate-500 mb-10 text-sm">
          Please contact your administrator if you believe this is a mistake.
        </p>

        <button
          onClick={() => {
            void signInWithGoogle();
          }}
          className="w-full bg-white text-slate-700 py-3.5 rounded-2xl font-bold border border-slate-200 hover:bg-slate-50 transition-colors active:scale-[0.98]"
        >
          Sign in with a different account
        </button>
      </div>
    </div>
  );
};
