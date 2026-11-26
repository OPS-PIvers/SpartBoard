import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, PauseCircle } from 'lucide-react';

/** Covers the player when the student's class or own window closes or pauses mid-activity. */
export const StudentPeriodPausedOverlay: React.FC<{
  /** The student's own close passed, so nothing resumes. */
  closed?: boolean;
}> = ({ closed = false }) => {
  const { t } = useTranslation();
  const Icon = closed ? Lock : PauseCircle;
  return (
    <div
      role="status"
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center backdrop-blur-xs"
    >
      <Icon className="mb-4 h-12 w-12 text-white/80" aria-hidden />
      <h2 className="mb-2 text-2xl font-bold text-white">
        {closed
          ? t('glStudent.closed.title')
          : t('glStudent.pausedOverlay.title')}
      </h2>
      {!closed && (
        <p className="max-w-sm text-sm text-slate-300">
          {t('glStudent.pausedOverlay.body')}
        </p>
      )}
    </div>
  );
};
