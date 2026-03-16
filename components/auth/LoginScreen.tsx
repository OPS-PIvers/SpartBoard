import { APP_NAME } from '../../config/constants';
import React from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, loading } = useAuth();
  const { t } = useTranslation();
  const [signingIn, setSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
      setSigningIn(false);
    }
  };

  return (
    <div className="relative h-screen w-screen flex items-center justify-center bg-slate-50 overflow-hidden font-sans">
      {/* Subtle radial dotted background */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />

      {/* Soft decorative blur orbs */}
      <div
        className={`absolute top-1/4 -left-1/4 w-[500px] h-[500px] rounded-full blur-[100px] animate-pulse ${
          loading ? 'bg-brand-blue-primary/10' : 'bg-brand-blue-primary/20'
        }`}
      />
      <div className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-brand-red-primary/10 rounded-full blur-[100px] animate-pulse delay-1000" />

      {loading ? (
        <Loader2 className="relative z-10 w-12 h-12 text-brand-blue-primary animate-spin" />
      ) : (
        <div className="relative z-10 bg-white/80 backdrop-blur-xl p-10 sm:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 ring-1 ring-slate-900/5 max-w-md w-full mx-4 text-center">
          {/* Logo/Icon Area */}
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-brand-blue-primary to-brand-blue-dark rounded-2xl flex items-center justify-center shadow-lg shadow-brand-blue-primary/20 mb-8 transform -rotate-3 hover:rotate-0 transition-transform duration-300">
            <LogIn className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>

          {/* Typography */}
          <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mb-3">
            {APP_NAME}
          </h1>
          <p className="text-slate-500 mb-10 font-medium text-sm sm:text-base">
            {t('login.signInToAccess')}
          </p>

          {/* Action Button */}
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="group relative w-full bg-brand-blue-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 overflow-hidden shadow-lg shadow-brand-blue-primary/25 hover:shadow-brand-blue-primary/40 hover:bg-brand-blue-dark transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed"
          >
            {/* Subtle button glare effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />

            {signingIn ? (
              <Loader2 className="w-5 h-5 animate-spin relative z-10" />
            ) : (
              <span className="flex items-center gap-3 relative z-10">
                <LogIn className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                {t('login.signInWithGoogle')}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
