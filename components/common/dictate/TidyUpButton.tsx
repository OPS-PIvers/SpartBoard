import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles } from 'lucide-react';

export interface TidyUpButtonProps {
  onClick: () => void;
  busy?: boolean;
  /** Light surface, as in self-paced quizzes and Writing. */
  light?: boolean;
  disabled?: boolean;
}

/** "Tidy up": asks for punctuation and capitals on what the student just dictated (D9). */
export const TidyUpButton: React.FC<TidyUpButtonProps> = ({
  onClick,
  busy = false,
  light = false,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const tone = light
    ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500';
  return (
    <button /* no-tour-anchor: student Dictate control */
      type="button"
      aria-busy={busy}
      title={t(
        'dictate.tidyUpHint',
        'Adds punctuation and capital letters to what you just dictated. Your words stay the same.'
      )}
      disabled={disabled || busy}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      {busy ? (
        <Loader2
          aria-hidden
          className="h-5 w-5 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <Sparkles aria-hidden className="h-5 w-5" />
      )}
      <span>
        {busy
          ? t('dictate.tidyingUp', 'Tidying up…')
          : t('dictate.tidyUp', 'Tidy up')}
      </span>
    </button>
  );
};
