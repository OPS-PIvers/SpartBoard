// Teacher-side voice preview (D10): editor "Preview voice" and admin "Play sample".
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Square, Volume2 } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import {
  resolveReadAloudUrl,
  synthesizeQuizAudio,
} from '@/utils/quizReadAloudApi';

type State = 'idle' | 'loading' | 'playing' | 'error';

// One shared element: at most one teacher preview plays at a time.
let previewAudio: HTMLAudioElement | null = null;
const previewAudioEl = (): HTMLAudioElement | null => {
  if (typeof Audio === 'undefined') return null;
  previewAudio ??= new Audio();
  return previewAudio;
};

export const ReadAloudPreviewButton: React.FC<{
  language: string;
  /** Exact voice to sample (admin card); omitted = the saved voice for `language`. */
  voice?: string;
  label?: string;
  className?: string;
  anchor?: TourAnchorAttrs;
}> = ({ language, voice, label, className = '', anchor }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<State>('idle');
  const seqRef = useRef(0);

  useEffect(
    () => () => {
      seqRef.current += 1;
      previewAudio?.pause();
    },
    []
  );

  const stop = () => {
    seqRef.current += 1;
    previewAudio?.pause();
    setState('idle');
  };

  const play = async () => {
    const seq = ++seqRef.current;
    setState('loading');
    try {
      const res = await synthesizeQuizAudio({
        mode: 'preview',
        language,
        ...(voice ? { voice } : {}),
      });
      const url = await resolveReadAloudUrl(res.path);
      const audio = previewAudioEl();
      if (seq !== seqRef.current || !audio) return;
      audio.src = url;
      audio.onended = () => {
        if (seq === seqRef.current) setState('idle');
      };
      await audio.play();
      if (seq === seqRef.current) setState('playing');
    } catch (err) {
      console.warn('[ReadAloudPreviewButton] preview failed', err);
      if (seq === seqRef.current) setState('error');
    }
  };

  const text = label ?? t('quizReadAloud.previewVoice', 'Preview voice');
  const active = state === 'loading' || state === 'playing';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={active ? stop : () => void play()}
        aria-pressed={state === 'playing'}
        aria-busy={state === 'loading'}
        {...anchor}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
          active
            ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary'
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
        }`}
      >
        {state === 'loading' ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : state === 'playing' ? (
          <Square className="h-3 w-3 fill-current" aria-hidden />
        ) : (
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
        )}
        {active ? t('quizReadAloud.stop', 'Stop') : text}
      </button>
      {state === 'error' && (
        <span role="status" className="text-xs text-brand-red-primary">
          {t(
            'quizReadAloud.unavailable',
            "Read-aloud isn't available right now."
          )}
        </span>
      )}
    </span>
  );
};
