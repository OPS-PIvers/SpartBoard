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
import { PaperReprintModal } from '@/components/widgets/QuizWidget/components/PaperReprintModal';
import type {
  ClassRoster,
  PaperBatch,
  QuizAssignment,
  QuizConfig,
  QuizData,
  QuizMetadata,
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

const VIEWS = {
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
  'in-progress': () => <Manager tab="active" assignments={IN_PROGRESS} />,
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
} as const;
type View = keyof typeof VIEWS;

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
