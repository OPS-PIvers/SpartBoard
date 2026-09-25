import React from 'react';
import { Lock, PauseCircle, PlayCircle } from 'lucide-react';
import type { VideoActivitySession } from '@/types';
import { formatOpensLabel } from '@/utils/assignmentWindow';
import { effectivePeriodState, nextScheduledOpen } from '@/utils/periodAccess';

interface VideoActivityPeriodLockedScreenProps {
  session: VideoActivitySession;
  periodKeys: readonly string[];
  now: number;
  /** The student has answers saved, so this reads as a pause rather than a wait. */
  started: boolean;
}

/** "Closed", "Paused" or "Opens Tue 10:40 AM" for the student's periods. */
function lockedStateLabel(
  session: VideoActivitySession,
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

/** Shown while a student's class period isn't open; no video or questions until it is. */
export const VideoActivityPeriodLockedScreen: React.FC<
  VideoActivityPeriodLockedScreenProps
> = ({ session, periodKeys, now, started }) => {
  const Icon = started ? PauseCircle : Lock;
  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-b from-white to-slate-100">
      <div className="min-h-full flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm shadow-slate-900/5 border border-slate-200 p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <PlayCircle
              className="w-4 h-4 text-brand-red-primary"
              aria-hidden
            />
            <span className="text-slate-700 text-sm font-semibold truncate">
              {session.activityTitle}
            </span>
          </div>
          <Icon
            className="w-12 h-12 text-brand-blue-primary mx-auto mb-4"
            aria-hidden
          />
          <p className="inline-block px-3 py-1 mb-4 rounded-full bg-brand-blue-lighter text-brand-blue-primary text-sm font-bold">
            {lockedStateLabel(session, periodKeys, now)}
          </p>
          <h1 className="text-slate-900 font-black text-xl mb-2">
            {started ? 'Paused for your class' : 'Not open yet'}
          </h1>
          <p className="text-slate-600 text-sm">
            {started
              ? 'Your answers are saved. Keep this tab open.'
              : 'Keep this tab open. The video appears here as soon as your class is let in.'}
          </p>
        </div>
      </div>
    </div>
  );
};

/** Covers the player when the student's period closes or pauses mid-activity. */
export const VideoActivityPeriodPausedOverlay: React.FC = () => (
  <div
    role="status"
    className="absolute inset-0 z-30 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
  >
    <PauseCircle className="w-12 h-12 text-white/80 mb-4" aria-hidden />
    <h2 className="text-white font-black text-2xl mb-2">
      Paused for your class
    </h2>
    <p className="text-slate-200 text-sm max-w-sm">
      Your answers are saved. It resumes when your class opens again.
    </p>
  </div>
);
