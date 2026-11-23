import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { WebTourEditorRosters } from './WebTourEditorRosters';
import { useTourAuthor } from './useTourAuthor';

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

/** Gate for the standalone `/web-tours` page (HELP_CENTER_HOME.md H9): admins and tour authors (WEB_TOUR_AUTHORS.md E3). */
export const WebToursGate: React.FC = () => {
  const { user, loading, globalPermissionsLoaded, isAdmin } = useAuth();
  const access = useTourAuthor();
  if (loading) return <Spinner />;
  if (!user)
    return (
      <Suspense fallback={<Spinner />}>
        <SignInPage />
      </Suspense>
    );
  if (!globalPermissionsLoaded || isAdmin === null || !access.ready)
    return <Spinner />;
  if (!access.author || !access.passes('web-tours'))
    return (
      <main className="flex h-screen h-dvh items-center justify-center bg-white px-4">
        <p role="status" className="text-sm font-semibold text-slate-700">
          {access.author
            ? 'Web tours are turned off.'
            : 'Web tours are for tour authors. Ask an admin to add you.'}
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
