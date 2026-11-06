// Quiet Math and Accents switches for a typed question, plus the accent language row they open.
import React from 'react';
import { Sigma } from 'lucide-react';
import { type TourAnchorAttrs, tourTypeAttr } from '@/config/tourAnchors';
import { ACCENT_SETS } from '@/config/studentKeyboards';
import type { AccentSetId, AnswerKeyboard } from '@/types';

export interface AnswerKeyboardProps {
  value: AnswerKeyboard | undefined;
  onChange: (next: AnswerKeyboard | undefined) => void;
  /** Language picked when Accents is switched on, from the quiz language. */
  defaultAccents: AccentSetId;
}

const linkCls = (on: boolean) =>
  `inline-flex items-center gap-1 text-xs font-bold transition-colors ${
    on ? 'text-brand-blue-primary' : 'text-slate-400 hover:text-slate-700'
  }`;

export const KeyboardLink: React.FC<{
  on: boolean;
  onClick: () => void;
  anchor: TourAnchorAttrs;
  children: React.ReactNode;
}> = ({ on, onClick, anchor, children }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={linkCls(on)}
    {...anchor}
  >
    {children}
  </button>
);

/** "Σ Math" and "á Accents" for the right side of an answer field's label row. */
export const AnswerKeyboardLinks: React.FC<AnswerKeyboardProps> = ({
  value,
  onChange,
  defaultAccents,
}) => (
  <span className="flex items-center gap-3">
    <KeyboardLink
      on={value === 'math'}
      onClick={() => onChange(value === 'math' ? undefined : 'math')}
      anchor={tourTypeAttr('quiz-editor.answer-math', 'quiz')}
    >
      <Sigma className="w-3.5 h-3.5" aria-hidden />
      Math
    </KeyboardLink>
    <KeyboardLink
      on={!!value && value !== 'math'}
      onClick={() =>
        onChange(value && value !== 'math' ? undefined : defaultAccents)
      }
      anchor={tourTypeAttr('quiz-editor.answer-accents', 'quiz')}
    >
      <span aria-hidden>á</span>
      Accents
    </KeyboardLink>
  </span>
);

/** Language names for the accent keys; the picked one is underlined. */
export const AccentLanguageRow: React.FC<{
  value: AccentSetId;
  onChange: (next: AccentSetId) => void;
  anchor: TourAnchorAttrs;
}> = ({ value, onChange, anchor }) => (
  <div
    role="radiogroup"
    aria-label="Accent language"
    className="flex flex-wrap gap-x-3 gap-y-1"
    {...anchor}
  >
    {ACCENT_SETS.map((s) => (
      <button
        // no-tour-anchor: the language row carries the anchor
        key={s.id}
        type="button"
        role="radio"
        aria-checked={s.id === value}
        onClick={() => onChange(s.id)}
        className={`text-xs py-0.5 border-b-2 transition-colors ${
          s.id === value
            ? 'border-brand-blue-primary text-brand-blue-primary font-semibold'
            : 'border-transparent text-slate-500 hover:text-slate-800'
        }`}
      >
        {s.label}
      </button>
    ))}
  </div>
);
