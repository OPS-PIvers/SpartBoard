/**
 * DEV-only fixture for the whole quiz question editor. Mounts the REAL
 * `QuizEditorModal` with the media-response gate granted so the Free Response
 * pane (Format row, word limits) can be compared against the other types.
 */
import React from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { useAuth } from '@/context/useAuth';
import {
  QuizEditorModal,
  type QuizEditorBankApi,
} from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import { BankEditorModal } from '@/components/widgets/QuizWidget/components/BankEditorModal';
import { DEFAULT_RECORDING_CONFIG } from '@/config/quizRecordingDefaults';
import type { QuestionBankData, QuizData, QuizStimulus } from '@/types';

export const QUIZ_EDITOR_STATES = [
  'qe-gated',
  'qe-ungated',
  'qe-bank',
  'qe-bank-slot',
] as const;
export type QuizEditorStateKey = (typeof QUIZ_EDITOR_STATES)[number];

const quiz = (): QuizData => ({
  id: 'dev-quiz',
  title: 'Design review fixture',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q-mc',
      type: 'MC',
      text: 'Which planet is closest to the sun?',
      correctAnswer: 'Mercury',
      incorrectAnswers: ['Venus', 'Mars'],
      timeLimit: 30,
    },
    {
      id: 'q-fib',
      type: 'FIB',
      text: 'The capital of France is ____.',
      correctAnswer: 'Paris',
      incorrectAnswers: [],
      timeLimit: 30,
    },
    {
      id: 'q-fib-multi',
      type: 'FIB',
      text: 'Roses are ___ and violets are ___.',
      correctAnswer: 'red\u001Fblue',
      incorrectAnswers: [],
      blankAlternates: [{ answers: [] }, { answers: ['navy'] }],
      allowPartialCredit: true,
      timeLimit: 30,
    },
    {
      id: 'q-match',
      type: 'Matching',
      text: 'Match each term to its definition.',
      correctAnswer: 'Noun:Person, place or thing|Verb:Action word',
      incorrectAnswers: [],
      timeLimit: 0,
    },
    {
      id: 'q-order',
      type: 'Ordering',
      text: 'Order the steps of the water cycle.',
      correctAnswer: 'Evaporation|Condensation|Precipitation',
      incorrectAnswers: [],
      timeLimit: 0,
    },
    {
      id: 'q-fr-typed',
      type: 'free-response',
      text: 'Explain how you solved problem 4.',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      placeholder: 'Cite at least two pieces of evidence.',
      minWords: 100,
      maxWords: 200,
      enforceWordLimit: true,
    },
    {
      id: 'q-fr-spoken',
      type: 'free-response',
      text: 'Describe the experiment out loud.',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      recording: { ...DEFAULT_RECORDING_CONFIG },
    },
  ],
});

const passage: QuizStimulus = {
  id: 'stim-passage',
  type: 'text',
  url: '',
  label: 'The Gift of the Magi',
  text: 'One dollar and eighty-seven cents. That was all.',
};

const bank = (): QuestionBankData => ({
  id: 'dev-bank',
  title: 'Short story bank',
  createdAt: 1,
  updatedAt: 1,
  questions: quiz().questions.slice(0, 3),
  stimuli: [passage],
});

const slotQuiz = (): QuizData => ({
  ...quiz(),
  questions: quiz().questions.slice(0, 2),
  stimuli: [passage],
  bankSlots: [
    {
      id: 'slot-1',
      bankId: 'dev-bank',
      bankTitle: 'Short story bank',
      mode: 'random',
      count: 3,
      stimulusIds: [passage.id],
    },
  ],
  order: [
    { kind: 'question', id: 'q-mc' },
    { kind: 'question', id: 'q-fib' },
    { kind: 'slot', id: 'slot-1' },
  ],
});

const devBankApi: QuizEditorBankApi = {
  sources: [
    {
      key: 'dev-bank',
      kind: 'personal',
      bankId: 'dev-bank',
      title: 'Short story bank',
      questionCount: 12,
      targetIds: [],
      targetCounts: {},
    },
  ],
  loadBankContent: () => Promise.resolve(bank()),
  appendQuestionsToBank: () => Promise.reject(new Error('Dev fixture')),
};

/** Re-provides the real auth value with the media gate forced open. */
const MediaGateGranted: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const auth = useAuth();
  return (
    <AuthContext.Provider
      value={{ ...auth, canAccessQuizMediaResponse: () => true }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const QuizEditorDevView: React.FC<{ state: QuizEditorStateKey }> = ({
  state,
}) => {
  if (state === 'qe-bank') {
    return (
      <BankEditorModal
        isOpen
        bank={bank()}
        onClose={() => undefined}
        onSave={() => Promise.resolve()}
        aiAllowed={false}
      />
    );
  }
  if (state === 'qe-bank-slot') {
    return (
      <QuizEditorModal
        isOpen
        quiz={slotQuiz()}
        bankApi={devBankApi}
        onClose={() => undefined}
        onSave={() => Promise.resolve()}
      />
    );
  }
  const modal = (
    <QuizEditorModal
      key={state}
      isOpen
      quiz={quiz()}
      onClose={() => undefined}
      onSave={() => Promise.resolve()}
    />
  );
  return state === 'qe-gated' ? (
    <MediaGateGranted>{modal}</MediaGateGranted>
  ) : (
    modal
  );
};
