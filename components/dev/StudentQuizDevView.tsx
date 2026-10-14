/**
 * DEV-only: the real student `ActiveQuiz` on a timed self-paced session, so the
 * overall time limit clock can be checked without a live session.
 */

import React, { useMemo } from 'react';
import { ActiveQuiz } from '@/components/quiz/QuizStudentApp';
import {
  makeCalculatorQuizSession,
  makeStimulusQuizSession,
  makeTimedQuizSession,
  makeTimedStudentResponse,
} from './sessionViewsMocks';
import { type StudentQuizStateKey } from './devViewStates';

const noop = (): Promise<void> => Promise.resolve();

export const StudentQuizDevView: React.FC<{ state: StudentQuizStateKey }> = ({
  state,
}) => {
  const session = useMemo(
    () =>
      state === 'sq-stimuli'
        ? makeStimulusQuizSession()
        : state === 'sq-calculator'
          ? makeCalculatorQuizSession()
          : makeTimedQuizSession('active'),
    [state]
  );
  const response = makeTimedStudentResponse(
    state === 'sq-last-minute' ? 48_000 : 12 * 60_000 + 34_000
  );
  return (
    <div className="h-full overflow-y-auto">
      <ActiveQuiz
        key={state}
        session={session}
        currentQuestion={session.publicQuestions[0]}
        alreadyAnswered={false}
        myResponse={response}
        onAnswer={noop}
        onCommitRecording={noop}
        onRetryRecordingUpload={noop}
        canRetryRecordingUpload={() => false}
        onMarkUnresponded={noop}
        noticeAckedAt={null}
        onAcknowledgeNotice={() => undefined}
        onComplete={noop}
        reportTabSwitch={() => Promise.resolve(0)}
        onSetHandRaised={noop}
        handRaised={false}
        warningCount={0}
        onRecordStimulusPlay={noop}
        onReportStimulusError={noop}
      />
    </div>
  );
};
