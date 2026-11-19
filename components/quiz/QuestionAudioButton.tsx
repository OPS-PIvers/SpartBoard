// Plays a teacher's recorded question prompt with an app-styled button instead of the browser's audio bar.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, RotateCcw, Square } from 'lucide-react';
import type { QuestionAudio } from '@/types';
import { questionAudioUrl } from '@/utils/questionAudio';

type Status = 'idle' | 'loading' | 'playing' | 'failed';

export const QuestionAudioButton: React.FC<{
  audio: QuestionAudio;
  /** `large` is the student prompt button; `small` sits beside a prompt in teacher views. */
  size?: 'large' | 'small';
  light?: boolean;
  className?: string;
  /** Student only: plays already started this attempt; enforces `audio.playLimit`. */
  viewsUsed?: number;
  /** Student only: called once each time playback actually starts. */
  onViewStart?: () => void;
}> = ({
  audio,
  size = 'large',
  light = true,
  className = '',
  viewsUsed,
  onViewStart,
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLAudioElement | null>(null);
  const countedRef = useRef(true);
  const [status, setStatus] = useState<Status>('idle');
  // Counts this device's views too, so a failed save can't hand back a view.
  const [localViews, setLocalViews] = useState(0);
  const url = questionAudioUrl(audio);
  const limited =
    viewsUsed !== undefined &&
    typeof audio.playLimit === 'number' &&
    audio.playLimit > 0;
  const used = Math.max(viewsUsed ?? 0, localViews);
  const remaining = limited ? Math.max(0, (audio.playLimit ?? 0) - used) : null;
  const usedUp = remaining === 0;

  useEffect(() => {
    const el = ref.current;
    return () => {
      el?.pause();
    };
  }, [url]);

  const start = () => {
    const el = ref.current;
    if (!el || usedUp) return;
    countedRef.current = false;
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
  const playLabel = limited
    ? t('quizQuestionAudio.playCount', {
        used: Math.min(used, audio.playLimit ?? 0),
        total: audio.playLimit,
        defaultValue: 'Play audio ({{used}}/{{total}})',
      })
    : t('quizQuestionAudio.play', 'Play audio');
  const label =
    usedUp && !active
      ? playLabel
      : status === 'failed'
        ? t('quizQuestionAudio.retry', 'Try again')
        : active
          ? t('quizQuestionAudio.stop', 'Stop')
          : playLabel;
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
        disabled={usedUp && !active}
        onClick={active ? stop : start}
        onPointerDown={(e) => e.stopPropagation()}
        className={`inline-flex shrink-0 items-center justify-center gap-2 border-2 font-bold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
          large
            ? 'min-h-11 rounded-2xl px-4 text-base'
            : 'min-h-8 rounded-lg px-2.5 text-xs'
        } ${tone} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
      </button>
      <audio
        ref={ref}
        src={url}
        preload="none"
        className="hidden"
        onPlaying={() => {
          setStatus('playing');
          if (countedRef.current) return;
          countedRef.current = true;
          setLocalViews((n) => Math.max(n, viewsUsed ?? 0) + 1);
          onViewStart?.();
        }}
        onEnded={() => setStatus('idle')}
        onPause={() => setStatus((s) => (s === 'failed' ? s : 'idle'))}
        onError={() => setStatus((s) => (s === 'idle' ? s : 'failed'))}
      />
    </>
  );
};
