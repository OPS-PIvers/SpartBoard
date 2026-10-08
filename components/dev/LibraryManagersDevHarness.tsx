// Real library managers on fixture data at /library-managers-dev (dev and auth-bypass builds only), for layout checks.

import React, { useState } from 'react';
import { DialogProvider } from '@/context/DialogContext';
import { AuthProvider } from '@/context/AuthContext';
import type { UseFoldersResult } from '@/hooks/useFolders';
import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type { QuizManagerTab } from '@/components/widgets/QuizWidget/components/QuizManager';
import { VideoActivityManager } from '@/components/widgets/VideoActivityWidget/components/VideoActivityManager';
import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import { MiniAppManager } from '@/components/widgets/MiniApp/components/MiniAppManager';
import { FlashcardLibrary } from '@/components/widgets/Flashcards/FlashcardLibrary';
import { WallLibraryModal } from '@/components/widgets/ActivityWall/WallLibraryModal';
import type { LibraryTab } from '@/components/common/library/types';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import type {
  ActivityWallLibraryEntry,
  ClassRoster,
  FlashcardAssignment,
  FlashcardSet,
  LibraryFolder,
  GuidedLearningAssignment,
  GuidedLearningSetMetadata,
  MiniAppAssignment,
  MiniAppItem,
  QuestionBankMetadata,
  QuizAssignment,
  QuizConfig,
  QuizMetadata,
  VideoActivityAssignment,
  VideoActivityMetadata,
  VideoActivitySessionSettings,
} from '@/types';

const COUNT = 24;
const NOW = Date.UTC(2026, 8, 29);
const noop = (): void => undefined;
const asyncNoop = (): Promise<void> => Promise.resolve();
const range = <T,>(make: (i: number) => T): T[] =>
  Array.from({ length: COUNT }, (_, i) => make(i));

const QUIZZES: QuizMetadata[] = range((i) => ({
  id: `quiz-${i}`,
  title: `Unit ${i + 1} checkpoint`,
  driveFileId: `drive-quiz-${i}`,
  questionCount: 10 + i,
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const QUIZ_ASSIGNMENTS: QuizAssignment[] = range((i) => ({
  id: `qa-${i}`,
  quizId: `quiz-${i}`,
  quizTitle: `Unit ${i + 1} checkpoint`,
  quizDriveFileId: `drive-quiz-${i}`,
  teacherUid: 'mock-user-id',
  code: `AB${String(i).padStart(3, '0')}`,
  sessionMode: 'student',
  sessionOptions: {},
  status: i % 2 === 0 ? 'active' : 'inactive',
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const BANKS: QuestionBankMetadata[] = range((i) => ({
  id: `bank-${i}`,
  title: `Question bank ${i + 1}`,
  driveFileId: `drive-bank-${i}`,
  questionCount: 20 + i,
  targetIds: [],
  targetCounts: {},
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const QUIZ_CONFIG: QuizConfig = {
  view: 'manager',
  selectedQuizId: null,
  selectedQuizTitle: null,
  activeAssignmentId: null,
  activeLiveSessionCode: null,
  resultsSessionId: null,
};

const VA_SETTINGS: VideoActivitySessionSettings = {
  autoPlay: false,
  requireCorrectAnswer: false,
  allowSkipping: true,
};

const ACTIVITIES: VideoActivityMetadata[] = range((i) => ({
  id: `va-${i}`,
  title: `Video lesson ${i + 1}`,
  youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  driveFileId: `drive-va-${i}`,
  questionCount: 4 + i,
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const VA_ASSIGNMENTS: VideoActivityAssignment[] = range((i) => ({
  id: `vaa-${i}`,
  activityId: `va-${i}`,
  activityTitle: `Video lesson ${i + 1}`,
  activityDriveFileId: `drive-va-${i}`,
  teacherUid: 'mock-user-id',
  sessionSettings: VA_SETTINGS,
  status: i % 2 === 0 ? 'active' : 'inactive',
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const GL_SETS: GuidedLearningSetMetadata[] = range((i) => ({
  id: `gl-${i}`,
  title: `Guided tour ${i + 1}`,
  stepCount: 5 + i,
  mode: 'structured',
  imageUrl: '',
  driveFileId: `drive-gl-${i}`,
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const GL_ASSIGNMENTS: GuidedLearningAssignment[] = range((i) => ({
  id: `gla-${i}`,
  setId: `gl-${i}`,
  setTitle: `Guided tour ${i + 1}`,
  sessionId: `gls-${i}`,
  teacherUid: 'mock-user-id',
  status: i % 2 === 0 ? 'active' : 'archived',
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const MINI_APPS: MiniAppItem[] = range((i) => ({
  id: `app-${i}`,
  title: `Mini app ${i + 1}`,
  html: '<p>Hello</p>',
  createdAt: NOW - i * 3600_000,
}));

const MINI_APP_ASSIGNMENTS: MiniAppAssignment[] = range((i) => ({
  id: `maa-${i}`,
  sessionId: `mas-${i}`,
  appId: `app-${i}`,
  appTitle: `Mini app ${i + 1}`,
  assignmentName: `Mini app ${i + 1}`,
  teacherUid: 'mock-user-id',
  status: i % 2 === 0 ? 'active' : 'inactive',
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const FLASHCARD_SETS: FlashcardSet[] = range((i) => ({
  id: `fc-${i}`,
  title: `Vocabulary set ${i + 1}`,
  termLanguage: 'en',
  definitionLanguage: 'en',
  cards: range((c) => ({
    id: `c-${c}`,
    term: `t${c}`,
    definition: `d${c}`,
  })).slice(0, 8 + (i % 17)),
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const FLASHCARD_ASSIGNMENTS: FlashcardAssignment[] = range((i) => ({
  id: `fca-${i}`,
  sessionId: `fcs-${i}`,
  setId: `fc-${i}`,
  setTitle: `Vocabulary set ${i + 1}`,
  teacherUid: 'mock-user-id',
  kind: 'study',
  status: i % 2 === 0 ? 'active' : 'ended',
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

const WALLS: ActivityWallLibraryEntry[] = range((i) => ({
  id: `wall-${i}`,
  title: `Discussion wall ${i + 1}`,
  prompt: 'What did you notice?',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  createdAt: NOW - i * 3600_000,
  updatedAt: NOW - i * 3600_000,
}));

export const LIBRARY_HARNESS_VIEWS = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'flashcards',
  'activity-wall',
  'review',
] as const;
type HarnessView = (typeof LIBRARY_HARNESS_VIEWS)[number];

const ROSTERS: ClassRoster[] = [3, 4, 5].map((n) => ({
  id: `roster-${n}`,
  name: `SPANISH II A(${n})`,
  driveFileId: null,
  studentCount: 0,
  createdAt: NOW,
  students: [],
  bellPeriod: { buildingId: 'dev', periodId: String(n) },
}));

const BELLS: Record<string, [number, number]> = {
  '3': [9 * 60 + 5, 9 * 60 + 52],
  '4': [10 * 60, 10 * 60 + 47],
  '5': [11 * 60 + 40, 12 * 60 + 27],
};

const PERIOD_ACCESS: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: (roster, date) => {
    const bell = roster.bellPeriod && BELLS[roster.bellPeriod.periodId];
    if (!bell) return null;
    const at = (min: number) => {
      const d = new Date(date);
      d.setHours(0, min, 0, 0);
      return d.getTime();
    };
    return { openAt: at(bell[0]), closeAt: at(bell[1]) };
  },
  onTagRoster: noop,
};

const QuizView: React.FC<{ variant?: 'quiz' | 'review' }> = ({ variant }) => {
  const [tab, setTab] = useState<QuizManagerTab>('library');
  const [quizzes, setQuizzes] = useState(QUIZZES);
  const reorderQuizzes = (ids: string[]): void =>
    setQuizzes((prev) => prev.map((q) => ({ ...q, order: ids.indexOf(q.id) })));
  return (
    <QuizManager
      variant={variant}
      userId="mock-user-id"
      quizzes={quizzes}
      onReorderQuizzes={reorderQuizzes}
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
      periodAccess={PERIOD_ACCESS}
      config={QUIZ_CONFIG}
      managerTab={tab}
      onTabChange={setTab}
      banks={BANKS}
      banksLoading={false}
      sharedBankSources={[]}
      onNewBank={noop}
      onEditBank={noop}
      onDuplicateBank={noop}
      onDeleteBank={noop}
      assignments={QUIZ_ASSIGNMENTS}
      assignmentsLoading={false}
    />
  );
};

const VideoActivityView: React.FC = () => (
  <VideoActivityManager
    userId="mock-user-id"
    activities={ACTIVITIES}
    loading={false}
    error={null}
    onNew={noop}
    onImport={noop}
    onEdit={noop}
    onDelete={noop}
    onAssign={() => Promise.resolve('')}
    rosters={ROSTERS}
    periodAccess={PERIOD_ACCESS}
    defaultSessionSettings={VA_SETTINGS}
    assignments={VA_ASSIGNMENTS}
    assignmentsLoading={false}
  />
);

const GuidedLearningView: React.FC = () => (
  <GuidedLearningManager
    userId="mock-user-id"
    sets={GL_SETS}
    buildingSets={[]}
    assignments={GL_ASSIGNMENTS}
    loading={false}
    buildingLoading={false}
    assignmentsLoading={false}
    isDriveConnected
    isAdmin={false}
    onPlay={noop}
    onEdit={noop}
    onAssign={noop}
    loadSetForPreview={() => Promise.resolve(null)}
    onDeletePersonal={noop}
    onDeleteBuilding={noop}
    onCreateNewPersonal={noop}
    onCreateNewBuilding={noop}
    onOpenAIAuthoring={noop}
    onReorderPersonal={asyncNoop}
    recentSessionIds={{}}
    onViewResults={noop}
    onAssignmentCopyLink={noop}
    onAssignmentOpenResults={noop}
    onAssignmentArchive={noop}
    onAssignmentUnarchive={noop}
    onAssignmentDelete={noop}
  />
);

const MiniAppView: React.FC = () => {
  const [tab, setTab] = useState<LibraryTab>('library');
  return (
    <MiniAppManager
      userId="mock-user-id"
      tab={tab}
      onTabChange={setTab}
      personalLibrary={MINI_APPS}
      globalLibrary={[]}
      assignments={MINI_APP_ASSIGNMENTS}
      onCreate={noop}
      onEdit={noop}
      onDelete={noop}
      onRun={noop}
      onAssign={noop}
      onShowAssignments={noop}
      onReorder={noop}
      onSaveGlobalToLibrary={noop}
      savingGlobalId={null}
      onImport={noop}
      onExport={noop}
      onArchiveCopyUrl={noop}
      onArchiveEnd={noop}
      onArchiveDelete={noop}
    />
  );
};

const FIXTURE_FOLDERS: LibraryFolder[] = [
  {
    id: 'unit-1',
    name: 'Unit 1: Greetings',
    parentId: null,
    order: 0,
    createdAt: NOW,
  },
  {
    id: 'unit-2',
    name: 'Unit 2: School life',
    parentId: null,
    order: 1,
    createdAt: NOW,
  },
  {
    id: 'unit-2-wk1',
    name: 'Week 1',
    parentId: 'unit-2',
    order: 0,
    createdAt: NOW,
  },
  {
    id: 'unit-2-wk2',
    name: 'Week 2',
    parentId: 'unit-2',
    order: 1,
    createdAt: NOW,
  },
  {
    id: 'unit-2-wk2-quiz',
    name: 'Quiz prep',
    parentId: 'unit-2-wk2',
    order: 0,
    createdAt: NOW,
  },
  {
    id: 'review',
    name: 'Review games',
    parentId: null,
    order: 2,
    createdAt: NOW,
  },
];

const FIXTURE_FOLDER_IDS = [
  'unit-1',
  'unit-1',
  'unit-1',
  'unit-2-wk1',
  'unit-2-wk1',
  'unit-2-wk2',
  'unit-2-wk2-quiz',
  'unit-2-wk2-quiz',
  'review',
  null,
  null,
  null,
];

/** In-memory folders so the folder view can be exercised without Firestore. */
const useFixtureFolders = (
  onMoveItem: (itemId: string, folderId: string | null) => void
): UseFoldersResult => {
  const [folders, setFolders] = useState(FIXTURE_FOLDERS);
  const createFolder = (name: string, parentId: string | null) => {
    const id = `folder-${Date.now()}`;
    setFolders((prev) => [
      ...prev,
      { id, name, parentId, order: prev.length, createdAt: Date.now() },
    ]);
    return Promise.resolve(id);
  };
  return {
    folders,
    loading: false,
    error: null,
    createFolder,
    renameFolder: (folderId, nextName) => {
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name: nextName } : f))
      );
      return Promise.resolve();
    },
    moveFolder: (folderId, nextParentId) => {
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId ? { ...f, parentId: nextParentId } : f
        )
      );
      return Promise.resolve();
    },
    deleteFolder: (folderId) => {
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      return Promise.resolve();
    },
    reorderSiblings: () => Promise.resolve(),
    moveItem: (itemId, folderId) => {
      onMoveItem(itemId, folderId);
      return Promise.resolve();
    },
  };
};

const FlashcardsView: React.FC = () => {
  const [tab, setTab] = useState<LibraryTab>('library');
  const [sets, setSets] = useState(() =>
    FLASHCARD_SETS.map((set, i) => ({
      ...set,
      folderId: FIXTURE_FOLDER_IDS[i] ?? null,
    }))
  );
  const folders = useFixtureFolders((itemId, folderId) =>
    setSets((prev) =>
      prev.map((set) => (set.id === itemId ? { ...set, folderId } : set))
    )
  );
  return (
    <FlashcardLibrary
      userId="mock-user-id"
      sets={sets}
      loading={false}
      error={null}
      folders={folders}
      assignments={FLASHCARD_ASSIGNMENTS}
      assignmentsLoading={false}
      tab={tab}
      onTabChange={setTab}
      onNew={noop}
      onImport={noop}
      onEdit={noop}
      onPresent={noop}
      onShare={noop}
      onAssign={noop}
      onDelete={noop}
      onAssignmentResults={noop}
      onAssignmentPublishScores={noop}
      onAssignmentUnpublishScores={noop}
      onAssignmentCopyLink={noop}
      onAssignmentEnd={noop}
      onAssignmentReopen={noop}
      onAssignmentDelete={noop}
      onShareWithPlc={noop}
      onAssignmentShareWithPlc={noop}
      onAssignmentStopSharingWithPlc={noop}
    />
  );
};

const ActivityWallView: React.FC = () => (
  <WallLibraryModal
    open
    onClose={noop}
    uid="mock-user-id"
    entries={WALLS}
    activeEntryId={null}
    readOnly={false}
    onOpenOnBoard={noop}
    onCreate={noop}
    onEdit={noop}
    onDuplicate={asyncNoop}
    onDelete={asyncNoop}
    addToast={noop}
    confirm={() => Promise.resolve(false)}
  />
);

const ReviewView: React.FC = () => <QuizView variant="review" />;

const VIEW_COMPONENTS: Record<HarnessView, React.FC> = {
  quiz: QuizView,
  'video-activity': VideoActivityView,
  'guided-learning': GuidedLearningView,
  'mini-app': MiniAppView,
  flashcards: FlashcardsView,
  'activity-wall': ActivityWallView,
  review: ReviewView,
};

const readView = (): HarnessView => {
  const requested = new URLSearchParams(window.location.search).get('view');
  return (LIBRARY_HARNESS_VIEWS as readonly string[]).includes(requested ?? '')
    ? (requested as HarnessView)
    : 'quiz';
};

export const LibraryManagersDevHarness: React.FC = () => {
  const [view, setView] = useState<HarnessView>(readView);
  const View = VIEW_COMPONENTS[view];
  return (
    <DialogProvider>
      <AuthProvider>
        <div className="flex min-h-screen flex-col items-start gap-4 bg-slate-100 p-6">
          <select
            aria-label="Library"
            value={view}
            onChange={(e) => setView(e.target.value as HarnessView)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {LIBRARY_HARNESS_VIEWS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <div
            data-testid="library-harness-widget"
            className="relative overflow-hidden rounded-2xl bg-white shadow-lg"
            style={{ width: 960, height: 560, containerType: 'size' }}
          >
            <View key={view} />
          </div>
        </div>
      </AuthProvider>
    </DialogProvider>
  );
};
