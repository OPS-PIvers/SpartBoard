import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, ArrowRight } from 'lucide-react';

export interface OpenRecordingQuestion {
  id: string;
  /** Display index in the student's own question order; the jump target. */
  index: number;
  text: string;
}

/**
 * RR-A2 sub-decision 1 — the submit block, stated calmly. An open recording
 * slot stops the submit, so this names each one and offers a way back to it.
 */
export const SubmitBlockedNotice: React.FC<{
  questions: OpenRecordingQuestion[];
  onJump: (index: number) => void;
  light?: boolean;
}> = ({ questions, onJump, light = true }) => {
  const { t } = useTranslation();
  const count = questions.length;
  if (count === 0) return null;

  return (
    <section
      role="status"
      className={`rounded-3xl border p-5 shadow-sm backdrop-blur-sm ${
        light
          ? 'border-slate-200 bg-white/90'
          : 'border-slate-700 bg-slate-800/60'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
            light
              ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
              : 'bg-brand-blue-light/25 text-brand-blue-lighter'
          }`}
        >
          <Mic className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3
            className={`text-base font-bold leading-snug ${
              light ? 'text-slate-900' : 'text-white'
            }`}
          >
            {t('quizMediaResponse.capture.submitBlockedTitle', { count })}
          </h3>
          <p
            className={`mt-1 text-sm leading-relaxed ${
              light ? 'text-slate-700' : 'text-slate-200'
            }`}
          >
            {t('quizMediaResponse.capture.submitBlockedBody', { count })}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {questions.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onJump(q.index)}
              aria-label={t('quizMediaResponse.capture.submitBlockedJump', {
                number: q.index + 1,
              })}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                light
                  ? 'border-slate-200 bg-white hover:border-brand-blue-primary/40 hover:bg-brand-blue-primary/5 focus-visible:outline-brand-blue-primary'
                  : 'border-slate-700 bg-slate-900/40 hover:border-brand-blue-lighter/40 hover:bg-slate-900/70 focus-visible:outline-brand-blue-lighter'
              }`}
            >
              <span
                className={`shrink-0 text-xs font-bold uppercase tracking-wider ${
                  light ? 'text-brand-blue-primary' : 'text-brand-blue-lighter'
                }`}
              >
                {q.index + 1}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                  light ? 'text-slate-800' : 'text-slate-100'
                }`}
              >
                {q.text}
              </span>
              <ArrowRight
                aria-hidden
                className={`h-4 w-4 shrink-0 ${
                  light ? 'text-slate-400' : 'text-slate-300'
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
