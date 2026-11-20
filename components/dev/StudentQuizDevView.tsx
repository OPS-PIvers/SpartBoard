/**
 * DEV-only: the real student `ActiveQuiz` on a timed self-paced session, so the
 * overall time limit clock can be checked without a live session.
 */

import React, { useMemo } from 'react';
import {
  ActiveQuiz,
  PublishedScoreReview,
  QuizSubmittedWaitScreen,
  ResultsScreen,
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
  makeOptionImagesQuizSession,
  makePictureOnlyQuizSession,
  makePictureStimulusQuizSession,
  makeStopQuizSession,
  makeStimulusQuizSession,
  makeTimedQuizSession,
  makeTimedStudentResponse,
  makeWhiteboardQuizSession,
} from './sessionViewsMocks';
import { type StudentQuizStateKey } from './devViewStates';

const noop = (): Promise<void> => Promise.resolve();

const SUPPORTS_OVERRIDE = {
  supports: [
    {
      kind: 'text' as const,
      title: 'Word bank',
      text: 'numerator\ndenominator\nequivalent\nsimplify',
    },
    {
      kind: 'link' as const,
      title: 'Fraction strips',
      url: 'https://example.org/fraction-strips',
    },
  ],
};

/** The first question carries modified wording. */
function modifiedSession() {
  const base = makeTimedQuizSession('active');
  const [first, ...rest] = base.publicQuestions;
  return {
    ...base,
    publicQuestions: [
      {
        ...first,
        modifiedText:
          'Add the two fractions: 1/2 + 1/4. Hint: 1/2 is the same as 2/4.',
      },
      ...rest,
    ],
  };
}

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
        points: { earned: 2, possible: 5 },
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
        points: { earned: 3, possible: 5 },
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
    scorePoints: { earned: 4, possible: 5, attempt: 3 },
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

const RECAP_QUESTIONS = [
  {
    id: 'r1',
    type: 'MC',
    text: 'Which layer of Earth is the thinnest?',
    choices: ['Mantle', 'Crust', 'Outer core', 'Inner core'],
  },
  {
    id: 'r2',
    type: 'MC',
    text: 'What causes most earthquakes?',
    choices: [
      'Movement of tectonic plates',
      'Changes in the weather',
      'The pull of the Moon',
      'Volcanic ash',
    ],
  },
  {
    id: 'r3',
    type: 'MA',
    text: 'Select all of the igneous rocks.',
    choices: ['Granite', 'Sandstone', 'Basalt', 'Marble', 'Obsidian'],
  },
];
const RECAP_KEY: Record<string, string> = {
  r1: 'Crust',
  r2: 'Movement of tectonic plates',
  r3: 'Granite|Basalt|Obsidian',
};
function recapFixture() {
  const session = {
    id: 'session-recap',
    quizTitle: 'Earth science check',
    recapAllOptions: true,
    sessionMode: 'student',
    publicQuestions: RECAP_QUESTIONS,
  } as unknown as QuizSession;
  const response = {
    _responseKey: 'student-1',
    studentUid: 'student-1',
    status: 'completed',
    submittedAt: T,
    score: 33,
    answers: [
      { questionId: 'r1', answer: 'Mantle', isCorrect: false },
      {
        questionId: 'r2',
        answer: 'Movement of tectonic plates',
        isCorrect: true,
      },
      { questionId: 'r3', answer: 'Granite|Marble', isCorrect: false },
    ].map((a) => ({ ...a, answeredAt: T })),
  } as unknown as QuizResponse & { _responseKey: string };
  return { session, response };
}

export const StudentQuizDevView: React.FC<{ state: StudentQuizStateKey }> = ({
  state,
}) => {
  const session = useMemo(
    () =>
      state === 'sq-picture-only-mc'
        ? makePictureOnlyQuizSession('MC')
        : state === 'sq-picture-only-matching'
          ? makePictureOnlyQuizSession('Matching')
          : state === 'sq-picture-only-ordering'
            ? makePictureOnlyQuizSession('Ordering')
            : state === 'sq-ordering-list'
              ? {
                  ...makeOptionImagesQuizSession('Ordering'),
                  orderingList: true,
                }
              : state === 'sq-images-ordering'
                ? makeOptionImagesQuizSession('Ordering')
                : state === 'sq-images-matching'
                  ? makeOptionImagesQuizSession('Matching')
                  : state === 'sq-images-mc'
                    ? makeOptionImagesQuizSession('MC')
                    : state === 'sq-stimuli' || state === 'sq-supports-stimuli'
                      ? makeStimulusQuizSession()
                      : state === 'sq-picture' || state === 'sq-pictures'
                        ? makePictureStimulusQuizSession(
                            state === 'sq-pictures'
                          )
                        : state === 'sq-calculator'
                          ? makeCalculatorQuizSession()
                          : state === 'sq-whiteboard'
                            ? makeWhiteboardQuizSession()
                            : state === 'sq-stop-part'
                              ? makeStopQuizSession('active')
                              : state === 'sq-cross-out'
                                ? {
                                    ...makeTimedQuizSession('active'),
                                    allowCrossOut: true,
                                  }
                                : state === 'sq-fullscreen'
                                  ? {
                                      ...makeTimedQuizSession('active'),
                                      tabAwayLimitSeconds: 30,
                                      tabAwayAutoSubmit: true,
                                    }
                                  : state === 'sq-modified'
                                    ? modifiedSession()
                                    : state === 'sq-review-blank'
                                      ? {
                                          ...makeTimedQuizSession('active'),
                                          reviewStep: true,
                                        }
                                      : makeTimedQuizSession('active'),
    [state]
  );
  if (state === 'sq-recap-responses' || state === 'sq-recap-answers') {
    const { session: s, response: r } = recapFixture();
    const answers = state === 'sq-recap-answers';
    return (
      <PublishedScoreReview
        key={state}
        session={s}
        myResponse={r}
        visibility={
          answers ? 'score-responses-and-answers' : 'score-and-responses'
        }
        revealedAnswers={answers ? RECAP_KEY : undefined}
        pin=""
      />
    );
  }
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
  if (state === 'sq-submitted' || state === 'sq-submitted-live') {
    const { session: s, response: r } = attemptsFixture(
      state === 'sq-submitted-live'
    );
    return (
      <QuizSubmittedWaitScreen
        session={{ ...s, scoreVisibility: undefined }}
        myResponse={r}
        pin={state === 'sq-submitted-live' ? '1004' : ''}
        answeredCount={5}
        totalQuestions={5}
      />
    );
  }
  if (state === 'sq-results') {
    const { session: s, response: r } = attemptsFixture(false);
    return (
      <ResultsScreen
        session={{ ...s, scoreVisibility: undefined }}
        myResponse={r}
        answeredCount={5}
        totalQuestions={5}
        pin=""
      />
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
  const timedResponse = makeTimedStudentResponse(
    state === 'sq-last-minute' ? 48_000 : 12 * 60_000 + 34_000
  );
  const response =
    state === 'sq-reopened'
      ? { ...timedResponse, unlocked: true, unlockKind: 'reopen' as const }
      : state === 'sq-unlocked'
        ? { ...timedResponse, unlocked: true }
        : state === 'sq-review-blank'
          ? {
              ...timedResponse,
              answers: [{ questionId: 'q2', answer: '1/2', answeredAt: 0 }],
            }
          : timedResponse;
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
        fullscreenRequired={state === 'sq-fullscreen'}
        override={
          state === 'sq-supports' || state === 'sq-supports-stimuli'
            ? SUPPORTS_OVERRIDE
            : state === 'sq-modified'
              ? { modifiedQuestions: true }
              : undefined
        }
      />
    </div>
  );
};
