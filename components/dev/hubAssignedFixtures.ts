// Fixture docs for the Assignments hub in /library-managers-dev?view=assignments-hub (dev only).
import type {
  FlashcardAssignment,
  GuidedLearningAssignment,
  MiniAppAssignment,
  PeriodAccess,
  VideoActivityAssignment,
  WritingAssignmentRecord,
} from '@/types';
import type { UnifiedAssignmentSources } from '@/components/assignmentsHub/useUnifiedAssignments';
import {
  ASSIGNED_FIXTURES,
  ASSIGNED_ROSTERS,
  ASSIGNED_QUIZZES,
  loadAssignedQuiz,
} from './assignedTabFixtures';

const now = Date.now();
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const noop = () => Promise.resolve();
const KEYS = ASSIGNED_ROSTERS.map((r) => r.id);

const access = (i: number, over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: ASSIGNED_ROSTERS[i].name,
  rosterId: KEYS[i],
  ...over,
});

const common = {
  teacherUid: 'mock-user-id',
  createdAt: now - 2 * HOUR,
  updatedAt: now - 2 * HOUR,
  rosterIds: KEYS,
};

const va = [
  {
    ...common,
    id: 'va-volcano',
    activityId: 'a1',
    activityTitle: 'How Volcanoes Form',
    activityDriveFileId: 'd1',
    status: 'paused',
    rosterIds: [KEYS[1]],
  },
] as unknown as VideoActivityAssignment[];

const gl = [
  {
    ...common,
    id: 'gl-cell',
    sessionId: 'gl-cell',
    setId: 's1',
    setTitle: 'Parts of a Plant Cell',
    status: 'active',
    periodAccess: Object.fromEntries(
      KEYS.map((k, i) => [
        k,
        access(i, i === 0 ? { state: 'open' } : { closedAt: now - DAY }),
      ])
    ),
  },
] as unknown as GuidedLearningAssignment[];

const miniApp = [
  {
    ...common,
    id: 'ma-sort',
    sessionId: 'ma-sort-session',
    appId: 'app1',
    appTitle: 'Rock Cycle Sort',
    status: 'active',
    createdAt: now - 3 * DAY,
    periodAccess: Object.fromEntries(KEYS.map((k, i) => [k, access(i, {})])),
  },
] as unknown as MiniAppAssignment[];

const flashcards = [
  {
    ...common,
    id: 'fc-verbs',
    sessionId: 'fc-verbs',
    setId: 'set1',
    setTitle: 'Spanish Verbs',
    kind: 'study',
    status: 'active',
    rosterIds: [KEYS[2]],
  },
] as unknown as FlashcardAssignment[];

const writing = [
  {
    ...common,
    id: 'w-essay',
    sessionId: 'w-essay',
    itemId: 'i1',
    title: 'Argument Essay',
    status: 'ended',
    createdAt: now - 20 * DAY,
  },
] as unknown as WritingAssignmentRecord[];

const listResult = <T>(assignments: T[]) => ({
  assignments,
  loading: false,
  error: null,
  pauseAssignment: noop,
  resumeAssignment: noop,
  deactivateAssignment: noop,
  reactivateAssignment: noop,
  reopenAssignment: noop,
  endAssignment: noop,
  archiveAssignment: noop,
  shareAssignmentWithPlc: noop,
  stopSharingAssignmentWithPlc: noop,
});

export const HUB_FIXTURE = {
  sources: {
    quiz: listResult(ASSIGNED_FIXTURES),
    videoActivity: listResult(va),
    guidedLearning: listResult(gl),
    miniApp: listResult(miniApp),
    flashcards: listResult(flashcards),
    writing: { records: writing, loading: false },
  } as unknown as UnifiedAssignmentSources,
  quizzes: ASSIGNED_QUIZZES,
  loadQuizData: (driveFileId: string) => {
    const meta = ASSIGNED_QUIZZES.find((q) => q.driveFileId === driveFileId);
    return meta
      ? loadAssignedQuiz(meta)
      : Promise.reject(new Error('No fixture quiz'));
  },
};
