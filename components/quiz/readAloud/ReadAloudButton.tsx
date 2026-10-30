// Icon-only 44×44 speaker (R6: always visible), D2 prominent / ghost variants.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Square, Volume2 } from 'lucide-react';
import type { ReadAloudStatus } from './useQuizReadAloud';

const VARIANT: Record<'prominent' | 'ghost', string> = {
  prominent:
    'rounded-2xl border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-300',
  ghost:
    'rounded-2xl border-2 border-transparent text-slate-500 hover:bg-slate-100',
};
const PLAYING =
  'rounded-2xl border-2 border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary';

export const ReadAloudButton: React.FC<{
  label: string;
  status: ReadAloudStatus;
  onClick: () => void;
  onStop: () => void;
  variant?: 'prominent' | 'ghost';
  className?: string;
}> = ({
  label,
  status,
  onClick,
  onStop,
  variant = 'ghost',
  className = '',
}) => {
  const { t } = useTranslation();
  const active = status !== 'idle';
  return (
    <button
      type="button"
      aria-label={active ? t('quizReadAloud.stop', 'Stop') : label}
      aria-pressed={status === 'playing'}
      aria-busy={status === 'loading'}
      title={active ? t('quizReadAloud.stop', 'Stop') : label}
      onClick={active ? onStop : onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
        active ? PLAYING : VARIANT[variant]
      } ${className}`}
    >
      {status === 'loading' ? (
        <Loader2
          className="h-5 w-5 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      ) : status === 'playing' ? (
        <Square className="h-4 w-4 fill-current" aria-hidden />
      ) : (
        <Volume2 className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
};
