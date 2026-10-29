// Icon-only 44×44 toggle beside a choice row; matches ReadAloudButton's footprint.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';

export const CrossOutChoiceButton: React.FC<{
  /** 1-based position of the choice as shown. */
  n: number;
  crossedOut: boolean;
  onToggle: () => void;
  light: boolean;
  disabled?: boolean;
  className?: string;
}> = ({ n, crossedOut, onToggle, light, disabled, className = '' }) => {
  const { t } = useTranslation();
  const label = t('quizCrossOut.crossOutChoice', {
    defaultValue: 'Cross out choice {{n}}',
    n,
  });
  const tone = light
    ? 'text-slate-500 hover:bg-slate-100'
    : 'text-slate-400 hover:bg-slate-800';
  return (
    // no-tour-anchor: student quiz screen, which teacher tours never open.
    <button
      type="button"
      aria-label={label}
      aria-pressed={crossedOut}
      title={
        crossedOut
          ? t('quizCrossOut.undo', 'Undo cross out')
          : t('quizCrossOut.crossOut', 'Cross out')
      }
      onClick={onToggle}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 disabled:opacity-40 ${tone} ${className}`}
    >
      {crossedOut ? (
        <Undo2 className="h-5 w-5" aria-hidden />
      ) : (
        // Drawn like the editor strikethrough button: "abc" with a line through it.
        <span
          aria-hidden
          className="text-base font-bold leading-none tracking-tight line-through decoration-2"
        >
          abc
        </span>
      )}
    </button>
  );
};
