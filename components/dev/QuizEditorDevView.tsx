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
import type { QuestionBankData, QuizData, QuizStimulus, Rubric } from '@/types';
import { type QuizEditorStateKey } from './devViewStates';
import { devRichStartingPage } from './whiteboardStartingPageFixtures';

const devRubric = (id: string, title: string, names: string[]): Rubric => {
  const per = 6 / names.length;
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    criteria: names.map((name, i) => ({
      id: `${id}-c${i}`,
      name,
      levels: [
        { id: `${id}-c${i}-lo`, label: 'Beginning', points: 0 },
        { id: `${id}-c${i}-hi`, label: 'Meets', points: per },
      ],
    })),
  };
};

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
      dok: 2,
      targets: [
        {
          id: 'mn-ss-6.4.1',
          kind: 'standard',
          code: '6.4.1.1',
          label: 'Use maps to locate world capitals.',
        },
        {
          id: 'mn-ss-6.4.2',
          kind: 'standard',
          code: '6.4.2.3',
          label: 'Describe how capitals shape a country.',
        },
      ],
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
      points: 6,
      rubricId: 'dev-rubric',
      rubricSnapshot: devRubric('dev-rubric', 'Problem solving', [
        'Strategy',
        'Accuracy',
      ]),
      modifiedRubricId: 'dev-rubric-mod',
      modifiedRubricSnapshot: devRubric(
        'dev-rubric-mod',
        'Problem solving, modified',
        ['Shows work']
      ),
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
    {
      id: 'q-fr-whiteboard',
      type: 'free-response',
      text: 'What keeps the planets moving in orbits around the Sun instead of flying off into space?',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      recording: {
        ...DEFAULT_RECORDING_CONFIG,
        mode: 'whiteboard',
        explainAloud: true,
        limitSeconds: 120,
        startingPage: {
          ...devRichStartingPage(),
          pattern: {
            kind: 'coordinate-plane',
            xMin: -5,
            xMax: 5,
            yMin: -5,
            yMax: 5,
          },
        },
      },
    },
  ],
});

const pic = (name: string) => `https://example.invalid/${name}.png`;

/** MC, Matching and Ordering questions whose answers are only pictures. */
const pictureOnlyQuiz = (): QuizData => ({
  id: 'dev-quiz-pictures',
  title: 'Shapes',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q-pic-mc',
      type: 'MC',
      text: 'Which shape has three sides?',
      correctAnswer: 'Picture ACD',
      incorrectAnswers: ['Picture CDE', 'Picture EFG', 'A hexagon'],
      answerImages: [
        { text: 'Picture ACD', url: pic('triangle') },
        { text: 'Picture CDE', url: pic('square') },
        { text: 'Picture EFG', url: pic('circle') },
      ],
      imageOnlyAnswers: [
        { text: 'Picture ACD', alt: 'A red triangle' },
        { text: 'Picture CDE' },
        { text: 'Picture EFG' },
      ],
      timeLimit: 30,
    },
    {
      id: 'q-pic-match',
      type: 'Matching',
      text: 'Match each shape to its number of sides.',
      correctAnswer:
        'Picture ACD:3 sides|Picture CDE:4 sides|Picture GHJ:6 sides',
      incorrectAnswers: [],
      matchingDistractors: ['0 sides'],
      matchingTermImages: [
        { text: 'Picture ACD', url: pic('triangle') },
        { text: 'Picture CDE', url: pic('square') },
        { text: 'Picture GHJ', url: pic('hexagon') },
      ],
      imageOnlyAnswers: [
        { text: 'Picture ACD' },
        { text: 'Picture CDE' },
        { text: 'Picture GHJ' },
      ],
      timeLimit: 0,
    },
    {
      id: 'q-pic-order',
      type: 'Ordering',
      text: 'Order the shapes from fewest sides to most.',
      correctAnswer: 'Picture ACD|Picture CDE|Picture GHJ',
      incorrectAnswers: [],
      orderingImages: [pic('triangle'), pic('square'), pic('hexagon')],
      imageOnlyAnswers: [
        { text: 'Picture ACD' },
        { text: 'Picture CDE' },
        { text: 'Picture GHJ' },
      ],
      timeLimit: 0,
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

const mapSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#dbeafe"/><path d="M80 300 L200 120 L320 260 L420 150 L560 300 Z" fill="#86efac" stroke="#166534" stroke-width="4"/><circle cx="200" cy="120" r="10" fill="#b91c1c"/><text x="215" y="115" font-family="sans-serif" font-size="24" fill="#1e293b">Mount Hood</text><text x="40" y="380" font-family="sans-serif" font-size="20" fill="#334155">Cascade Range, Oregon</text></svg>'
)}`;

/** A labeled map, an unlabeled photo and an unlabeled passage for the attach list preview. */
const stimuliQuiz = (): QuizData => {
  const base = quiz();
  const stimuli: QuizStimulus[] = [
    { id: 'stim-map', type: 'image', url: mapSvg, label: 'Cascade Range map' },
    passage,
    {
      id: 'stim-wordbank',
      type: 'word-bank',
      url: '',
      label: 'Unit 4 vocab',
      wordBankColumns: 2,
      text: 'Actor-Observer Bias\nBelief Perseverance\nCognitive Dissonance\nDiscrimination\nDispositional Attribution\nDownward Social Comparison\n\nEthnocentrism\nExternal Locus of Control\nFundamental Attribution Error\nImplicit Attitudes\nIn-Group Bias\nInternal Locus of Control\n\nJust-World Phenomenon\nMere Exposure Effect\nOptimistic Explanatory Style\nOut-Group Homogeneity\nPessimistic Explanatory Style\nPrejudice\n\nRelative Deprivation\nSelf-Fulfilling Prophecy\nSelf-Serving Bias\nSituational Attribution\nStereotype\nUpward Social Comparison',
    },
    {
      id: 'stim-untitled',
      type: 'text',
      url: '',
      label: '',
      text: 'Volcanoes form where tectonic plates meet. Magma rises through cracks in the crust and erupts as lava, ash and gas.',
    },
  ];
  return {
    ...base,
    stimuli,
    questions: base.questions.map((q, i) =>
      i === 0
        ? { ...q, stimulusIds: ['stim-map', 'stim-untitled'] }
        : i === 1
          ? { ...q, stimulusIds: [passage.id] }
          : q
    ),
  };
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

const sectionQuiz = (): QuizData => ({
  ...quiz(),
  questions: quiz().questions.slice(0, 3),
  sections: [
    { id: 'sec-1', title: 'Part 1', stopAfter: true },
    { id: 'sec-2', title: 'Part 2' },
  ],
  order: [
    { kind: 'section', id: 'sec-1' },
    { kind: 'question', id: 'q-mc' },
    { kind: 'question', id: 'q-fib' },
    { kind: 'section', id: 'sec-2' },
    { kind: 'question', id: quiz().questions[2].id },
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
      value={{
        ...auth,
        canAccessQuizMediaResponse: () => true,
        canAccessFeature: (id) =>
          id === 'quiz-whiteboard-response' || auth.canAccessFeature(id),
      }}
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
      quiz={
        state === 'qe-sections'
          ? sectionQuiz()
          : state === 'qe-picture-only'
            ? pictureOnlyQuiz()
            : state === 'qe-stimuli'
              ? stimuliQuiz()
              : quiz()
      }
      onClose={() => undefined}
      onSave={() => Promise.resolve()}
    />
  );
  return state === 'qe-gated' || state === 'qe-stimuli' ? (
    <MediaGateGranted>{modal}</MediaGateGranted>
  ) : (
    modal
  );
};
