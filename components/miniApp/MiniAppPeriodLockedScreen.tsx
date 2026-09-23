import React from 'react';
import { Box, Lock, PauseCircle } from 'lucide-react';
import type { MiniAppSession } from '@/types';
import { formatOpensLabel } from '@/utils/assignmentWindow';
import { effectivePeriodState, nextScheduledOpen } from '@/utils/periodAccess';

interface MiniAppPeriodLockedScreenProps {
  session: MiniAppSession;
  periodKeys: readonly string[];
  now: number;
}

/** "Closed", "Paused" or "Opens Tue 10:40 AM" for the student's period. */
function lockedStateLabel(
  session: MiniAppSession,
  periodKeys: readonly string[],
  now: number
): string {
  const opensAt = nextScheduledOpen(session, periodKeys, now);
  if (opensAt != null) return formatOpensLabel(opensAt);
  const paused = periodKeys.some((k) => {
    const access = session.periodAccess?.[k];
    return !!access && effectivePeriodState(access, now) === 'paused';
  });
  return paused ? 'Paused' : 'Closed';
}

/** Shown while a student's class period isn't open; the app isn't loaded until it is. */
export const MiniAppPeriodLockedScreen: React.FC<
  MiniAppPeriodLockedScreenProps
> = ({ session, periodKeys, now }) => (
  <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
    <div className="bg-slate-800 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
      <div className="flex items-center justify-center gap-2 mb-6">
        <Box className="w-4 h-4 text-indigo-400" aria-hidden />
        <span className="text-slate-300 text-sm font-semibold truncate">
          {session.appTitle}
        </span>
      </div>
      <Lock className="w-12 h-12 text-indigo-400 mx-auto mb-4" aria-hidden />
      <p className="inline-block px-3 py-1 mb-4 rounded-full bg-indigo-500/15 text-indigo-300 text-sm font-bold">
        {lockedStateLabel(session, periodKeys, now)}
      </p>
      <h1 className="text-white font-bold text-xl mb-2">Not open yet</h1>
      <p className="text-slate-300 text-sm">
        Keep this tab open. The activity appears here as soon as your class is
        let in.
      </p>
    </div>
  </div>
);

/** Covers the app when the student's period closes or pauses mid-activity. */
export const MiniAppPeriodPausedOverlay: React.FC = () => (
  <div
    role="status"
    className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
  >
    <PauseCircle className="w-12 h-12 text-white/80 mb-4" aria-hidden />
    <h2 className="text-white font-bold text-2xl mb-2">
      Paused for your class
    </h2>
    <p className="text-slate-300 text-sm max-w-sm">
      Your teacher paused this for your class. Your work is kept on this page.
      Keep this tab open to pick up where you left off.
    </p>
  </div>
);
