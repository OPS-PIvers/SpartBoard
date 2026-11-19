// Plays a teacher's recorded question prompt with an app-styled button instead of the browser's audio bar.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, RotateCcw, Square } from 'lucide-react';
import type { QuestionAudio } from '@/types';
import { formatAudioDuration, questionAudioUrl } from '@/utils/questionAudio';

type Status = 'idle' | 'loading' | 'playing' | 'failed';

export const QuestionAudioButton: React.FC<{
  audio: QuestionAudio;
  /** `large` is the student prompt button; `small` sits beside a prompt in teacher views. */
  size?: 'large' | 'small';
  light?: boolean;
  className?: string;
}> = ({ audio, size = 'large', light = true, className = '' }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const url = questionAudioUrl(audio);

  useEffect(() => {
    const el = ref.current;
    return () => {
      el?.pause();
    };
  }, [url]);

  const start = () => {
    const el = ref.current;
    if (!el) return;
    if (status === 'failed') el.load();
    setStatus('loading');
    el.currentTime = 0;
    el.play().catch(() => setStatus('failed'));
  };
  const stop = () => {
    ref.current?.pause();
    setStatus('idle');
  };

  const active = status === 'loading' || status === 'playing';
  const label =
    status === 'failed'
      ? t('quizQuestionAudio.retry', 'Try again')
      : active
        ? t('quizQuestionAudio.stop', 'Stop')
        : t('quizQuestionAudio.play', 'Play question');
  const Icon =
    status === 'loading'
      ? Loader2
      : status === 'playing'
        ? Square
        : status === 'failed'
          ? RotateCcw
          : Play;
  const large = size === 'large';
  const tone = active
    ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary'
    : light
      ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      : 'border-white/30 bg-white/10 text-white hover:bg-white/20';

  return (
    <>
      <button /* no-tour-anchor: student question audio control */
        type="button"
        aria-pressed={status === 'playing'}
        aria-busy={status === 'loading'}
        onClick={active ? stop : start}
        onPointerDown={(e) => e.stopPropagation()}
        className={`inline-flex shrink-0 items-center justify-center gap-2 border-2 font-bold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
          large
            ? 'min-h-11 rounded-2xl px-4 text-base'
            : 'min-h-8 rounded-lg px-2.5 text-xs'
        } ${tone} ${className}`}
      >
        <Icon
          className={`${large ? 'h-5 w-5' : 'h-3.5 w-3.5'} ${
            status === 'loading'
              ? 'animate-spin motion-reduce:animate-none'
              : ''
          } ${status === 'playing' || status === 'idle' ? 'fill-current' : ''}`}
          aria-hidden
        />
        <span>{label}</span>
        {status !== 'failed' && audio.durationSec > 0 && (
          <span className="font-semibold tabular-nums opacity-70">
            {formatAudioDuration(audio.durationSec)}
          </span>
        )}
      </button>
      <audio
        ref={ref}
        src={url}
        preload="none"
        className="hidden"
        onPlaying={() => setStatus('playing')}
        onEnded={() => setStatus('idle')}
        onPause={() => setStatus((s) => (s === 'failed' ? s : 'idle'))}
        onError={() => setStatus((s) => (s === 'idle' ? s : 'failed'))}
      />
    </>
  );
};
