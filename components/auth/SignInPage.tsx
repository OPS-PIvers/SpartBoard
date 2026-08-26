/**
 * The signed-out page at `/`, and in its minimal form at `/remote`.
 *
 * Deliberately just a door: identical for every visitor, with nothing to read
 * past, so a teacher signing in each morning isn't marketed to. What SpartBoard
 * is lives at /about; pilot and district enquiries at /request.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { useAuth } from '@/context/useAuth';
import { AuthShell } from './AuthShell';

// Google's own mark, required by their branding guidelines on this button.
const GoogleMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.71a5.41 5.41 0 0 1 0-3.42V4.958H.957a9 9 0 0 0 0 8.084l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.582C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
    />
  </svg>
);

interface SignInPageProps {
  /** `/remote` drops the secondary links and legal footer — a paired phone
   *  belongs to someone who already has a board. */
  minimal?: boolean;
}

export const SignInPage: React.FC<SignInPageProps> = ({ minimal = false }) => {
  const { signInWithGoogle } = useAuth();
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
    <AuthShell showLegalLinks={!minimal}>
      <img
        src="/favicon.png"
        alt=""
        className="mx-auto mb-5 h-11 w-11 rounded-xl"
      />

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {APP_NAME}
      </h1>
      <p className="mt-1.5 text-sm text-slate-500">
        {t('login.signInToAccess')}
      </p>

      <button
        onClick={handleSignIn}
        disabled={signingIn}
        className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
      >
        {signingIn ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        ) : (
          <GoogleMark />
        )}
        {t('login.signInWithGoogle')}
      </button>

      {/* One way out only. /about carries the district CTA through to /request. */}
      {!minimal && (
        <a
          href="/about"
          className="mt-6 block text-xs text-brand-blue-primary transition hover:underline"
        >
          {t('login.learnMore', { appName: APP_NAME })}
        </a>
      )}
    </AuthShell>
  );
};

export default SignInPage;
