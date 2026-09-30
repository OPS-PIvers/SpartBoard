import React from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useServerNow } from '@/hooks/useServerNow';
import { QUIZ_TIME_LIMIT_WARN_MS, formatTimeLeft } from '@/utils/quizTimeLimit';

/** Student-side countdown for the overall quiz time limit. */
export const QuizTimeLimitClock: React.FC<{
  deadline: number;
  light: boolean;
}> = ({ deadline, light }) => {
  const { t } = useTranslation();
  const now = useServerNow(1000);
  const left = Math.max(0, deadline - now);
  const warn = left <= QUIZ_TIME_LIMIT_WARN_MS;
  const tone = warn
    ? light
      ? 'text-amber-700 font-semibold'
      : 'text-amber-300 font-semibold'
    : 'text-slate-500';
  const text = formatTimeLeft(left);
  return (
    <span
      role="timer"
      aria-label={t('quizTimeLimit.left', 'Time left {{time}}', { time: text })}
      className={`inline-flex items-center gap-1 text-xs tabular-nums ${tone}`}
    >
      <Clock className="w-3.5 h-3.5" aria-hidden />
      {text}
    </span>
  );
};
