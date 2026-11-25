import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Lock, PauseCircle } from 'lucide-react';
import { tourAttr, type TourAnchorId } from '@/config/tourAnchors';
import type { PeriodLockState } from './periodLockState';
import {
  STUDENT_TEXT_BUTTON,
  StudentScreenError,
  StudentScreenEyebrow,
  StudentScreenMark,
  StudentScreenShell,
  StudentScreenTitle,
} from './StudentScreenShell';

interface StudentPeriodLockedScreenProps {
  title: string;
  lock: PeriodLockState;
  /** The student has work saved, so this reads as a pause rather than a wait. */
  started?: boolean;
  /** Roster PIN for anonymous joiners; empty for signed-in students. */
  pin?: string;
  /** Link under the card, such as back to My Assignments. */
  footer?: React.ReactNode;
}

/** Shown while a student's class isn't open, in every student app. */
export const StudentPeriodLockedScreen: React.FC<
  StudentPeriodLockedScreenProps
> = ({ title, lock, started = false, pin = '', footer }) => {
  const { t, i18n } = useTranslation();
  const opens =
    lock.opensAt != null
      ? t('glStudent.locked.opens', {
          day: new Date(lock.opensAt).toLocaleDateString(i18n.language, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
          time: new Date(lock.opensAt).toLocaleTimeString(i18n.language, {
            hour: 'numeric',
            minute: '2-digit',
          }),
        })
      : lock.paused
        ? t('glStudent.locked.paused')
        : t('glStudent.locked.closed');
  if (lock.closed) {
    return (
      <StudentScreenShell>
        <StudentScreenMark icon={Lock} />
        <StudentScreenEyebrow>{title}</StudentScreenEyebrow>
        <StudentScreenTitle>{t('glStudent.closed.title')}</StudentScreenTitle>
        {footer}
      </StudentScreenShell>
    );
  }
  const body = started
    ? t('glStudent.pausedOverlay.body')
    : lock.ownOpen
      ? t('glStudent.locked.bodyOwn')
      : t('glStudent.locked.body');
  return (
    <StudentScreenShell>
      <StudentScreenMark icon={started ? PauseCircle : Lock} />
      <StudentScreenEyebrow>{title}</StudentScreenEyebrow>
      <StudentScreenTitle>
        {started
          ? t('glStudent.pausedOverlay.title')
          : t('glStudent.locked.title')}
      </StudentScreenTitle>
      <p className="mt-2 text-base font-semibold text-brand-blue-primary">
        {opens}
      </p>
      <p className="mt-3 text-sm text-slate-600">{body}</p>
      {pin && (
        <p className="mt-5 text-sm text-slate-500">
          {t('quizStudent.common.joinedAs')}{' '}
          <span className="font-mono font-semibold text-slate-900">{pin}</span>
        </p>
      )}
      {footer}
    </StudentScreenShell>
  );
};

interface StudentPeriodPickerProps {
  /** The activity's name, when known before joining. */
  title?: string;
  periods: readonly string[];
  /** The period being joined; its row shows a spinner and the list is locked. */
  pendingPeriod: string | null;
  onPick: (period: string) => void;
  error?: string | null;
  /** Live-tour anchor on each class row; apps with no student tour surface leave it off. */
  optionTourId?: TourAnchorId;
  onBack?: () => void;
  backTourId?: TourAnchorId;
}

/** One tap on a class joins it; used by every student app that asks for a class. */
export const StudentPeriodPicker: React.FC<StudentPeriodPickerProps> = ({
  title,
  periods,
  pendingPeriod,
  onPick,
  error = null,
  optionTourId,
  onBack,
  backTourId,
}) => {
  const { t } = useTranslation();
  const busy = pendingPeriod != null;
  return (
    <StudentScreenShell>
      {title ? <StudentScreenEyebrow>{title}</StudentScreenEyebrow> : null}
      <StudentScreenTitle>
        {t('glStudent.start.selectClass')}
      </StudentScreenTitle>
      <p className="mt-2 text-sm text-slate-600">
        {t('glStudent.start.whichPeriod')}
      </p>
      <StudentScreenError message={error} />
      <div className="mt-6 space-y-2 text-left">
        {periods.map((period) => {
          const picked = pendingPeriod === period;
          return (
            <button
              {...(optionTourId ? tourAttr(optionTourId) : {})}
              key={period}
              type="button"
              disabled={busy}
              aria-busy={picked}
              onClick={() => onPick(period)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-base font-semibold transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-default ${
                picked
                  ? 'border-brand-blue-dark bg-brand-blue-dark text-white'
                  : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60'
              }`}
            >
              <span className="min-w-0 break-words text-left">{period}</span>
              {picked ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : (
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
      {onBack && (
        <button
          {...(backTourId ? tourAttr(backTourId) : {})}
          type="button"
          onClick={onBack}
          disabled={busy}
          className={STUDENT_TEXT_BUTTON}
        >
          {t('quizStudent.join.goBack')}
        </button>
      )}
    </StudentScreenShell>
  );
};
