// Flashcards monitor helpers on top of the Quiz monitor's roster pieces.
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import type { BucketKey } from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import { orderRoster } from '@/components/widgets/QuizWidget/components/monitor/monitorUtils';
import type { MonitorRosterPrefs } from '@/components/widgets/QuizWidget/components/monitor/rosterStyles';
import type {
  RosterMenuItem,
  RosterToolbarAnchors,
} from '@/components/widgets/QuizWidget/components/monitor/RosterParts';

export const cardLabel = (index: number): string => `Card ${index + 1}`;

export const FLASHCARD_TOOLBAR_ANCHORS: RosterToolbarAnchors = {
  scores: tourTypeAttr('flashcards.roster-scores', 'flashcards'),
  proficiency: tourTypeAttr('flashcards.roster-proficiency', 'flashcards'),
  sort: tourTypeAttr('flashcards.roster-sort', 'flashcards'),
  filter: tourTypeAttr('flashcards.roster-filter', 'flashcards'),
};

const BUCKET_STATUS = {
  notStarted: 'joined',
  inProgress: 'in-progress',
  done: 'completed',
} as const;

export interface FlashcardRosterStudent {
  studentUid: string;
  bucket: BucketKey;
  /** Percent once submitted (Check) or mastered percent (study); null without one. */
  score: number | null;
  /** Cards finished so far, for "Q3" in the In progress list. */
  cardsDone: number;
  /** Flagged answers waiting for Accept or Dismiss. */
  openFlags?: number;
  /** A raised hand while working. */
  hand?: boolean;
}

/** Sorts and filters by the toolbar, as the Quiz monitor does; flagged students lead the name sort. */
export const orderFlashcardRoster = <T extends FlashcardRosterStudent>(
  students: readonly T[],
  nameFor: (studentUid: string) => string,
  prefs: MonitorRosterPrefs,
  applyToolbar: boolean
): T[] => {
  const sortBy = applyToolbar ? (prefs.monitorSortBy ?? 'first') : 'first';
  // Flashcards never tracks tab switches, so a stored "tabs" filter shows everyone.
  const filterBy =
    prefs.monitorFilterBy === 'tabs' ? 'all' : (prefs.monitorFilterBy ?? 'all');
  const ordered = orderRoster(
    students,
    (s) => ({
      name: nameFor(s.studentUid),
      status: BUCKET_STATUS[s.bucket],
      score: s.score === null ? null : Math.round(s.score),
      tabWarnings: 0,
    }),
    sortBy,
    filterBy,
    applyToolbar
  );
  return sortBy === 'first'
    ? ordered.sort((a, b) => (b.openFlags ?? 0) - (a.openFlags ?? 0))
    : ordered;
};

/** Let in now, Unlock attempt, Unlock results and Remove student, as in the Quiz monitor's student menu. */
export const flashcardMenuItems = (
  letIn: (() => void) | undefined,
  onRemove: () => void,
  unlockResults?: () => void,
  unlockAttempt?: () => void
): RosterMenuItem[] => [
  ...(letIn
    ? [
        {
          label: 'Let in now',
          closes: true,
          tour: tourFieldAttr(
            'flashcards.student-menu-item',
            'flashcards',
            'let-in'
          ),
          onClick: letIn,
        },
      ]
    : []),
  ...(unlockAttempt
    ? [
        {
          label: 'Unlock attempt',
          tour: tourFieldAttr(
            'flashcards.student-menu-item',
            'flashcards',
            'unlock-attempt'
          ),
          onClick: unlockAttempt,
        },
      ]
    : []),
  ...(unlockResults
    ? [
        {
          label: 'Unlock results',
          tour: tourFieldAttr(
            'flashcards.student-menu-item',
            'flashcards',
            'unlock-results'
          ),
          onClick: unlockResults,
        },
      ]
    : []),
  {
    label: 'Remove student',
    confirmLabel: 'Confirm remove',
    danger: true,
    tour: tourFieldAttr('flashcards.student-menu-item', 'flashcards', 'reset'),
    onClick: onRemove,
  },
];
