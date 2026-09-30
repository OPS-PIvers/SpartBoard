/**
 * DEV-only: the real student `ActiveQuiz` on a timed self-paced session, so the
 * overall time limit clock can be checked without a live session.
 */

import React from 'react';
import { ActiveQuiz } from '@/components/quiz/QuizStudentApp';
import {
  makeTimedQuizSession,
  makeTimedStudentResponse,
} from './sessionViewsMocks';

export const STUDENT_QUIZ_STATES = ['sq-timed', 'sq-last-minute'] as const;
export type StudentQuizStateKey = (typeof STUDENT_QUIZ_STATES)[number];

const noop = (): Promise<void> => Promise.resolve();

export const StudentQuizDevView: React.FC<{ state: StudentQuizStateKey }> = ({
  state,
}) => {
  const session = makeTimedQuizSession('active');
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
