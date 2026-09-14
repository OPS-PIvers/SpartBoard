// Sticky bar under the progress header holding every per-student accommodation control (plan §4.6).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ReadAloudControls } from './readAloud/ReadAloudToolbar';
import type { QuizReadAloudController } from './readAloud/useQuizReadAloud';

export interface AccommodationLocaleToggle {
  /** Native-language label for the target side, e.g. `Español`. Data, not an i18n key. */
  nativeLabel: string;
  /** True while the localized rendering is the one on screen. */
  localized: boolean;
  onChange: (localized: boolean) => void;
}

const segment = (active: boolean): string =>
  `inline-flex min-h-11 items-center rounded-2xl px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
    active
      ? 'bg-brand-blue-primary text-white'
      : 'text-slate-600 hover:text-brand-blue-primary'
  }`;

export const StudentAccommodationBar: React.FC<{
  readAloud?: QuizReadAloudController;
  locale?: AccommodationLocaleToggle;
}> = ({ readAloud, locale }) => {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
        {readAloud && <ReadAloudControls controller={readAloud} />}
        {locale && (
          <div
            className={`inline-flex items-center gap-1 rounded-2xl border-2 border-slate-200 bg-white p-1 ${readAloud ? '' : 'ml-auto'}`}
          >
            <button
              type="button"
              aria-pressed={!locale.localized}
              onClick={() => locale.onChange(false)}
              className={segment(!locale.localized)}
            >
              {t('quizTranslation.student.toggle.english', 'English')}
            </button>
            <button
              type="button"
              aria-pressed={locale.localized}
              onClick={() => locale.onChange(true)}
              className={segment(locale.localized)}
            >
              {locale.nativeLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
