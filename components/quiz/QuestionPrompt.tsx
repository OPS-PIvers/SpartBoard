// The question text a student reads; a short stem is a bold heading, a long or multi-paragraph one reads as body text.
import React from 'react';
import { MathText } from '@/components/common/MathText';
import { isLongPrompt, spacedPrompt } from '@/utils/quizPromptText';
import { NumberedBlanksText } from './FibMultiBlankInput';

export const QuestionPrompt: React.FC<{
  text: string;
  blankCount?: number;
  light: boolean;
  className?: string;
}> = ({ text, blankCount, light, className = '' }) => {
  const long = isLongPrompt(text);
  const shown = long ? spacedPrompt(text) : text;
  return (
    <h2
      className={`wrap-break-word whitespace-pre-line ${
        long
          ? 'text-lg font-medium leading-relaxed'
          : 'text-xl font-bold leading-snug'
      } ${className}`}
    >
      {(blankCount ?? 0) >= 2 ? (
        <NumberedBlanksText text={shown} light={light} />
      ) : (
        <MathText text={shown} />
      )}
    </h2>
  );
};
