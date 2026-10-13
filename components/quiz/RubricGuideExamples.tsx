import React from 'react';
import { useTranslation } from 'react-i18next';

/** A scoring-guide row's example responses, separated by "or". */
export const RubricGuideExamples: React.FC<{
  examples: string[];
  light?: boolean;
}> = ({ examples, light = true }) => {
  const { t } = useTranslation();
  const shown = examples.map((e) => e.trim()).filter(Boolean);
  if (shown.length === 0) return null;
  const muted = light ? 'text-slate-500' : 'text-slate-300';
  return (
    <div
      className={`mt-2 rounded-md border-l-2 pl-2.5 ${
        light ? 'border-slate-300' : 'border-slate-600'
      }`}
    >
      <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>
        {t('rubricGuide.examples', 'Example responses')}
      </p>
      {shown.map((example, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <p
              className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}
            >
              {t('rubricGuide.or', 'or')}
            </p>
          )}
          <p
            className={`text-xs italic leading-relaxed whitespace-pre-line ${
              light ? 'text-slate-700' : 'text-slate-200'
            }`}
          >
            “{example}”
          </p>
        </React.Fragment>
      ))}
    </div>
  );
};
