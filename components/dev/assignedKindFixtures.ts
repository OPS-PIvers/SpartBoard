// Fixture rows for the Flashcards and Writing Assigned tabs in /library-managers-dev (dev only).
import type {
  FlashcardAssignment,
  PeriodAccess,
  WritingAssignmentRecord,
  WritingAssignmentSession,
} from '@/types';
import type { AssignedResponse } from '@/utils/assignedStatus';
import { flashcardAssignedResponse } from '@/utils/assignedAdapters';
import type { WritingClassCounts } from '@/components/widgets/Writing/components/writingAssignedFixture';
import { ASSIGNED_ROSTERS } from './assignedTabFixtures';

const now = Date.now();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const KEYS = ASSIGNED_ROSTERS.map((r) => r.id);
const LABELS = ASSIGNED_ROSTERS.map((r) => r.name);

const row = (i: number, over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: LABELS[i],
  rosterId: KEYS[i],
  ...over,
});
const rows = (make: (i: number) => Partial<PeriodAccess>) =>
  Object.fromEntries(KEYS.map((k, i) => [k, row(i, make(i))]));
const closed = { closedAt: now - 2 * DAY };

const fc = (
  id: string,
  title: string,
  over: Partial<FlashcardAssignment>
): FlashcardAssignment => ({
  id,
  sessionId: id,
  setId: `set-${id}`,
  setTitle: title,
  teacherUid: 'mock-user-id',
  kind: 'check',
  checkMode: 'test',
  status: 'active',
  createdAt: now - DAY,
  updatedAt: now - DAY,
  rosterIds: KEYS,
  classIds: KEYS,
  ...over,
});

export const FLASHCARD_ASSIGNED_FIXTURES: FlashcardAssignment[] = [
  fc('verbs', 'Spanish Verbs Check', {
    periodAccess: rows((i) =>
      i === 0 ? closed : i === 1 ? { state: 'open', openedAt: now - DAY } : {}
    ),
  }),
  fc('vocab', 'Unit 4 Vocabulary', {
    kind: 'study',
    checkMode: undefined,
    periodAccess: rows((i) => (i === 2 ? { state: 'open' } : {})),
  }),
  fc('new', 'Food and Drink Check', {
    createdAt: now - MIN,
    periodAccess: rows(() => ({})),
  }),
  fc('single', 'Greetings Practice', {
    kind: 'study',
    checkMode: undefined,
    rosterIds: [KEYS[1]],
    classIds: [KEYS[1]],
  }),
  fc('weather', 'Weather Words Check', {
    status: 'ended',
    createdAt: now - 5 * DAY,
    periodAccess: rows(() => closed),
  }),
  fc('numbers', 'Numbers 1-100 Check', {
    status: 'ended',
    createdAt: now - 9 * DAY,
    scoreVisibility: 'score-only',
    periodAccess: rows(() => closed),
  }),
];

const progress = (classId: string, count: number, submitted: number) =>
  Array.from({ length: count }, (_, n) =>
    flashcardAssignedResponse({
      classId,
      submittedAt: n < submitted ? now - 5 * MIN : undefined,
    })
  );

export const FLASHCARD_ASSIGNED_RESPONSES: Record<string, AssignedResponse[]> =
  {
    verbs: [...progress(KEYS[0], 27, 25), ...progress(KEYS[1], 22, 14)],
    vocab: progress(KEYS[2], 18, 0),
    new: [],
    single: progress(KEYS[1], 9, 0),
    weather: KEYS.flatMap((k) => progress(k, 26, 26)),
    numbers: [],
  };

const wr = (
  id: string,
  title: string,
  over: Partial<WritingAssignmentRecord>
): WritingAssignmentRecord => ({
  id,
  sessionId: id,
  itemId: `item-${id}`,
  title,
  teacherUid: 'mock-user-id',
  status: 'active',
  createdAt: now - DAY,
  updatedAt: now - DAY,
  rosterIds: KEYS,
  classIds: KEYS,
  ...over,
});

export const WRITING_ASSIGNED_FIXTURES: WritingAssignmentRecord[] = [
  wr('narrative', 'Personal Narrative', {
    periodAccess: rows((i) =>
      i === 1 ? { state: 'open', openedAt: now - DAY } : {}
    ),
  }),
  wr('argument', 'Argument Essay: School Start Times', {
    status: 'ended',
    createdAt: now - 3 * DAY,
    periodAccess: rows(() => closed),
  }),
  wr('journal', 'Daily Journal', {
    rosterIds: [KEYS[0]],
    classIds: [KEYS[0]],
  }),
  wr('poem', 'Found Poem', {
    status: 'ended',
    createdAt: now - 6 * DAY,
    periodAccess: rows(() => closed),
  }),
];

const counts = (turnedIn: number, returned: number): WritingClassCounts => ({
  turnedIn,
  returned,
});

export const WRITING_ASSIGNED_COUNTS: Record<
  string,
  Record<string, WritingClassCounts>
> = {
  narrative: {
    [KEYS[0]]: counts(0, 0),
    [KEYS[1]]: counts(9, 0),
    [KEYS[2]]: counts(0, 0),
  },
  argument: Object.fromEntries(KEYS.map((k) => [k, counts(6, 20)])),
  journal: { '': counts(0, 0) },
  poem: Object.fromEntries(KEYS.map((k) => [k, counts(0, 25)])),
};

export const WRITING_ASSIGNED_GRADING: Record<
  string,
  Pick<WritingAssignmentSession, 'grading'>
> = {
  narrative: { grading: { mode: 'points', points: 10 } },
  argument: { grading: { mode: 'points', points: 20 } },
  journal: { grading: { mode: 'ungraded' } },
  poem: { grading: { mode: 'ungraded' } },
};
