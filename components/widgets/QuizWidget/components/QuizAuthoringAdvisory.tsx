/**
 * The editor's warn-but-permit banner. Never blocks a save and never shares
 * the save-error styling — it states what the quiz as authored will do.
 */

import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuizQuestion } from '@/types';
import { buildQuizAuthoringAdvisory } from '@/utils/quizAuthoringAdvisory';

export interface QuizAuthoringAdvisoryProps {
  questions: readonly QuizQuestion[];
  shuffleQuestionsEnabled?: boolean;
}

export const QuizAuthoringAdvisory: React.FC<QuizAuthoringAdvisoryProps> = ({
  questions,
  shuffleQuestionsEnabled = false,
}) => {
  const { t } = useTranslation();
  const lines = useMemo(
    () =>
      buildQuizAuthoringAdvisory(
        { questions, shuffleQuestionsEnabled },
        (key, params) => t(key, params)
      ),
    [questions, shuffleQuestionsEnabled, t]
  );

  if (lines.length === 0) return null;

  return (
    <div
      role="status"
      className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700"
    >
      <div className="flex items-center gap-1.5 mb-1 text-slate-500">
        <Info className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="font-bold uppercase tracking-wider text-xxs">
          {t('quizMediaResponse.authoring.advisory.title')}
        </span>
      </div>
      <ul className="space-y-1 pl-5 list-disc marker:text-slate-400">
        {lines.map((line) => (
          <li key={line.id}>{line.text}</li>
        ))}
      </ul>
    </div>
  );
};
