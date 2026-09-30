import React from 'react';
import { joinBlanks, splitBlanks } from '@/utils/quizFibBlanks';

const BLANK_RUN = /(_{2,})/;

const badgeCls = (light: boolean) =>
  light ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300';

const BlankBadge: React.FC<{ n: number; light: boolean }> = ({ n, light }) => (
  <span
    className={`inline-flex items-center justify-center min-w-[1.5em] h-[1.5em] px-1 rounded-full text-[0.7em] font-black align-middle ${badgeCls(light)}`}
  >
    {n}
  </span>
);

/** Question text with each blank numbered to match its answer box. */
export const NumberedBlanksText: React.FC<{ text: string; light: boolean }> = ({
  text,
  light,
}) => {
  // split() with a capture group puts every blank at an odd index.
  return (
    <>
      {text.split(BLANK_RUN).map((part, i) => {
        if (i % 2 === 0) return <React.Fragment key={i}>{part}</React.Fragment>;
        return (
          <span key={i} className="whitespace-nowrap">
            <BlankBadge n={(i + 1) / 2} light={light} />
            {part}
          </span>
        );
      })}
    </>
  );
};

/** One text box per blank; the value is the blanks joined by `FIB_BLANK_SEP`. */
export const FibMultiBlankInput: React.FC<{
  count: number;
  value: string;
  onChange: (next: string) => void;
  onEnter: () => void;
  disabled: boolean;
  light: boolean;
  inputClassName: string;
}> = ({ count, value, onChange, onEnter, disabled, light, inputClassName }) => {
  const parts = splitBlanks(value);
  const update = (index: number, text: string) => {
    const next = Array.from({ length: count }, (_, i) =>
      i === index ? text : (parts[i] ?? '')
    );
    onChange(joinBlanks(next));
  };
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <label key={i} className="flex items-center gap-3">
          <span className="text-xl leading-none">
            <BlankBadge n={i + 1} light={light} />
          </span>
          <input
            type="text"
            aria-label={`Blank ${i + 1}`}
            value={parts[i] ?? ''}
            onChange={(e) => update(i, e.target.value)}
            disabled={disabled}
            className={`flex-1 min-w-0 px-5 py-4 border-2 rounded-2xl text-sm focus:outline-none focus:ring-0 disabled:opacity-50 ${inputClassName}`}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const nextInput = e.currentTarget
                .closest('label')
                ?.nextElementSibling?.querySelector('input');
              if (nextInput) nextInput.focus();
              else onEnter();
            }}
          />
        </label>
      ))}
    </div>
  );
};
