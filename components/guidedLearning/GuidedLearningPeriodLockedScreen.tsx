import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { BookOpen, Lock, PauseCircle } from 'lucide-react';
import type { GuidedLearningSession } from '@/types';
import { effectivePeriodState, nextScheduledOpen } from '@/utils/periodAccess';

interface GuidedLearningPeriodLockedScreenProps {
  session: GuidedLearningSession;
  periodKeys: readonly string[];
  now: number;
}

/** "Closed", "Paused" or "Opens Tue 10:40 AM" for the student's period. */
function lockedStateLabel(
  session: GuidedLearningSession,
  periodKeys: readonly string[],
  now: number,
  t: TFunction
): string {
  const opensAt = nextScheduledOpen(session, periodKeys, now);
  if (opensAt != null) {
    const d = new Date(opensAt);
    return t('glStudent.locked.opens', {
      day: d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      time: d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    });
  }
  const paused = periodKeys.some((k) => {
    const access = session.periodAccess?.[k];
    return !!access && effectivePeriodState(access, now) === 'paused';
  });
  return paused ? t('glStudent.locked.paused') : t('glStudent.locked.closed');
}

/** Shown while a student's class period isn't open; no slides or steps until it is. */
export const GuidedLearningPeriodLockedScreen: React.FC<
  GuidedLearningPeriodLockedScreenProps
> = ({ session, periodKeys, now }) => {
  const { t } = useTranslation();
  return (
    <div className="h-screen overflow-y-auto bg-slate-950">
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="flex items-center justify-center gap-2 mb-6">
            <BookOpen className="w-4 h-4 text-indigo-400" aria-hidden />
            <span className="text-slate-300 text-sm font-semibold truncate">
              {session.title}
            </span>
          </div>
          <Lock
            className="w-12 h-12 text-indigo-400 mx-auto mb-4"
            aria-hidden
          />
          <p className="inline-block px-3 py-1 mb-4 rounded-full bg-indigo-500/15 text-indigo-300 text-sm font-bold">
            {lockedStateLabel(session, periodKeys, now, t)}
          </p>
          <h1 className="text-white font-bold text-xl mb-2">
            {t('glStudent.locked.title')}
          </h1>
          <p className="text-slate-300 text-sm">{t('glStudent.locked.body')}</p>
        </div>
      </div>
    </div>
  );
};

/** Covers the player when the student's period closes or pauses mid-activity. */
export const GuidedLearningPeriodPausedOverlay: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
    >
      <PauseCircle className="w-12 h-12 text-white/80 mb-4" aria-hidden />
      <h2 className="text-white font-bold text-2xl mb-2">
        {t('glStudent.pausedOverlay.title')}
      </h2>
      <p className="text-slate-300 text-sm max-w-sm">
        {t('glStudent.pausedOverlay.body')}
      </p>
    </div>
  );
};
