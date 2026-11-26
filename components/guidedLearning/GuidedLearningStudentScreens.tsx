import { tourAttr } from '@/config/tourAnchors';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import type { GuidedLearningSession } from '@/types';
import { AUTH_PAGE_BG } from '@/components/auth/authShellStyles';
import {
  GL_PRIMARY_BUTTON,
  GuidedLearningLogo,
  GuidedLearningScreenShell,
  GuidedLearningWelcomeHeader,
  GuidedLearningWelcomeMessage,
} from './GuidedLearningScreenShell';
import { StudentPeriodPicker } from '@/components/student/StudentPeriodScreens';

// The student app's light full-page screens: loading, error, start and end.

export const FullPageLoader: React.FC<{ message?: string }> = ({ message }) => {
  const { t } = useTranslation();
  return (
    <div
      className={`flex h-screen h-dvh flex-col items-center justify-center gap-3 ${AUTH_PAGE_BG}`}
    >
      <Loader2
        className="h-10 w-10 animate-spin text-brand-blue-primary"
        aria-hidden="true"
      />
      <p className="text-sm text-slate-600">
        {message ?? t('glStudent.loading')}
      </p>
    </div>
  );
};

export const ErrorScreen: React.FC<{ message: string }> = ({ message }) => {
  const { t } = useTranslation();
  return (
    <GuidedLearningScreenShell>
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <AlertCircle
          className="h-7 w-7 text-brand-red-primary"
          aria-hidden="true"
        />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {t('glStudent.error.title')}
      </h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
    </GuidedLearningScreenShell>
  );
};

export const StartScreen: React.FC<{
  session: GuidedLearningSession;
  pin: string;
  onPinChange: (v: string) => void;
  selectedPeriod: string | null;
  onPeriodChange: (v: string | null) => void;
  /**
   * View-only Share links are public resources, not assignments — they
   * aren't tied to a specific student or class. When true, the period
   * picker and PIN entry are both suppressed.
   */
  isViewOnly: boolean;
  /** A Staff-audience joiner, shown in place of the PIN. */
  staffName?: string;
  onStart: () => void;
  /** Why the last Start didn't join (per-period sessions). */
  error?: string | null;
  busy?: boolean;
}> = ({
  session,
  pin,
  onPinChange,
  selectedPeriod,
  onPeriodChange,
  isViewOnly,
  staffName,
  onStart,
  error = null,
  busy = false,
}) => {
  const { t } = useTranslation();
  const periods = session.periodNames ?? [];
  const needsPeriodPicker =
    !isViewOnly && periods.length > 1 && !selectedPeriod;

  if (needsPeriodPicker) {
    return (
      <StudentPeriodPicker
        title={session.title}
        periods={periods}
        pendingPeriod={null}
        onPick={onPeriodChange}
        optionTourId="student.guided-learning.period-option"
      />
    );
  }

  // Welcome message gates: must be explicitly enabled AND have non-empty
  // content. Toggle-on-with-empty-message falls through to the default
  // mode/step subtitle so we never render an empty card.
  const welcomeMessage = session.welcomeMessage?.trim() ?? '';
  const welcomeImage = session.welcomeEnabled ? session.welcomeImageUrl : '';
  const showWelcome =
    Boolean(session.welcomeEnabled) &&
    (welcomeMessage.length > 0 || Boolean(welcomeImage));

  return (
    <GuidedLearningScreenShell wide={showWelcome}>
      <GuidedLearningWelcomeHeader
        title={session.title}
        imageUrl={welcomeImage}
        imageAlt={session.welcomeImageAlt}
      >
        {showWelcome ? (
          welcomeMessage ? (
            <GuidedLearningWelcomeMessage text={welcomeMessage} />
          ) : null
        ) : (
          <p
            data-testid="gl-start-mode-chip"
            className="mt-2 text-sm text-slate-500"
          >
            {t(`glPlayer.modeChip.${session.mode}`)}
            {/* A per-period session's steps stay hidden until the period opens. */}
            {session.stepsInContent && session.publicSteps.length === 0
              ? null
              : ` · ${t('glStudent.start.steps', {
                  count: session.publicSteps.length,
                })}`}
          </p>
        )}
      </GuidedLearningWelcomeHeader>

      {!isViewOnly && selectedPeriod && periods.length > 1 && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="text-xs text-slate-500">
            {t('glStudent.start.class')}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">
              {selectedPeriod}
            </span>
            <button
              {...tourAttr('student.guided-learning.change-class')}
              onClick={() => onPeriodChange(null)}
              className="text-xs font-medium text-brand-blue-primary hover:underline"
            >
              {t('glStudent.start.change')}
            </button>
          </div>
        </div>
      )}

      {staffName !== undefined && (
        <p className="mt-6 text-sm text-slate-600">
          Signed in as{' '}
          <span className="font-semibold text-slate-900">{staffName}</span>
        </p>
      )}

      {!isViewOnly && staffName === undefined && (
        <div className="mt-6">
          <label
            htmlFor="gl-student-pin"
            className="mb-1.5 block text-left text-xs font-medium text-slate-600"
          >
            {t('glStudent.start.pin')}{' '}
            <span className="font-normal text-slate-500">
              {t('glStudent.start.optional')}
            </span>
          </label>
          <input
            {...tourAttr('student.guided-learning.pin')}
            id="gl-student-pin"
            type="text"
            value={pin}
            onChange={(e) => onPinChange(e.target.value)}
            placeholder={t('glStudent.start.pinPlaceholder')}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center text-sm tracking-widest text-slate-900 placeholder-slate-400 focus:border-brand-blue-light focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/20"
            maxLength={10}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-brand-red-primary">
          {error}
        </p>
      )}

      <button
        {...tourAttr('student.guided-learning.start')}
        onClick={onStart}
        disabled={busy}
        className={`mt-7 ${GL_PRIMARY_BUTTON}`}
      >
        {showWelcome
          ? t('glStudent.start.getStarted')
          : t('glStudent.start.start')}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </GuidedLearningScreenShell>
  );
};

export const CompletionScreen: React.FC<{
  session: GuidedLearningSession;
  score: number | null;
  isViewOnly: boolean;
  /**
   * Teacher's current score-visibility setting on the session.
   * `'none'` ⇒ render the neutral "submitted, ask your teacher"
   * placeholder; any other value ⇒ keep the gamified Trophy framing.
   * The actual score / per-step results live on the response doc and
   * are surfaced by `PublishedGLReview`, not here.
   */
  visibility: NonNullable<GuidedLearningSession['scoreVisibility']>;
  /**
   * View-only "Replay from beginning" handler. Resets state so the
   * player remounts at step 0. Not shown for response-tracked sessions
   * (those have already submitted — replay would imply submitting
   * twice).
   */
  onReplay: () => void;
}> = ({ session, score, isViewOnly, visibility, onReplay }) => {
  const { t } = useTranslation();
  // View-only completion is a resource's end, not a submitted assignment: no
  // score framing, and Replay is the one action.
  if (isViewOnly) {
    return (
      <GuidedLearningScreenShell>
        <GuidedLearningLogo />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 break-words">
          {session.title}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {t('glStudent.complete.reachedEnd')}
        </p>
        <button
          {...tourAttr('student.guided-learning.replay')}
          onClick={onReplay}
          className={`mt-7 ${GL_PRIMARY_BUTTON}`}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('glStudent.complete.replay')}
        </button>
      </GuidedLearningScreenShell>
    );
  }

  // Unpublished results (the default) get a neutral "submitted" screen. Returning
  // students reach PublishedGLReview once the teacher publishes, so the scored
  // variant below only shows right after submit on a pre-published session.
  if (visibility === 'none') {
    return (
      <GuidedLearningScreenShell>
        <DoneMark />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 break-words">
          {session.title}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {t('glStudent.complete.submitted')}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {t('glStudent.complete.askTeacher')}
        </p>
      </GuidedLearningScreenShell>
    );
  }

  return (
    <GuidedLearningScreenShell>
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
        <Trophy className="h-7 w-7 text-amber-500" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 break-words">
        {session.title}
      </h1>
      <p className="mt-3 text-lg font-semibold text-emerald-700">
        {t('glStudent.complete.complete')}
      </p>
      {score !== null && (
        <p className="mt-1 text-sm text-slate-600">
          <Trans
            i18nKey="glStudent.complete.scored"
            values={{ score }}
            components={{ b: <span className="font-bold text-slate-900" /> }}
          />
        </p>
      )}
      <p className="mt-3 text-sm text-slate-500">
        {t('glStudent.complete.submitted')}
      </p>
    </GuidedLearningScreenShell>
  );
};

const DoneMark: React.FC = () => (
  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
    <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
  </div>
);
