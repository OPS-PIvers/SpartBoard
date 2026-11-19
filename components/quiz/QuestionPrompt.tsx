// The question text a student reads; a short stem is a bold heading, a long or multi-paragraph one reads as body text.
import React from 'react';
import type { QuestionAudio } from '@/types';
import { PromptText } from '@/components/common/PromptText';
import { isLongPrompt, spacedPrompt } from '@/utils/quizPromptText';
import { NumberedBlanksText } from './FibMultiBlankInput';
import { QuestionAudioButton } from './QuestionAudioButton';

export const QuestionPrompt: React.FC<{
  text: string;
  blankCount?: number;
  light: boolean;
  className?: string;
  /** The teacher's recording, played from a button above any text. */
  audio?: QuestionAudio;
}> = ({ text, blankCount, light, className = '', audio }) => {
  const long = isLongPrompt(text);
  const shown = long ? spacedPrompt(text) : text;
  const heading = (cls: string) => (
    <h2
      className={`wrap-break-word whitespace-pre-line ${
        long
          ? 'text-lg font-medium leading-relaxed'
          : 'text-xl font-bold leading-snug'
      } ${cls}`}
    >
      {(blankCount ?? 0) >= 2 ? (
        <NumberedBlanksText text={shown} light={light} />
      ) : (
        <PromptText text={shown} />
      )}
    </h2>
  );
  if (!audio) return heading(className);
  return (
    <div className={`flex flex-col items-start gap-3 ${className}`}>
      <QuestionAudioButton audio={audio} light={light} />
      {text.trim() !== '' && heading('')}
    </div>
  );
};
