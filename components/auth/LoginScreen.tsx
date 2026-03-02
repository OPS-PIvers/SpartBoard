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

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-brand-blue-primary to-brand-blue-dark">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-brand-blue-primary to-brand-blue-dark">
      <div className="bg-white p-12 rounded-3xl shadow-2xl max-w-md w-full text-center">
        <h1 className="text-4xl font-black text-slate-800 mb-4">{APP_NAME}</h1>
        <p className="text-slate-500 mb-8 font-medium">
          {t('login.signInToAccess')}
        </p>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="w-full bg-brand-blue-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-brand-blue-dark transition-all shadow-lg disabled:opacity-50"
        >
          {signingIn ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <LogIn className="w-5 h-5" />
              {t('login.signInWithGoogle')}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
