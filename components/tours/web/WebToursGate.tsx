import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { WebTourEditorRosters } from './WebTourEditorRosters';

const SignInPage = lazy(() =>
  import('@/components/auth/SignInPage').then((m) => ({
    default: m.SignInPage,
  }))
);
const WebToursPage = lazy(() =>
  import('./WebToursPage').then((m) => ({ default: m.WebToursPage }))
);

const Spinner: React.FC = () => (
  <main className="flex h-screen h-dvh items-center justify-center bg-white">
    <Loader2
      className="h-6 w-6 animate-spin text-slate-400"
      aria-label="Loading"
    />
  </main>
);

/** Admin-only gate for the standalone `/web-tours` page (HELP_CENTER_HOME.md H9). */
export const WebToursGate: React.FC = () => {
  const { user, loading, globalPermissionsLoaded, isAdmin, canAccessFeature } =
    useAuth();
  if (loading) return <Spinner />;
  if (!user)
    return (
      <Suspense fallback={<Spinner />}>
        <SignInPage />
      </Suspense>
    );
  if (!globalPermissionsLoaded || isAdmin === null) return <Spinner />;
  if (!isAdmin || !canAccessFeature('web-tours'))
    return (
      <main className="flex h-screen h-dvh items-center justify-center bg-white px-4">
        <p role="status" className="text-sm font-semibold text-slate-700">
          {isAdmin ? 'Web tours are turned off.' : 'Web tours are for admins.'}
        </p>
      </main>
    );
  return (
    <WebTourEditorRosters>
      <Suspense fallback={<Spinner />}>
        <WebToursPage />
      </Suspense>
    </WebTourEditorRosters>
  );
};
