import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleRow } from './AssignmentSettingsToggleGroup';
import {
  DEFAULT_QUIZ_TIME_LIMIT_MINUTES,
  QUIZ_TIME_LIMIT_MAX_MINUTES,
  QUIZ_TIME_LIMIT_MIN_MINUTES,
  clampQuizTimeLimitMinutes,
} from '@/utils/quizTimeLimit';

/** Overall quiz time limit in minutes; `null` = no limit. */
export const QuizTimeLimitRow: React.FC<{
  minutes: number | null | undefined;
  onChange: (next: number | null) => void;
}> = ({ minutes, onChange }) => {
  const { t } = useTranslation();
  const current = clampQuizTimeLimitMinutes(minutes);
  const enabled = current != null;
  const [inputValue, setInputValue] = useState<string>(
    String(current ?? DEFAULT_QUIZ_TIME_LIMIT_MINUTES)
  );
  const label = t('quizTimeLimit.label', 'Time limit');

  const commit = () => {
    const next =
      clampQuizTimeLimitMinutes(inputValue) ?? DEFAULT_QUIZ_TIME_LIMIT_MINUTES;
    setInputValue(String(next));
    onChange(next);
  };

  return (
    <div>
      <ToggleRow
        label={label}
        checked={enabled}
        onChange={(on) => {
          if (!on) {
            onChange(null);
            return;
          }
          commit();
        }}
      />
      {enabled && (
        <label className="flex items-center gap-2 mt-1.5">
          <input
            type="number"
            min={QUIZ_TIME_LIMIT_MIN_MINUTES}
            max={QUIZ_TIME_LIMIT_MAX_MINUTES}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commit}
            aria-label={t('quizTimeLimit.minutes', 'Minutes')}
            className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          />
          <span className="text-xs text-slate-700">
            {t('quizTimeLimit.unit', 'min')}
          </span>
        </label>
      )}
    </div>
  );
};
