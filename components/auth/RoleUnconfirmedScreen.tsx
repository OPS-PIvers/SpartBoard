import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { AuthShell } from './AuthShell';

/** Shown when a district user has no member record and the roster check failed, so we can't tell a student from a teacher. */
export const RoleUnconfirmedScreen: React.FC = () => {
  const { signOut } = useAuth();

  return (
    <AuthShell>
      <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue-primary">
        <RefreshCw className="h-5 w-5 text-white" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        We can&apos;t confirm your account
      </h1>
      <p className="mt-1.5 text-sm text-slate-600">
        We couldn&apos;t check your school account right now.
      </p>
      <p className="mt-1 text-xs text-slate-500">Try again in a few minutes.</p>

      {/* no-tour-anchor: shown only during a roster outage, before the app loads */}
      <button
        onClick={() => window.location.reload()}
        className="mt-7 w-full rounded-xl bg-brand-blue-primary py-3 text-sm font-medium text-white transition hover:bg-brand-blue-dark active:scale-[0.99]"
      >
        Try again
      </button>
      {/* no-tour-anchor: shown only during a roster outage, before the app loads */}
      <button
        onClick={() => {
          void signOut().catch(() => undefined);
        }}
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
      >
        Sign in with a different account
      </button>
    </AuthShell>
  );
};
