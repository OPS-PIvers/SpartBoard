// The answer-key side of a question's student keyboard: links, accent keys and math boxes.
import React from 'react';
import type { QuizQuestion } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { answerAccents } from '@/config/studentKeyboards';
import { AccentKeysArea } from '@/components/student/keyboards/AccentKeys';
import {
  AccentLanguageRow,
  AnswerKeyboardLinks,
  type AnswerKeyboardProps,
} from './AnswerKeyboardControls';
import type { AnswerInputProps, RenderAnswerInput } from './answerInput';

const MathAnswerField = React.lazy(
  () => import('@/components/student/keyboards/MathAnswerField')
);

export type KeyboardSettings = Omit<AnswerKeyboardProps, 'value' | 'onChange'>;

const MathKeyInput: React.FC<AnswerInputProps> = ({
  value,
  onChange,
  ariaLabel,
  anchor,
}) => (
  <React.Suspense fallback={null}>
    <MathAnswerField
      value={value}
      onChange={(plain) => onChange(plain)}
      ariaLabel={ariaLabel}
      anchor={anchor}
      normalize
      className="flex-1 min-h-11! py-0! px-3! border-2! rounded-lg! bg-white border-slate-200 focus-within:border-brand-blue-primary"
    />
  </React.Suspense>
);

const renderMathKeyInput: RenderAnswerInput = (props) => (
  <MathKeyInput {...props} />
);

export const AnswerKeyKeyboard: React.FC<{
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
  /** Absent where the student keyboard isn't offered. */
  keyboard: KeyboardSettings | undefined;
  children: (parts: {
    links: React.ReactNode;
    renderInput?: RenderAnswerInput;
  }) => React.ReactNode;
}> = ({ question: q, onChange, keyboard, children }) => {
  const mode = keyboard ? q.answerKeyboard : undefined;
  const accents = answerAccents(mode);
  const body = children({
    links: keyboard ? (
      <AnswerKeyboardLinks
        value={q.answerKeyboard}
        onChange={(answerKeyboard) => onChange({ answerKeyboard })}
        defaultAccents={keyboard.defaultAccents}
      />
    ) : null,
    renderInput: mode === 'math' ? renderMathKeyInput : undefined,
  });
  return accents ? (
    <AccentKeysArea
      accents={accents}
      beforeKeys={
        <AccentLanguageRow
          value={accents}
          onChange={(answerKeyboard) => onChange({ answerKeyboard })}
          anchor={tourTypeAttr('quiz-editor.answer-accent-language', 'quiz')}
        />
      }
    >
      {body}
    </AccentKeysArea>
  ) : (
    <>{body}</>
  );
};
