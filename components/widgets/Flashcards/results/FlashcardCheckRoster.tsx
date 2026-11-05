import React from 'react';
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
  /** Flashcards-only lines under a row, e.g. flagged answers to accept or dismiss. */
  /** Lines a student has below the row, so anchor numbering is worked out up front. */
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
  belowCount,
  renderBelow,
}) => {
  const showToolbar = bucket !== 'notStarted';
  const showScores = (prefs.monitorShowScores ?? false) && bucket === 'done';
  const showProf = (prefs.monitorShowProficiency ?? false) && bucket === 'done';
  const rows = orderFlashcardRoster(students, nameFor, prefs, showToolbar);
  const total = session.cards.length;
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
            {bucket === 'inProgress' && total > 0 && (
              <RosterOnQuestion index={Math.min(s.cardsDone + 1, total)} />
            )}
            {showScores && <RosterScorePill score={rounded} suffix="%" />}
            <RosterRowMenu
              ariaLabel={`Actions for ${name}`}
              triggerAnchor={tourFieldAttr(
                'flashcards.student-actions',
                'flashcards',
                field
              )}
              items={flashcardMenuItems(letInFor(s.studentUid), () =>
                onRemove(s.studentUid)
              )}
            />
          </RosterRow>
        );
      })}
    </div>
  );
};
