import React from 'react';
import { useTranslation } from 'react-i18next';

const BUTTON =
  'inline-flex min-h-11 items-center rounded-2xl border-2 px-4 text-sm font-bold transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60';

const panelTone = (light: boolean): string =>
  light
    ? 'border-slate-200 bg-slate-50 text-slate-800'
    : 'border-slate-600 bg-slate-800 text-slate-100';
const quietButton = (light: boolean): string =>
  light
    ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500';
const labelTone = (light: boolean): string =>
  light ? 'text-slate-500' : 'text-slate-300';

export interface TidyUpPreviewProps {
  before: string;
  after: string;
  onUse: () => void;
  onKeep: () => void;
  light?: boolean;
}

/** Before and after for one tidied passage; nothing changes until the student picks (D9). */
export const TidyUpPreview: React.FC<TidyUpPreviewProps> = ({
  before,
  after,
  onUse,
  onKeep,
  light = false,
}) => {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('dictate.tidyUp', 'Tidy up')}
      className={`space-y-3 rounded-2xl border-2 p-4 text-base ${panelTone(light)}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p
            className={`text-xs font-bold uppercase tracking-wide ${labelTone(light)}`}
          >
            {t('dictate.tidyBefore', 'Yours')}
          </p>
          <p data-testid="tidy-before" className="whitespace-pre-wrap">
            {before}
          </p>
        </div>
        <div>
          <p
            className={`text-xs font-bold uppercase tracking-wide ${labelTone(light)}`}
          >
            {t('dictate.tidyAfter', 'Tidied up')}
          </p>
          <p data-testid="tidy-after" className="whitespace-pre-wrap">
            {after}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button /* no-tour-anchor: student Dictate control */
          type="button"
          onClick={onUse}
          className={`${BUTTON} border-brand-blue-primary bg-brand-blue-primary text-white hover:bg-brand-blue-dark`}
        >
          {t('dictate.tidyUse', 'Use this')}
        </button>
        <button /* no-tour-anchor: student Dictate control */
          type="button"
          onClick={onKeep}
          className={`${BUTTON} ${quietButton(light)}`}
        >
          {t('dictate.tidyKeep', 'Keep mine')}
        </button>
      </div>
    </section>
  );
};

export interface TidyUpNoticeProps {
  message: string;
  /** Offers Undo when set. */
  onUndo?: () => void;
  light?: boolean;
}

/** One line after a tidy-up: what happened, and Undo when there is something to undo. */
export const TidyUpNotice: React.FC<TidyUpNoticeProps> = ({
  message,
  onUndo,
  light = false,
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 px-2 text-sm ${light ? 'text-slate-600' : 'text-slate-300'}`}
    >
      <span>{message}</span>
      {onUndo && (
        <button /* no-tour-anchor: student Dictate control */
          type="button"
          onClick={onUndo}
          className={`${BUTTON} ${quietButton(light)}`}
        >
          {t('dictate.tidyUndo', 'Undo')}
        </button>
      )}
    </div>
  );
};
