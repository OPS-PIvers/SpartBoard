// D3 read-aloud controls: Read question, speed pill (D6), Auto-read (D14).
// The sticky chrome around them lives in StudentAccommodationBar (plan §4.6).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Square, Volume2 } from 'lucide-react';
import type { QuizReadAloudController } from './useQuizReadAloud';

export const ReadAloudControls: React.FC<{
  controller: QuizReadAloudController;
}> = ({ controller }) => {
  const { t } = useTranslation();
  const wholeStatus = controller.statusOf({ kind: 'whole' });
  const active = controller.readingQuestion || wholeStatus !== 'idle';
  const whole: typeof wholeStatus = !active
    ? 'idle'
    : controller.loadingPart
      ? 'loading'
      : 'playing';
  const rateLabel = `${controller.rate}×`;
  const message =
    controller.error === 'unavailable'
      ? t('quizReadAloud.unavailable', "Read-aloud isn't available right now.")
      : controller.error === 'load'
        ? t('quizReadAloud.loadError', "Couldn't load audio. Tap to try again.")
        : null;

  return (
    <>
      <button
        type="button"
        onClick={active ? controller.stop : controller.readQuestion}
        aria-pressed={whole === 'playing'}
        aria-busy={whole === 'loading'}
        className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
          active
            ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
        }`}
      >
        {whole === 'loading' ? (
          <Loader2
            className="h-5 w-5 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : whole === 'playing' ? (
          <Square className="h-4 w-4 fill-current" aria-hidden />
        ) : (
          <Volume2 className="h-5 w-5" aria-hidden />
        )}
        {active
          ? t('quizReadAloud.stop', 'Stop')
          : t('quizReadAloud.readQuestion', 'Read question')}
      </button>
      <button
        type="button"
        onClick={controller.cycleRate}
        aria-label={t('quizReadAloud.speed', {
          defaultValue: 'Speed {{rate}}',
          rate: rateLabel,
        })}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-slate-200 bg-white px-3 font-mono text-sm font-bold text-slate-600 transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60"
      >
        {rateLabel}
      </button>
      <div className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600">
        <span id="quiz-read-aloud-auto-label">
          {t('quizReadAloud.autoRead', 'Auto-read')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={controller.auto}
          aria-labelledby="quiz-read-aloud-auto-label"
          onClick={() => controller.setAuto(!controller.auto)}
          className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
            controller.auto ? 'bg-brand-blue-primary' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              controller.auto ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {t('quizReadAloud.speed', {
          defaultValue: 'Speed {{rate}}',
          rate: rateLabel,
        })}
      </p>
      {message && (
        <p
          role="status"
          className="w-full text-xs font-medium text-brand-red-primary"
        >
          {message}
        </p>
      )}
    </>
  );
};
