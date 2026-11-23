// DEV-only: the Assign on paper flow on real components at /paper-test-dev, for mockups and screenshots.

import React, { useMemo, useState } from 'react';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import {
  QuizManager,
  type QuizManagerTab,
} from '@/components/widgets/QuizWidget/components/QuizManager';
import { PaperImportModal } from '@/components/widgets/QuizWidget/components/PaperImportModal';
import { PaperPrintModal } from '@/components/widgets/QuizWidget/components/PaperPrintModal';
import {
  printedGroupForPrint,
  printedGroupQuiz,
  printedGroupResolved,
  studentCopyPick,
} from '@/utils/paperPrintedVersions';
import { RosterList } from '@/components/widgets/QuizWidget/components/monitor/RosterList';
import type { MonitorStudent } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';
import { resolveQuizAssignment } from '@/utils/questionBanks';
import { PaperReprintModal } from '@/components/widgets/QuizWidget/components/PaperReprintModal';
import { PaperGroupReprintModal } from '@/components/widgets/QuizWidget/components/PaperGroupReprintModal';
import type {
  ClassRoster,
  PaperBatch,
  QuizAssignment,
  QuizConfig,
  QuizData,
  QuizMetadata,
  QuizResponse,
  QuizSession,
  QuizStimulus,
} from '@/types';

const NOW = Date.UTC(2026, 10, 4, 15);
const noop = (): void => undefined;
const FIRST = ['Avery', 'Jordan', 'Priya', 'Mateo', 'Sofia', 'Elijah', 'Hana'];
const LAST = ['Nguyen', 'Larson', 'Patel', 'Garcia', 'Olson', 'Kim', 'Berg'];

const ROSTERS: ClassRoster[] = [1, 2, 4].map((p) => ({
  id: `r${p}`,
  name: `Period ${p} Biology`,
  driveFileId: null,
  studentCount: 26,
  createdAt: NOW,
  students: Array.from({ length: 26 }, (_, i) => ({
    id: `r${p}-s${i}`,
    firstName: FIRST[i % FIRST.length],
    lastName: `${LAST[(i * 3) % LAST.length]}`,
    pin: String(i),
  })),
}));

const TITLES = [
  'Cell structure test',
  'Photosynthesis quiz',
  'Genetics unit test',
  'Ecology checkpoint',
  'Evolution review',
  'Lab safety quiz',
];

const QUIZZES: QuizMetadata[] = TITLES.map((title, i) => ({
  id: `quiz-${i}`,
  title,
  driveFileId: `drive-${i}`,
  questionCount: 24 - i,
  createdAt: NOW - i * 86_400_000,
  updatedAt: NOW - i * 86_400_000,
}));

const base = (i: number): QuizAssignment => ({
  id: `qa-${i}`,
  quizId: `quiz-${i}`,
  quizTitle: TITLES[i],
  quizDriveFileId: `drive-${i}`,
  teacherUid: 'mock-user-id',
  code: `KQ${String(100 + i)}`,
  sessionMode: 'student',
  sessionOptions: {},
  status: 'active',
  createdAt: NOW - i * 86_400_000,
  updatedAt: NOW - i * 86_400_000,
  periodNames: [ROSTERS[i % 3].name],
});

const PAPER: QuizAssignment = {
  ...base(0),
  id: 'qa-paper',
  paper: true,
  paperBatchId: 'batch-1',
  status: 'paused',
  createdAt: NOW,
  periodNames: [ROSTERS[0].name, ROSTERS[1].name],
};

const IN_PROGRESS = [PAPER, base(1), { ...base(2), status: 'paused' as const }];
const WITH_COPIES = [
  { ...base(1), paperCopyBatchIds: ['batch-g1', 'batch-g2'] },
  base(2),
];
const COMPLETED = [
  { ...PAPER, status: 'inactive' as const, hasPaperResponses: true },
  { ...base(3), status: 'inactive' as const },
  { ...base(4), status: 'inactive' as const },
];

const CONFIG: QuizConfig = {
  view: 'manager',
  selectedQuizId: null,
  selectedQuizTitle: null,
  activeAssignmentId: null,
  activeLiveSessionCode: null,
  resultsSessionId: null,
};

const Manager: React.FC<{
  tab: QuizManagerTab;
  assignments: QuizAssignment[];
}> = ({ tab: initial, assignments }) => {
  const [tab, setTab] = useState<QuizManagerTab>(initial);
  return (
    <QuizManager
      userId="mock-user-id"
      quizzes={QUIZZES}
      loading={false}
      error={null}
      onNew={noop}
      onImport={noop}
      onEdit={noop}
      onPreview={noop}
      onAssign={noop}
      onResults={noop}
      onDelete={noop}
      onShare={noop}
      rosters={ROSTERS}
      config={CONFIG}
      managerTab={tab}
      onTabChange={setTab}
      banks={[]}
      banksLoading={false}
      sharedBankSources={[]}
      onNewBank={noop}
      onImportBank={noop}
      onEditBank={noop}
      onDuplicateBank={noop}
      onDeleteBank={noop}
      onAssignOnPaper={noop}
      onReadPaperQuestions={noop}
      onImportPaperResponses={noop}
      onReprintPaperSheets={noop}
      assignments={assignments}
      assignmentsLoading={false}
    />
  );
};

const QUIZ: QuizData = {
  id: 'quiz-0',
  title: 'Cell structure test',
  questions: [],
  createdAt: NOW,
  updatedAt: NOW,
};

const BATCH: PaperBatch = {
  id: 'batch-1',
  quizId: 'quiz-0',
  rosterIds: ['r1', 'r2'],
  questionCount: 24,
  choiceCount: 4,
  seats: Object.fromEntries(
    [...ROSTERS[0].students, ...ROSTERS[1].students].map((st, i) => [
      i + 1,
      { rosterId: st.id.split('-')[0], studentId: st.id },
    ])
  ),
  spareSeats: [53, 54],
  pagesPerSheet: 1,
  createdAt: NOW,
};

const ASSIGN_QUIZ: QuizData = {
  ...QUIZ,
  questions: Array.from({ length: 24 }, (_, i) => ({
    id: `q${i + 1}`,
    timeLimit: 0,
    text: `Question ${i + 1}`,
    type: 'MC' as const,
    correctAnswer: 'Nucleus',
    incorrectAnswers: ['Ribosome', 'Vacuole', 'Cell wall'],
  })),
};

// A random pull of 3 from an 8-question bank: every sheet prints its own draw.
const BANK_POOL: QuizData['questions'] = [
  [
    'Which organelle makes proteins?',
    'Ribosome',
    ['Nucleus', 'Vacuole', 'Cell wall'],
  ],
  [
    'Which organelle holds the DNA?',
    'Nucleus',
    ['Ribosome', 'Golgi body', 'Vacuole'],
  ],
  [
    'Where does photosynthesis happen?',
    'Chloroplast',
    ['Mitochondria', 'Nucleus', 'Ribosome'],
  ],
  [
    'Which part controls what enters the cell?',
    'Cell membrane',
    ['Cell wall', 'Vacuole', 'Nucleus'],
  ],
  [
    'Which organelle releases energy from food?',
    'Mitochondria',
    ['Chloroplast', 'Ribosome', 'Golgi body'],
  ],
  [
    'Which structure stores water in plant cells?',
    'Vacuole',
    ['Nucleus', 'Ribosome', 'Cell membrane'],
  ],
  [
    'Which cells have a cell wall?',
    'Plant cells',
    ['Animal cells', 'Both', 'Neither'],
  ],
  [
    'Which organelle packages proteins?',
    'Golgi body',
    ['Nucleus', 'Vacuole', 'Chloroplast'],
  ],
].map(([text, correct, wrong], i) => ({
  id: `bq${i + 1}`,
  timeLimit: 0,
  text: text as string,
  type: 'MC' as const,
  correctAnswer: correct as string,
  incorrectAnswers: wrong as string[],
}));
const BANK_QUIZ: QuizData = {
  ...QUIZ,
  title: 'Organelles check',
  questions: ASSIGN_QUIZ.questions.slice(0, 2),
  bankSlots: [
    {
      id: 'slot-1',
      bankId: 'bank-1',
      bankTitle: 'Organelles',
      mode: 'random',
      count: 3,
    },
  ],
};
const BANK_RESOLVED = resolveQuizAssignment(
  BANK_QUIZ,
  new Map([
    ['bank-1', { id: 'bank-1', title: 'Organelles', questions: BANK_POOL }],
  ])
);

const PaperAssign: React.FC = () => (
  <PaperPrintModal
    quiz={ASSIGN_QUIZ}
    rosters={ROSTERS}
    assign={{
      plcs: [],
      initialSharing: { plcMode: false, plcId: '' },
      onCreateAssignment: () => Promise.resolve(),
    }}
    onSaveBatch={() => Promise.resolve()}
    onClose={noop}
    onError={noop}
  />
);

const WRITTEN_QUIZ: QuizData = {
  ...ASSIGN_QUIZ,
  questions: [
    ...ASSIGN_QUIZ.questions.slice(0, 4),
    {
      id: 'w5',
      timeLimit: 0,
      text: 'Use the provided resources and write an argumentative essay clearly arguing one side. Use details from the sources to support your argument.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      paperBoxSize: 'full',
    },
  ],
};

// A screenshot script serves the example.test PDF; the picture is inline so the print window can draw it.
const CELL_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="400" height="250" fill="#fff"/><ellipse cx="200" cy="125" rx="170" ry="105" fill="#eef5e8" stroke="#000" stroke-width="3"/><circle cx="200" cy="125" r="40" fill="#c9cdf0" stroke="#000" stroke-width="2"/><text x="200" y="130" font-family="Arial" font-size="14" text-anchor="middle">nucleus</text><text x="40" y="20" font-family="Arial" font-size="14">cell membrane</text></svg>'
)}`;
const STIMULI_QUIZ: QuizData = {
  ...QUIZ,
  title: 'Cells reading check',
  stimuli: [
    {
      id: 'st-passage',
      type: 'text',
      url: '',
      label: 'Cell passage',
      tabLabel: 'The Cell',
      text: "Every living thing is made of cells. A cell is the smallest unit of life.\n\nPlant cells have a cell wall and chloroplasts. Animal cells do not. Both have a nucleus, which holds the cell's DNA.",
    },
    {
      id: 'st-bank',
      type: 'word-bank',
      url: '',
      label: '',
      text: 'nucleus\nribosome\nvacuole\nchloroplast\n\ncell wall\nmembrane',
      wordBankColumns: 3,
    },
    {
      id: 'st-diagram',
      type: 'image',
      url: CELL_SVG,
      label: 'Cell diagram',
    },
    {
      id: 'st-inline',
      type: 'image',
      url: CELL_SVG,
      label: '',
      placement: 'inline',
    },
    {
      id: 'st-article',
      type: 'pdf',
      url: 'https://example.test/article.pdf',
      label: 'Article',
      tabLabel: 'Article',
    },
    {
      id: 'st-video',
      type: 'youtube',
      url: 'https://www.youtube.com/watch?v=URUJD5NEXC8',
      label: '',
    },
    {
      id: 'st-note',
      type: 'text',
      url: '',
      label: 'Lab note',
      text: 'Use the microscope on low power first.',
      paperPlacement: 'question',
    },
    {
      id: 'st-doc',
      type: 'gdoc-embed',
      url: 'https://docs.google.com/document/d/1AbCdEfGhIjK/edit',
      label: '',
    },
  ],
  questions: (
    [
      ['What is the smallest unit of life?', []],
      ['Which part holds the DNA?', ['st-passage']],
      ['Which cells have a cell wall?', ['st-passage']],
      [
        'Which word names the green part of a plant cell?',
        ['st-passage', 'st-bank'],
      ],
      ['Which label points to the nucleus?', ['st-diagram']],
      ['What does this picture show?', ['st-inline']],
      ['What is the main idea of the article?', ['st-article']],
      ['Where do animal cells get energy?', ['st-article', 'st-video']],
      ['Which lab step comes first?', ['st-doc', 'st-note']],
      ['Which tool do you use to see cells?', ['st-note']],
    ] as const
  ).map(([text, ids], i) => ({
    id: `s${i + 1}`,
    timeLimit: 0,
    text,
    type: 'MC' as const,
    correctAnswer: 'Nucleus',
    incorrectAnswers: ['Ribosome', 'Vacuole', 'Cell wall'],
    stimulusIds: [...ids],
  })),
};

// Paul's report: one full-page essay question using a text stimulus.
const ESSAY_TEXT_QUIZ: QuizData = {
  ...QUIZ,
  title: 'Sample quiz with stimuli',
  stimuli: [
    {
      id: 'st-frames',
      type: 'text',
      url: '',
      label: 'Passage',
      tabLabel: 'Sentence Frames',
      text: "Claim Frames\nThe claim is the first sentence in your body paragraph. As you write, consider using one of the three options below:\n\nOption 1: Through the interweaving of [specific plot events], [character developments], and [literary devices], [author] crafts a compelling exploration of [theme].\n\nOption 2: The theme of [theme] emerges most powerfully through [author's] strategic use of [specific literary elements].",
      readAloudSource: 'text',
    },
  ],
  questions: [
    {
      id: 'e1',
      timeLimit: 0,
      text: 'Use one of the provided sentence frames to write your response.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      stimulusIds: ['st-frames'],
      paperBoxSize: 'full',
    },
  ],
};

// MC questions plus a written answer with a text stimulus, for the print preview.
const PREVIEW_QUIZ: QuizData = {
  ...ESSAY_TEXT_QUIZ,
  title: 'Cells unit test',
  questions: [
    ...[
      [
        'Which part of the cell holds its DNA?',
        'Nucleus',
        ['Ribosome', 'Vacuole', 'Cell wall'],
      ],
      [
        'Which part makes proteins?',
        'Ribosome',
        ['Nucleus', 'Vacuole', 'Chloroplast'],
      ],
      [
        'Which structure do plant cells have that animal cells do not?',
        'Cell wall',
        ['Nucleus', 'Membrane', 'Ribosome'],
      ],
      [
        'Where does photosynthesis happen?',
        'Chloroplast',
        ['Mitochondria', 'Nucleus', 'Vacuole'],
      ],
    ].map(([text, correct, wrong], i) => ({
      id: `p${i + 1}`,
      timeLimit: 0,
      text: text as string,
      type: 'MC' as const,
      correctAnswer: correct as string,
      incorrectAnswers: wrong as string[],
    })),
    { ...ESSAY_TEXT_QUIZ.questions[0], paperBoxSize: 'full' as const },
  ],
};

// ?drive=0 shows the no-Drive hint; ?uploads=fail makes every upload fail.
const PaperImport: React.FC = () => {
  const { canAccessFeature } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const failUploads = params.get('uploads') === 'fail';
  return (
    <PaperImportModal
      quiz={QUIZ}
      uid="mock-user-id"
      batches={[BATCH]}
      rosters={ROSTERS}
      assignments={[PAPER]}
      lockedAssignmentId="qa-paper"
      onCreateAssignment={() => Promise.resolve('qa-paper')}
      onImport={(_batchId, _assignmentId, sheets) =>
        Promise.resolve({ written: sheets.map((s) => s.seat), collisions: [] })
      }
      onUploadCrop={(path, blob) => {
        // Lets a screenshot script measure what would upload.
        window.dispatchEvent(
          new CustomEvent('paper-test-upload', {
            detail: { path, size: blob.size, type: blob.type },
          })
        );
        return new Promise((resolve, reject) =>
          window.setTimeout(
            failUploads ? () => reject(new Error('mockup')) : resolve,
            300
          )
        );
      }}
      canKeepPages={canAccessFeature('paper-kept-pages')}
      driveConnected={params.get('drive') !== '0'}
      onSaveQuiz={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  );
};

const GROUP_SEATS: Record<number, PaperBatch['seats']> = {
  1: {
    1: { rosterId: 'r1', studentId: 'r1-s1' },
    2: { rosterId: 'r1', studentId: 'r1-s4' },
    3: { rosterId: 'r2', studentId: 'r2-s2' },
  },
  2: {
    1: { rosterId: 'r1', studentId: 'r1-s6' },
    2: { rosterId: 'r2', studentId: 'r2-s3' },
  },
};

// Matching, ordering and choose all beside multiple choice, for the grouped bubble rows.
const GROUPS_QUIZ: QuizData = {
  id: 'groups-quiz',
  title: 'Cells unit test',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'g1',
      timeLimit: 0,
      text: 'Which organelle makes proteins?',
      type: 'MC',
      correctAnswer: 'Ribosome',
      incorrectAnswers: ['Vacuole', 'Nucleus', 'Cell wall'],
    },
    {
      id: 'g2',
      timeLimit: 0,
      text: 'Which of these are found in plant cells?',
      type: 'MA',
      correctAnswer: 'Cell wall|Chloroplast|Vacuole',
      incorrectAnswers: ['Centriole', 'Cilia'],
    },
    {
      id: 'g3',
      timeLimit: 0,
      text: 'Match each organelle to its job.',
      type: 'Matching',
      correctAnswer:
        'Mitochondria:Releases energy|Nucleus:Holds the DNA|Ribosome:Makes proteins|Cell membrane:Controls what enters the cell',
      incorrectAnswers: [],
      matchingDistractors: ['Stores water', 'Makes food from light'],
    },
    {
      id: 'g4',
      timeLimit: 0,
      text: 'Put the steps of mitosis in order.',
      type: 'Ordering',
      correctAnswer: 'Prophase|Metaphase|Anaphase|Telophase',
      incorrectAnswers: [],
    },
  ],
};

const VIEWS = {
  // Needs the paper-print-preview flag (admins have it).
  groups: () => (
    <PaperPrintModal
      quiz={GROUPS_QUIZ}
      rosters={ROSTERS}
      assign={{
        plcs: [],
        initialSharing: { plcMode: false, plcId: '' },
        onCreateAssignment: () => Promise.resolve(),
      }}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  library: () => <Manager tab="library" assignments={IN_PROGRESS} />,
  assign: () => <PaperAssign />,
  'assign-written': () => (
    <PaperPrintModal
      quiz={WRITTEN_QUIZ}
      rosters={ROSTERS}
      assign={{
        plcs: [],
        initialSharing: { plcMode: false, plcId: '' },
        onCreateAssignment: () => Promise.resolve(),
      }}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  'printed-group': () => (
    <PaperPrintModal
      quiz={printedGroupQuiz(ASSIGN_QUIZ, {
        answerChoices: 'two',
        modifiedQuestions: true,
      })}
      group={{
        label: 'Group 1',
        students: { r1: ['r1-s0', 'r1-s3'], r2: ['r2-s5'] },
        supports: [{ title: 'Word bank', body: 'nucleus, ribosome' }],
      }}
      rosters={ROSTERS}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  // One essay question in a group print: no choice count, a sized box.
  'printed-group-essay': () => (
    <PaperPrintModal
      quiz={{
        ...QUIZ,
        title: 'Hamlet Essay',
        questions: [{ ...WRITTEN_QUIZ.questions[4], paperBoxSize: 8 }],
      }}
      group={{
        label: 'Group 1',
        students: { r1: ['r1-s0', 'r1-s3'] },
        supports: [],
      }}
      rosters={ROSTERS}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  'printed-translated': () => (
    <PaperPrintModal
      quiz={ASSIGN_QUIZ}
      group={{
        label: 'Group 2 · Spanish',
        students: { r1: ['r1-s1', 'r1-s2'] },
        supports: [],
        translation: {
          title: 'Unidad 3: La célula',
          questions: Object.fromEntries(
            ASSIGN_QUIZ.questions.map((q, i) => [
              q.id,
              {
                text: `Pregunta ${i + 1}: ¿Qué parte de la célula guarda el ADN?`,
                choices: {
                  Nucleus: 'Núcleo',
                  Ribosome: 'Ribosoma',
                  Vacuole: 'Vacuola',
                  'Cell wall': 'Pared celular',
                },
              },
            ])
          ),
        },
      }}
      rosters={ROSTERS}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  stimuli: () => (
    <PaperPrintModal
      quiz={STIMULI_QUIZ}
      rosters={ROSTERS}
      assign={{
        plcs: [],
        initialSharing: { plcMode: false, plcId: '' },
        onCreateAssignment: () => Promise.resolve(),
      }}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  'essay-text': () => {
    const params = new URLSearchParams(window.location.search);
    const placement = params.get('place');
    // ?stim=pdf swaps the text for a PDF the screenshot script serves.
    const asPdf = params.get('stim') === 'pdf';
    // ?long=1 repeats the text so it overflows a shared page.
    const long = params.get('long') === '1';
    return (
      <PaperPrintModal
        quiz={{
          ...ESSAY_TEXT_QUIZ,
          stimuli: ESSAY_TEXT_QUIZ.stimuli?.map((s) => {
            const st: QuizStimulus = asPdf
              ? {
                  id: s.id,
                  type: 'pdf',
                  url: 'https://example.test/frames.pdf',
                  label: 'Claim Frames.pdf',
                }
              : long
                ? { ...s, text: Array(6).fill(s.text).join('\n\n') }
                : s;
            return placement === 'question' || placement === 'resource'
              ? { ...st, paperPlacement: placement }
              : st;
          }),
        }}
        rosters={ROSTERS}
        assign={{
          plcs: [],
          initialSharing: { plcMode: false, plcId: '' },
          onCreateAssignment: () => Promise.resolve(),
        }}
        onSaveBatch={() => Promise.resolve()}
        onClose={noop}
        onError={noop}
      />
    );
  },
  // Needs the paper-print-preview flag (admins have it).
  preview: () => (
    <PaperPrintModal
      quiz={PREVIEW_QUIZ}
      rosters={ROSTERS}
      assign={{
        plcs: [],
        initialSharing: { plcMode: false, plcId: '' },
        onCreateAssignment: () => Promise.resolve(),
      }}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  // Needs the paper-print-preview flag (admins have it).
  bank: () => (
    <PaperPrintModal
      quiz={BANK_QUIZ}
      resolved={BANK_RESOLVED}
      rosters={ROSTERS}
      assign={{
        plcs: [],
        initialSharing: { plcMode: false, plcId: '' },
        onCreateAssignment: () => Promise.resolve(),
      }}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  'printed-bank': () => {
    const group = { answerChoices: 'two' as const, modifiedQuestions: true };
    return (
      <PaperPrintModal
        quiz={printedGroupQuiz(BANK_QUIZ, group)}
        resolved={printedGroupResolved(BANK_RESOLVED, BANK_QUIZ, group)}
        group={{
          label: 'Group 1',
          students: { r1: ['r1-s0', 'r1-s3'] },
        }}
        rosters={ROSTERS}
        onSaveBatch={() => Promise.resolve()}
        onClose={noop}
        onError={noop}
      />
    );
  },
  'printed-stimuli': () => (
    <PaperPrintModal
      quiz={printedGroupQuiz(STIMULI_QUIZ, {
        answerChoices: 'two',
        modifiedQuestions: true,
      })}
      group={{
        label: 'Group 1',
        students: { r1: ['r1-s0', 'r1-s3'] },
        supports: [{ title: 'Word bank', body: 'nucleus, ribosome' }],
      }}
      rosters={ROSTERS}
      onSaveBatch={() => Promise.resolve()}
      onClose={noop}
      onError={noop}
    />
  ),
  'in-progress': () => <Manager tab="active" assignments={IN_PROGRESS} />,
  copies: () => <Manager tab="active" assignments={WITH_COPIES} />,
  'group-reprint': () => (
    <PaperGroupReprintModal
      groups={[1, 2].map((n) => ({
        label: `Group ${n}`,
        quiz: printedGroupQuiz(
          { ...ASSIGN_QUIZ, questions: ASSIGN_QUIZ.questions.slice(0, 2) },
          { answerChoices: n === 1 ? 'two' : 'drop-one' }
        ),
        batch: {
          ...BATCH,
          id: `batch-g${n}`,
          questionCount: 2,
          seats: GROUP_SEATS[n],
          spareSeats: [],
          printedGroup: {
            number: n,
            answerChoices: n === 1 ? 'two' : 'drop-one',
          },
        },
      }))}
      rosters={ROSTERS}
      onClose={noop}
      onError={noop}
    />
  ),
  import: () => <PaperImport />,
  completed: () => <Manager tab="archive" assignments={COMPLETED} />,
  reprint: () => (
    <PaperReprintModal
      quiz={{ ...ASSIGN_QUIZ, questions: ASSIGN_QUIZ.questions.slice(0, 2) }}
      batch={{
        ...BATCH,
        questionCount: 2,
        choiceOrder: {
          q1: ['Nucleus', 'Ribosome', 'Vacuole', 'Cell wall'],
          q2: ['Ribosome', 'Nucleus', 'Cell wall', 'Vacuole'],
        },
      }}
      rosters={ROSTERS}
      onClose={noop}
      onError={noop}
    />
  ),
  'student-copy-menu': () => <StudentCopyMenu />,
  'student-copy': () => {
    const pick = studentCopyPick(
      { rosterId: 'r1', studentId: 'r1-s1' },
      {
        hiddenOptionIdsByQuestion: { q1: ['Vacuole'], q2: ['Cell wall'] },
        questionIds: ASSIGN_QUIZ.questions.slice(0, 12).map((q) => q.id),
        supports: [{ kind: 'text', title: 'Word bank', text: 'nucleus' }],
      }
    );
    const group = printedGroupForPrint(pick);
    return (
      <PaperPrintModal
        quiz={printedGroupQuiz(ASSIGN_QUIZ, pick.group, pick)}
        group={{
          ...group,
          label: 'Garcia, Jordan',
          ...(pick.questionIds ? { servedQuestionIds: pick.questionIds } : {}),
        }}
        rosters={ROSTERS}
        onSaveBatch={() => Promise.resolve()}
        onClose={noop}
        onError={noop}
      />
    );
  },
} as const;
type View = keyof typeof VIEWS;

const monitorRow = (
  key: string,
  name: string,
  status: QuizResponse['status']
): MonitorStudent => ({
  response: {
    studentUid: key,
    _responseKey: key,
    answers: [],
    status,
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse,
  key,
  name,
  bandScore: null,
  displayScore: null,
  awaitingGrade: false,
  band: null,
  tabWarnings: 0,
  hand: null,
  idle: null,
  duplicate: false,
  onQuestion: 3,
});

// The live monitor's In progress roster, with the row menu's Print paper copy.
const StudentCopyMenu: React.FC = () => {
  const rows = ['Jordan Larson', 'Avery Nguyen', 'Priya Patel'].map((n, i) =>
    monitorRow(`uid-${i}`, n, 'in-progress')
  );
  return (
    <div className="h-full overflow-y-auto p-3">
      <RosterList
        bucket="inProgress"
        students={rows}
        session={
          {
            id: 'qa-0',
            quizId: 'quiz-0',
            teacherUid: 'mock-user-id',
            classIds: [],
            attemptLimit: 1,
          } as unknown as QuizSession
        }
        config={{} as QuizConfig}
        isGamified={false}
        onUpdateConfig={noop}
        onSubmitForStudent={noop}
        onRemove={noop}
        onPrintCopy={noop}
        printCopyKeys={new Set(rows.map((r) => r.key))}
      />
    </div>
  );
};

const readView = (): View => {
  const q = new URLSearchParams(window.location.search).get('view');
  return q && q in VIEWS ? (q as View) : 'library';
};

export const PaperTestDevHarness: React.FC = () => {
  const [view] = useState<View>(readView);
  const Body = VIEWS[view];
  const dashboard = useMemo(
    () =>
      ({
        toasts: [],
        addToast: noop,
        removeToast: noop,
      }) as unknown as DashboardContextValue,
    []
  );
  return (
    <DashboardContext.Provider value={dashboard}>
      <DialogProvider>
        <AuthProvider>
          <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-100 p-6 pb-12">
            <div
              className="relative overflow-hidden rounded-2xl bg-white shadow-lg"
              style={{ width: 760, height: 520, containerType: 'size' }}
            >
              <Body />
            </div>
          </div>
          <DialogContainer />
        </AuthProvider>
      </DialogProvider>
    </DashboardContext.Provider>
  );
};
