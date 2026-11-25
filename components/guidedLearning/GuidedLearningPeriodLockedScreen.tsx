import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Lock, PauseCircle } from 'lucide-react';
import type { GuidedLearningSession } from '@/types';
import { effectivePeriodState, nextScheduledOpen } from '@/utils/periodAccess';
import { laterOpen } from '@/utils/assignmentWindow';
import { GuidedLearningScreenShell } from './GuidedLearningScreenShell';

interface GuidedLearningPeriodLockedScreenProps {
  session: GuidedLearningSession;
  periodKeys: readonly string[];
  now: number;
  /** The student's own open time, when their window holds them out. */
  opensAt?: number;
}

/** "Closed", "Paused" or "Opens Tue 10:40 AM" for the student's period. */
function lockedStateLabel(
  session: GuidedLearningSession,
  periodKeys: readonly string[],
  now: number,
  t: TFunction,
  ownOpensAt?: number
): string {
  const opensAt = laterOpen(
    nextScheduledOpen(session, periodKeys, now),
    ownOpensAt !== undefined && ownOpensAt > now ? ownOpensAt : null
  );
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
> = ({ session, periodKeys, now, opensAt }) => {
  const { t } = useTranslation();
  return (
    <GuidedLearningScreenShell>
      <LockMark />
      <p className="truncate text-sm font-medium text-slate-500">
        {session.title}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
        {t('glStudent.locked.title')}
      </h1>
      <p className="mt-2 text-sm font-semibold text-brand-blue-primary">
        {lockedStateLabel(session, periodKeys, now, t, opensAt)}
      </p>
      <p className="mt-3 text-sm text-slate-600">
        {t('glStudent.locked.body')}
      </p>
    </GuidedLearningScreenShell>
  );
};

const LockMark: React.FC = () => (
  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-lighter">
    <Lock className="h-6 w-6 text-brand-blue-primary" aria-hidden />
  </div>
);

/** Shown once the session's close time has passed and this student hasn't submitted. */
export const GuidedLearningClosedScreen: React.FC<{
  session: GuidedLearningSession;
}> = ({ session }) => {
  const { t } = useTranslation();
  return (
    <GuidedLearningScreenShell>
      <LockMark />
      <p className="truncate text-sm font-medium text-slate-500">
        {session.title}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
        {t('glStudent.closed.title')}
      </h1>
    </GuidedLearningScreenShell>
  );
};

/** Covers the player when the student's period closes or pauses mid-activity. */
export const GuidedLearningPeriodPausedOverlay: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center"
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
