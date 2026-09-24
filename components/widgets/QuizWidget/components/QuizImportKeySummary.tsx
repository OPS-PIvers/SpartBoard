/** Answer-key summary at the top of the import review (QUIZ_IMPORT_RELIABILITY.md R19). */

import React from 'react';
import { AlertCircle, KeyRound } from 'lucide-react';
import {
  keySummaryParts,
  type KeySummaryCounts,
} from '@/utils/quizDocumentImport/keySummary';

export const QuizImportKeySummary: React.FC<{
  summary?: KeySummaryCounts;
  questionCount: number;
  untickedCount: number;
}> = ({ summary, questionCount, untickedCount }) => {
  const parts = keySummaryParts(summary, questionCount, untickedCount);
  if (parts.length === 0) return null;
  const needsLook =
    !!summary &&
    summary.entries > 0 &&
    (summary.conflicts > 0 ||
      summary.unmatchedLabels.length > 0 ||
      summary.matched < questionCount);
  const Icon = needsLook ? AlertCircle : KeyRound;
  return (
    <p
      role="status"
      className="flex items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"
    >
      <Icon
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${needsLook ? 'text-amber-600' : 'text-slate-500'}`}
        aria-hidden
      />
      <span>
        {summary && summary.entries > 0 && (
          <span className="font-bold">Answer key: </span>
        )}
        {parts.join(' · ')}
      </span>
    </p>
  );
};
