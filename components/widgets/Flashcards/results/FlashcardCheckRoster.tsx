import React from 'react';
import { Hand } from 'lucide-react';
import type { FlashcardSession } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { BucketKey } from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import { proficiencyBand } from '@/components/widgets/QuizWidget/components/monitor/monitorUtils';
import {
  BAND_TINT,
  type MonitorRosterPrefs,
} from '@/components/widgets/QuizWidget/components/monitor/rosterStyles';
import {
  RosterOnQuestion,
  RosterRow,
  RosterRowMenu,
  RosterScorePill,
  RosterToolbar,
} from '@/components/widgets/QuizWidget/components/monitor/RosterParts';
import {
  FLASHCARD_TOOLBAR_ANCHORS,
  flashcardMenuItems,
  orderFlashcardRoster,
  type FlashcardRosterStudent,
} from './flashcardRoster';

const emptyLine = (message: string) => (
  <p
    className="text-brand-gray-primary text-center"
    style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
  >
    {message}
  </p>
);

/** A Check assignment's student list on the Quiz monitor's roster pieces. */
export const FlashcardCheckRoster: React.FC<{
  bucket: BucketKey;
  students: FlashcardRosterStudent[];
  session: FlashcardSession;
  nameFor: (studentUid: string) => string;
  prefs: MonitorRosterPrefs;
  onUpdatePrefs: (updates: Partial<MonitorRosterPrefs>) => void;
  letInFor: (studentUid: string) => (() => void) | undefined;
  onRemove: (studentUid: string) => void;
  /** Unlock results for a student locked out of them; undefined hides the item. */
  unlockFor?: (studentUid: string) => (() => void) | undefined;
  unlockAttemptFor?: (studentUid: string) => (() => void) | undefined;
  /** Lowers a raised hand; undefined hides Clear. */
  onClearHand?: (studentUid: string) => void;
  /** Flagged answers a student has, so anchor numbering is worked out up front. */
  belowCount: (studentUid: string) => number;
  renderBelow: (studentUid: string, firstIndex: number) => React.ReactNode;
}> = ({
  bucket,
  students,
  session,
  nameFor,
  prefs,
  onUpdatePrefs,
  letInFor,
  onRemove,
  unlockFor,
  unlockAttemptFor,
  onClearHand,
  belowCount,
  renderBelow,
}) => {
  const showToolbar = bucket !== 'notStarted';
  const showScores = (prefs.monitorShowScores ?? false) && bucket === 'done';
  const showProf = (prefs.monitorShowProficiency ?? false) && bucket === 'done';
  const rows = orderFlashcardRoster(students, nameFor, prefs, showToolbar);
  const testCount = session.lockedSettings?.testCount;
  const total =
    session.checkMode === 'test' && typeof testCount === 'number'
      ? Math.min(testCount, session.cards.length)
      : session.cards.length;
  const firstBelow = rows.reduce<number[]>(
    (starts, s, i) => [
      ...starts,
      i === 0 ? 0 : starts[i - 1] + belowCount(rows[i - 1].studentUid),
    ],
    []
  );
  return (
    <div
      className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {showToolbar && (
        <RosterToolbar
          bucket={bucket}
          prefs={prefs}
          onUpdate={onUpdatePrefs}
          tabWarningsAllowed={false}
          tabsFilter={false}
          anchors={FLASHCARD_TOOLBAR_ANCHORS}
        />
      )}
      {rows.length === 0 &&
        emptyLine(
          students.length === 0
            ? 'No students here yet.'
            : 'No students match this filter.'
        )}
      {rows.map((s, rowIndex) => {
        const name = nameFor(s.studentUid);
        const field = `row-${rowIndex + 1}`;
        const rounded = s.score === null ? null : Math.round(s.score);
        const band =
          showProf && rounded !== null ? proficiencyBand(rounded) : null;
        return (
          <RosterRow
            key={s.studentUid}
            name={name}
            tint={band ? BAND_TINT[band] : 'bg-white'}
            rowAttrs={tourFieldAttr(
              'flashcards.score-row',
              'flashcards',
              field
            )}
            below={renderBelow(s.studentUid, firstBelow[rowIndex])}
          >
            {s.hand && (
              <span
                className="inline-flex shrink-0 items-center font-sans font-semibold text-brand-blue-dark"
                style={{
                  gap: 'min(4px, 1cqmin)',
                  fontSize: 'min(11px, 3.8cqmin)',
                }}
              >
                <Hand
                  aria-label="Raised hand"
                  className="text-brand-blue-primary"
                  style={{
                    width: 'min(14px, 4.5cqmin)',
                    height: 'min(14px, 4.5cqmin)',
                  }}
                />
                {onClearHand && (
                  <button
                    type="button"
                    onClick={() => onClearHand(s.studentUid)}
                    {...tourFieldAttr(
                      'flashcards.clear-hand',
                      'flashcards',
                      field
                    )}
                    className="rounded-md border border-brand-blue-primary font-sans font-medium text-brand-blue-primary transition-colors hover:bg-brand-blue-primary hover:text-white"
                    style={{
                      padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                      fontSize: 'min(11px, 3.8cqmin)',
                    }}
                  >
                    Clear
                  </button>
                )}
              </span>
            )}
            {bucket === 'inProgress' && total > 0 && (
              <RosterOnQuestion
                index={Math.min(
                  s.cardsDone + 1,
                  Math.min(total, s.cardTotal ?? total)
                )}
              />
            )}
            {showScores && <RosterScorePill score={rounded} suffix="%" />}
            <RosterRowMenu
              ariaLabel={`Actions for ${name}`}
              triggerAnchor={tourFieldAttr(
                'flashcards.student-actions',
                'flashcards',
                field
              )}
              items={flashcardMenuItems(
                letInFor(s.studentUid),
                () => onRemove(s.studentUid),
                unlockFor?.(s.studentUid),
                unlockAttemptFor?.(s.studentUid)
              )}
            />
          </RosterRow>
        );
      })}
    </div>
  );
};
