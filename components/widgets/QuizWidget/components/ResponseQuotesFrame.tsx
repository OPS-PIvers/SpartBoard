import React from 'react';
import { Quote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tourAttr } from '@/config/tourAnchors';

// Tints passage quotes in the response when the teacher turns Show quotes on.
const QUOTES_VISIBLE_CLASS =
  '**:data-[quote-state=exact]:rounded-xs **:data-[quote-state=exact]:bg-sky-100 **:data-[quote-state=edited]:rounded-xs **:data-[quote-state=edited]:bg-amber-100 **:data-[quote-state=edited]:underline **:data-[quote-state=edited]:decoration-dotted';

/** The Show quotes switch for a response that contains passage quotes. */
export const ShowQuotesButton: React.FC<{
  pressed: boolean;
  onToggle: () => void;
}> = ({ pressed, onToggle }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={pressed}
      {...tourAttr('quiz-grader.show-quotes')}
      title={t(
        'quizQuotes.showQuotesHint',
        'Blue is an exact quote. Amber was changed from the passage.'
      )}
      onClick={onToggle}
      className={`relative touch-target-expand inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold transition-colors ${
        pressed
          ? 'bg-sky-100 text-sky-800'
          : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
      }`}
    >
      <Quote aria-hidden className="h-3.5 w-3.5" />
      {t('quizQuotes.showQuotes', 'Show quotes')}
    </button>
  );
};

/** Wraps a graded written response; tints its passage quotes while Show quotes is on. */
export const ResponseQuotesFrame: React.FC<{
  showQuotes: boolean;
  children: React.ReactNode;
}> = ({ showQuotes, children }) => (
  <div className={showQuotes ? QUOTES_VISIBLE_CLASS : undefined}>
    {children}
  </div>
);
