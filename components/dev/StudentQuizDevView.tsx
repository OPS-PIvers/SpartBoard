/**
 * DEV-only: the real student `ActiveQuiz` on a timed self-paced session, so the
 * overall time limit clock can be checked without a live session.
 */

import React, { useMemo } from 'react';
import {
  ActiveQuiz,
  PublishedScoreReview,
} from '@/components/quiz/QuizStudentApp';
import {
  MyQuizAttemptsLoaderContext,
  type MyQuizAttemptsLoader,
} from '@/hooks/useQuizResponseAttempts';
import type { QuizResponse, QuizSession } from '@/types';
import { QuizStopScreen } from '@/components/quiz/QuizStopScreen';
import { PageProtectionGuards } from '@/components/common/PageProtectionGuards';
import {
  makeCalculatorQuizSession,
  makeStopQuizSession,
  makeStimulusQuizSession,
  makeTimedQuizSession,
  makeTimedStudentResponse,
  makeWhiteboardQuizSession,
} from './sessionViewsMocks';
import { type StudentQuizStateKey } from './devViewStates';

const noop = (): Promise<void> => Promise.resolve();

const T = 1_700_000_000_000;
const ATTEMPT_QUESTIONS = [
  { id: 'a1', text: 'What is 3/4 + 1/8?', choices: ['7/8', '4/12', '1'] },
  {
    id: 'a2',
    text: 'Which fraction is largest?',
    choices: ['2/3', '3/5', '5/9'],
  },
  { id: 'a3', text: 'Simplify 6/9.', choices: ['2/3', '3/6', '1/3'] },
  { id: 'a4', text: 'What is 1/2 of 3/5?', choices: ['3/10', '4/7', '3/5'] },
  {
    id: 'a5',
    text: 'Write 0.75 as a fraction.',
    choices: ['3/4', '7/5', '1/75'],
  },
];
const RIGHT: Record<string, string> = {
  a1: '7/8',
  a2: '2/3',
  a3: '2/3',
  a4: '3/10',
  a5: '3/4',
};
const answersFrom = (picks: Record<string, string>) =>
  Object.entries(picks).map(([questionId, answer]) => ({
    questionId,
    answer,
    isCorrect: RIGHT[questionId] === answer,
  }));

const attemptsLoader: MyQuizAttemptsLoader = () =>
  Promise.resolve({
    attempts: [
      {
        n: 1,
        submittedAt: T,
        score: 40,
        answers: answersFrom({
          a1: '4/12',
          a2: '2/3',
          a3: '3/6',
          a4: '3/10',
          a5: '7/5',
        }),
      },
      {
        n: 2,
        submittedAt: T + 86_400_000,
        score: 60,
        answers: answersFrom({
          a1: '7/8',
          a2: '3/5',
          a3: '2/3',
          a4: '4/7',
          a5: '3/4',
        }),
      },
    ],
  });

function attemptsFixture(live: boolean) {
  const session = {
    id: 'session-attempts',
    quizTitle: 'Fractions check',
    sessionMode: live ? 'teacher' : 'student',
    scoreVisibility: 'score-responses-and-answers',
    revealedAnswers: RIGHT,
    publicQuestions: ATTEMPT_QUESTIONS.map((q) => ({ ...q, type: 'MC' })),
  } as unknown as QuizSession;
  const response = {
    _responseKey: 'student-1',
    studentUid: 'student-1',
    status: 'completed',
    completedAttempts: 3,
    submittedAt: T + 2 * 86_400_000,
    score: 80,
    answers: answersFrom({
      a1: '7/8',
      a2: '2/3',
      a3: '2/3',
      a4: '3/10',
      a5: '1/75',
    }).map((a) => ({ ...a, answeredAt: T })),
  } as unknown as QuizResponse & { _responseKey: string };
  return { session, response };
}

export const StudentQuizDevView: React.FC<{ state: StudentQuizStateKey }> = ({
  state,
}) => {
  const session = useMemo(
    () =>
      state === 'sq-stimuli'
        ? makeStimulusQuizSession()
        : state === 'sq-calculator'
          ? makeCalculatorQuizSession()
          : state === 'sq-whiteboard'
            ? makeWhiteboardQuizSession()
            : state === 'sq-stop-part'
              ? makeStopQuizSession('active')
              : makeTimedQuizSession('active'),
    [state]
  );
  if (state === 'sq-attempts' || state === 'sq-attempts-live') {
    const { session: s, response: r } = attemptsFixture(
      state === 'sq-attempts-live'
    );
    return (
      <MyQuizAttemptsLoaderContext.Provider value={attemptsLoader}>
        <PublishedScoreReview
          key={state}
          session={s}
          myResponse={r}
          visibility="score-responses-and-answers"
          revealedAnswers={RIGHT}
          pin=""
        />
      </MyQuizAttemptsLoaderContext.Provider>
    );
  }
  if (state === 'sq-stop-wait' || state === 'sq-stop-open') {
    return (
      <QuizStopScreen
        nextPart={2}
        ready={state === 'sq-stop-open'}
        onStart={noop}
        pin="1004"
      />
    );
  }
  const response = makeTimedStudentResponse(
    state === 'sq-last-minute' ? 48_000 : 12 * 60_000 + 34_000
  );
  return (
    <div className="h-full overflow-y-auto">
      {state === 'sq-fullscreen' && (
        <PageProtectionGuards
          protections={{
            blockClipboard: true,
            blockPrint: true,
            fullscreen: true,
          }}
        />
      )}
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
        noticeAckedAt={state === 'sq-whiteboard' ? 1_700_000_000_000 : null}
        onAcknowledgeNotice={() => undefined}
        onComplete={noop}
        onSubmitPart={state === 'sq-stop-part' ? noop : undefined}
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
