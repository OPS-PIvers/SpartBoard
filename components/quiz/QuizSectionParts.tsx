/** Section intro, breadcrumb and the "answered N of N" lock in the student player (QUIZ_EXAMVIEW_IMPORT.md E12, E13). */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Lock } from 'lucide-react';
import type { SectionProgress } from '@/utils/quizSections';

const chooseLine = (
  t: ReturnType<typeof useTranslation>['t'],
  progress: SectionProgress
): string | null =>
  progress.required < progress.total
    ? t('quizSections.chooseLine', {
        defaultValue: 'Answer any {{required}} of these {{total}} questions.',
        required: progress.required,
        total: progress.total,
      })
    : null;

/** The section's heading and directions, shown on entering it and from the breadcrumb. */
export const SectionIntroDialog: React.FC<{
  progress: SectionProgress;
  light: boolean;
  onClose: () => void;
}> = ({ progress, light, onClose }) => {
  const { t } = useTranslation();
  const { section } = progress;
  const choose = chooseLine(t, progress);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-section-title"
    >
      <div
        className={`w-full max-w-lg rounded-2xl p-6 shadow-xl ${
          light ? 'bg-white text-slate-800' : 'bg-slate-800 text-slate-100'
        }`}
      >
        <h2 id="quiz-section-title" className="text-xl font-bold">
          {section.title}
        </h2>
        {section.directions && (
          <p className="mt-3 whitespace-pre-line leading-relaxed">
            {section.directions}
          </p>
        )}
        {choose && <p className="mt-3 font-bold">{choose}</p>}
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-6 w-full rounded-xl bg-brand-blue-primary px-4 py-3 font-bold text-white hover:bg-brand-blue-dark"
        >
          {t('quizSections.start', 'Start')}
        </button>
      </div>
    </div>
  );
};

/** "Section title · 1 of 2 answered", which reopens the directions. */
export const SectionBreadcrumb: React.FC<{
  progress: SectionProgress;
  light: boolean;
  onOpen: () => void;
}> = ({ progress, light, onOpen }) => {
  const { t } = useTranslation();
  const counted = progress.required < progress.total;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`mb-4 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold ${
        light
          ? 'text-brand-blue-primary hover:bg-slate-100'
          : 'text-slate-200 hover:bg-slate-800'
      }`}
    >
      <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{progress.section.title}</span>
      {counted && (
        <span className="shrink-0 font-normal">
          {t('quizSections.answeredCount', {
            defaultValue: '· {{answered}} of {{required}} answered',
            answered: Math.min(progress.answered, progress.required),
            required: progress.required,
          })}
        </span>
      )}
    </button>
  );
};

/** Shown in place of the answer area once the student has answered N others. */
export const SectionCapNotice: React.FC<{
  progress: SectionProgress;
  light: boolean;
  canClear: boolean;
}> = ({ progress, light, canClear }) => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border p-4 ${
        light
          ? 'border-slate-200 bg-slate-50 text-slate-700'
          : 'border-slate-700 bg-slate-800 text-slate-200'
      }`}
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="text-sm font-bold">
        {canClear
          ? t('quizSections.capReachedClear', {
              defaultValue:
                'You’ve answered {{required}} of {{required}}. Clear one to answer this instead.',
              required: progress.required,
            })
          : t('quizSections.capReached', {
              defaultValue: 'You’ve answered {{required}} of {{required}}.',
              required: progress.required,
            })}
      </p>
    </div>
  );
};

/** Frees this question's place among the N. */
export const ClearSectionAnswerButton: React.FC<{
  light: boolean;
  busy: boolean;
  onClear: () => void;
}> = ({ light, busy, onClear }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={busy}
      className={`mb-4 ml-2 inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold disabled:opacity-50 ${
        light
          ? 'text-slate-600 hover:bg-slate-100'
          : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {t('quizSections.clearAnswer', 'Clear my answer')}
    </button>
  );
};
