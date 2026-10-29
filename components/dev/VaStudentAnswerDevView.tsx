// DEV-only: the real VA question card under each answer rule (va-quiz-alignment slice 5).
import React from 'react';
import { QuestionOverlay } from '@/components/videoActivity/QuestionOverlay';
import type {
  VideoActivityCheckResult,
  VideoActivityPublicQuestion,
} from '@/types';
import type { VaStudentStateKey } from './devViewStates';

const QUESTION: VideoActivityPublicQuestion = {
  id: 'va-dev-q1',
  timestamp: 83,
  text: 'Which gas do plants take in for photosynthesis?',
  type: 'MC',
  options: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'],
};

const check =
  (withhold: boolean) =>
  (answer: string): Promise<VideoActivityCheckResult> =>
    Promise.resolve({
      isCorrect: answer === 'Carbon dioxide',
      correctAnswer: withhold ? '' : 'Carbon dioxide',
    });

const card = (
  props: Partial<React.ComponentProps<typeof QuestionOverlay>>,
  key?: string
) => (
  <QuestionOverlay
    key={key}
    question={QUESTION}
    checkAnswer={check(props.revealAnswer === false)}
    onAnswer={() => new Promise<void>(() => undefined)}
    questionIndex={2}
    totalQuestions={5}
    requireCorrectAnswer={false}
    {...props}
  />
);

export const VaStudentAnswerDevView: React.FC<{ state: VaStudentStateKey }> = ({
  state,
}) => (
  <div className="min-h-full bg-slate-800 p-6 flex flex-col gap-6">
    {state === 'vs-today' && card({})}
    {state === 'vs-reveal-off' && card({ revealAnswer: false })}
    {state === 'vs-result-off' &&
      card({ showResult: false, revealAnswer: false })}
    {state === 'vs-shuffle' && (
      <>
        {card({ optionSeed: 'student-a:attempt-0' }, 'a')}
        {card({ optionSeed: 'student-b:attempt-0' }, 'b')}
      </>
    )}
  </div>
);
