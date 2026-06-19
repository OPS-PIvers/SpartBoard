/**
 * PlcRouteHost — the `/plc...` route entry point (PRD §2.1, Decision 0.3).
 *
 * Mounted by `App.tsx`'s teacher shell (inside DashboardProvider, so the PLC
 * section bodies that read `useDashboard` keep working). It:
 *
 *   1. Reads the parsed `{ plcId, section, meetingId }` from the pathname.
 *   2. Subscribes ONCE to the user's live PLC list via `usePlcs()`.
 *   3. For `/plc` (no plcId) → renders the PLC index hub (your PLCs directory).
 *   4. For `/plc/:plcId...` → resolves the live `Plc`, mounts `PlcProvider`
 *      (T3) with the resolved plc + activeSection, and renders `PlcDashboard`.
 *
 * Closing the dashboard navigates back to `/` (or the prior history entry).
 * Section changes inside `PlcDashboard` push history themselves; this host only
 * owns the plcId-level resolution + the index hub.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Users2, ArrowLeft } from 'lucide-react';

import { usePlcs } from '@/hooks/usePlcs';
import { useAuth } from '@/context/useAuth';
import { PlcProvider } from '@/context/PlcContext';
import { PlcDashboard } from './PlcDashboard';
import { PlcIndexHub } from './PlcIndexHub';
import { spaNavigate, type ParsedPlcPath } from '@/utils/plcPath';

interface PlcRouteHostProps {
  /** Parsed pathname — the single source of truth for which PLC + section. */
  parsed: ParsedPlcPath;
}

const FullScreenSurface: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="fixed inset-0 z-modal bg-slate-50 flex flex-col items-center justify-center overscroll-none">
    {children}
  </div>
);

export const PlcRouteHost: React.FC<PlcRouteHostProps> = ({ parsed }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userEmail = user?.email ?? null;
  // The PLC list listener must be active while any /plc route is mounted so a
  // feature toggle / removal by another member is reflected immediately.
  const { plcs, loading } = usePlcs({ enabled: true });

  const { plcId, section, meetingId } = parsed;

  const activePlc = useMemo(
    () => (plcId ? (plcs.find((p) => p.id === plcId) ?? null) : null),
    [plcs, plcId]
  );

  const goHome = () => spaNavigate('/');

  // --- Index hub: /plc (no plcId) ---
  if (!plcId) {
    return (
      <PlcIndexHub
        plcs={plcs}
        loading={loading}
        userUid={user?.uid ?? null}
        userEmail={userEmail}
        onClose={goHome}
      />
    );
  }

  // --- Loading the list (can't yet tell if the PLC exists) ---
  if (loading && !activePlc) {
    return (
      <FullScreenSurface>
        <Loader2
          className="w-10 h-10 text-brand-blue-primary animate-spin"
          aria-label={t('plcRoute.loading', { defaultValue: 'Loading PLC…' })}
        />
      </FullScreenSurface>
    );
  }

  // --- Resolved + not found (bad/stale deep link, or no longer a member) ---
  if (!activePlc) {
    return (
      <FullScreenSurface>
        <div className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Users2 className="w-7 h-7 text-slate-300" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">
            {t('plcRoute.notFoundTitle', { defaultValue: 'PLC not found' })}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {t('plcRoute.notFoundBody', {
              defaultValue:
                "This PLC doesn't exist or you're no longer a member of it.",
            })}
          </p>
          <button
            type="button"
            onClick={goHome}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('plcRoute.backToBoard', {
              defaultValue: 'Back to my board',
            })}
          </button>
        </div>
      </FullScreenSurface>
    );
  }

  // --- Resolved: mount the provider + dashboard ---
  // `key={plcId}` remounts the dashboard (and the provider's listeners) when
  // navigating between PLCs, matching the per-PLC provider contract (T3 note 1).
  return (
    <PlcProvider
      key={plcId}
      plcId={plcId}
      plc={activePlc}
      activeSection={section}
    >
      <PlcDashboard
        plc={activePlc}
        activeSection={section}
        meetingId={meetingId}
        onClose={goHome}
      />
    </PlcProvider>
  );
};
