import React, { useState } from 'react';
import { Quote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QUOTE_ATTR } from '@/utils/quizQuotes';
import { tourAttr } from '@/config/tourAnchors';

// Tints passage quotes in the response when the teacher turns Show quotes on.
const QUOTES_VISIBLE_CLASS =
  '[&_[data-quote-state=exact]]:rounded-sm [&_[data-quote-state=exact]]:bg-sky-100 [&_[data-quote-state=edited]]:rounded-sm [&_[data-quote-state=edited]]:bg-amber-100 [&_[data-quote-state=edited]]:underline [&_[data-quote-state=edited]]:decoration-dotted';

/** Wraps a graded written response; adds a Show quotes switch when it contains passage quotes. */
export const ResponseQuotesFrame: React.FC<{
  snapshot: string;
  children: React.ReactNode;
}> = ({ snapshot, children }) => {
  const { t } = useTranslation();
  const [showQuotes, setShowQuotes] = useState(false);
  if (!snapshot.includes(`${QUOTE_ATTR}=`)) return <>{children}</>;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <button
          type="button"
          aria-pressed={showQuotes}
          {...tourAttr('quiz-grader.show-quotes')}
          title={t(
            'quizQuotes.showQuotesHint',
            'Blue is an exact quote. Amber was changed from the passage.'
          )}
          onClick={() => setShowQuotes((v) => !v)}
          className={`relative touch-target-expand inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider transition-colors ${
            showQuotes
              ? 'bg-sky-100 text-sky-800'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Quote aria-hidden className="h-3 w-3" />
          {t('quizQuotes.showQuotes', 'Show quotes')}
        </button>
      </div>
      <div className={showQuotes ? QUOTES_VISIBLE_CLASS : undefined}>
        {children}
      </div>
    </div>
  );
};
