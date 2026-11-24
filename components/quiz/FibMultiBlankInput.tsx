import React, { useRef, useState } from 'react';
import { MathText } from '@/components/common/MathText';
import { joinBlanks, splitBlanks } from '@/utils/quizFibBlanks';
import type { EditorDictation } from '@/utils/speechToText/types';
import { useDictation } from '@/hooks/useDictation';
import { DictateButton } from '@/components/common/dictate/DictateButton';
import { dispatchDictation } from '@/utils/inputSignals';
import { FIB_ROW_ATTR, blankPhrase } from '@/utils/speechToText/blankPhrase';
import { tourFieldAttr } from '@/config/tourAnchors';

const MathAnswerField = React.lazy(
  () => import('@/components/student/keyboards/MathAnswerField')
);

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
}) => (
  <MathText
    text={text}
    format
    renderBlank={(n, raw) => (
      <span className="whitespace-nowrap">
        <BlankBadge n={n} light={light} />
        {raw}
      </span>
    )}
  />
);

/** Compact Dictate mic for one blank: takes a single phrase and hands it over as the blank's answer. */
export const FibDictateMic: React.FC<{
  dictation: EditorDictation;
  onPhrase: (text: string) => void;
  disabled: boolean;
  light: boolean;
}> = ({ dictation, onPhrase, disabled, light }) => {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const blankField = () =>
    wrapRef.current?.closest(`[${FIB_ROW_ATTR}]`)?.querySelector('input');
  const controller = useDictation({
    enabled: !disabled,
    languages: dictation.languages,
    singlePhrase: true,
    paid: dictation.paid,
    onCommit: (text) => {
      const phrase = blankPhrase(text);
      if (!phrase) return;
      dictation.onInsert?.(phrase);
      onPhrase(phrase);
      const field = blankField();
      if (field) dispatchDictation(field, 'after', [...phrase].length);
    },
    // The paid engine heard it better: fix the blank only if it still holds the dictated phrase.
    onRevise: (previous, next) => {
      const phrase = blankPhrase(next);
      const field = blankField();
      if (!phrase || !field || field.value !== blankPhrase(previous)) return;
      dictation.onInsert?.(phrase);
      onPhrase(phrase);
      dispatchDictation(field, 'after', 0);
    },
  });
  if (!controller.supported) return null;
  return (
    <span ref={wrapRef} className="shrink-0">
      <DictateButton
        controller={controller}
        size="compact"
        light={light}
        disabled={disabled}
      />
    </span>
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
  /** Each blank is an equation box. */
  math?: boolean;
  /** Speech to text: a Dictate mic on the blank the student is in; a phrase replaces that blank. */
  dictation?: EditorDictation;
}> = ({
  count,
  value,
  onChange,
  onEnter,
  disabled,
  light,
  inputClassName,
  math = false,
  dictation,
}) => {
  const [active, setActive] = useState(0);
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
        <label
          key={i}
          className="flex items-center gap-3"
          {...{ [FIB_ROW_ATTR]: '' }}
        >
          <span className="text-xl leading-none">
            <BlankBadge n={i + 1} light={light} />
          </span>
          {math ? (
            <React.Suspense fallback={null}>
              <MathAnswerField
                value={parts[i] ?? ''}
                onChange={(plain) => update(i, plain)}
                onEnter={i === count - 1 ? onEnter : undefined}
                disabled={disabled}
                ariaLabel={`Blank ${i + 1}`}
                className={`flex-1 min-w-0 ${inputClassName}`}
              />
            </React.Suspense>
          ) : (
            <input
              {...tourFieldAttr(
                'student.quiz.blank',
                'quiz-student',
                `row-${i + 1}`
              )}
              type="text"
              aria-label={`Blank ${i + 1}`}
              value={parts[i] ?? ''}
              onChange={(e) => update(i, e.target.value)}
              onFocus={() => setActive(i)}
              disabled={disabled}
              className={`flex-1 min-w-0 px-5 py-4 border-2 rounded-2xl text-base focus:outline-hidden focus:ring-0 disabled:opacity-50 ${inputClassName}`}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const nextInput = e.currentTarget
                  .closest('label')
                  ?.nextElementSibling?.querySelector('input');
                if (nextInput) nextInput.focus();
                else onEnter();
              }}
            />
          )}
          {dictation && !math && i === Math.min(active, count - 1) && (
            <FibDictateMic
              dictation={dictation}
              onPhrase={(text) => update(i, text)}
              disabled={disabled}
              light={light}
            />
          )}
        </label>
      ))}
    </div>
  );
};
