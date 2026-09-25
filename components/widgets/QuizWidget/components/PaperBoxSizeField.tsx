// Size of a Free Response question's lined box on paper answer sheets.

import React from 'react';
import type { PaperBoxSize, QuizQuestion } from '@/types';
import {
  PAPER_BOX_SIZES,
  defaultPaperBoxSize,
  paperBoxLines,
} from '@/utils/paperWritten';
import { labelClass } from './quizEditorFieldStyles';

const SIZE_LABELS: Record<PaperBoxSize, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  full: 'Full page',
};

interface Props {
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
}

export const PaperBoxSizeField: React.FC<Props> = ({ question, onChange }) => {
  const value = question.paperBoxSize ?? defaultPaperBoxSize(question.maxWords);
  return (
    <div>
      <span id={`paper-box-${question.id}`} className={labelClass}>
        Paper answer box
      </span>
      <div
        role="group"
        aria-labelledby={`paper-box-${question.id}`}
        className="flex flex-wrap gap-1.5"
      >
        {PAPER_BOX_SIZES.map((size) => {
          const on = size === value;
          return (
            <button
              key={size}
              type="button"
              aria-pressed={on}
              title={`${paperBoxLines(size)} lines`}
              onClick={() => onChange({ paperBoxSize: size })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                on
                  ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              {SIZE_LABELS[size]}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PaperBoxSizeField;
