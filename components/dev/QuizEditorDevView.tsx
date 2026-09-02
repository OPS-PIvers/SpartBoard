/**
 * DEV-only fixture for the whole quiz question editor. Mounts the REAL
 * `QuizEditorModal` with the media-response gate granted so the Free Response
 * pane (Format row, word limits) can be compared against the other types.
 */
import React from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { useAuth } from '@/context/useAuth';
import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import { DEFAULT_RECORDING_CONFIG } from '@/config/quizRecordingDefaults';
import type { QuizData } from '@/types';

export const QUIZ_EDITOR_STATES = ['qe-gated', 'qe-ungated'] as const;
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
