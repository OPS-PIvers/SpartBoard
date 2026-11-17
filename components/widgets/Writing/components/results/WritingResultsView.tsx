// The Writing results face, laid out like Quiz's: summary, distribution, a Students drill-down and the grader in the footer.
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
} from 'lucide-react';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ScorePill } from '@/components/common/sessionViews';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  ResultsDrillRow,
  ResultsSummaryCard,
  ScoreDistributionBars,
} from '@/components/widgets/QuizWidget/components/results/ResultsHome';
import { SegmentedToggle } from '@/components/widgets/QuizWidget/components/results/SegmentedToggle';
import {
  isGradable,
  WRITING_ROW_LABELS,
  type WritingResultRow,
} from '@/utils/writingGrading';

const ACCENT = LIBRARY_HEADER_ACCENTS.writing ?? '#854d0e';

export interface WritingResultsViewProps {
  title: string;
  rows: WritingResultRow[];
  maxPoints: number | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onGrade: (studentUid: string) => void;
}

type Screen = 'home' | 'students';
type StudentSort = 'lastName' | 'score';

const headerIcon = { width: 'min(16px, 5cqmin)', height: 'min(16px, 5cqmin)' };
const footerIcon = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};
const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The returned score as a whole percent, or null when there is none to count. */
const percentOf = (row: WritingResultRow): number | null => {
  const g = row.response?.grade;
  if (!g || g.excused || typeof g.pointsAwarded !== 'number') return null;
  const max = g.maxPoints;
  return typeof max === 'number' && max > 0
    ? Math.round((g.pointsAwarded / max) * 100)
    : null;
};

export const WritingResultsView: React.FC<WritingResultsViewProps> = ({
  title,
  rows,
  maxPoints,
  loading,
  error,
  onBack,
  onGrade,
}) => {
  const [screen, setScreen] = useState<Screen>('home');
  const [sort, setSort] = useState<StudentSort>('lastName');
  const [hideNames, setHideNames] = useState(false);

  const graded = maxPoints !== null;
  const gradable = rows.filter(isGradable);
  const turnedIn = rows.filter(
    (r) => r.state === 'turned-in' || r.state === 'returned'
  ).length;
  const returned = rows.filter((r) => r.state === 'returned').length;
  const scores = rows.flatMap((r) => {
    const p = percentOf(r);
    return p === null ? [] : [p];
  });
  const average =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : null;
  const firstToGrade =
    gradable.find((r) => r.state === 'turned-in' && !r.response?.grade) ??
    gradable.find((r) => r.state === 'turned-in') ??
    gradable[0];

  // Numbered in roster order, so "Student 3" is the same student on every screen.
  const masked = useMemo(
    () => new Map(rows.map((r, i) => [r.studentUid, `Student ${i + 1}`])),
    [rows]
  );
  const shownName = (r: WritingResultRow): string =>
    hideNames ? (masked.get(r.studentUid) ?? 'Student') : r.name;
  const studentRows = useMemo(() => {
    const key = (r: WritingResultRow): string =>
      hideNames ? (masked.get(r.studentUid) ?? '') : r.sortKey;
    return rows.slice().sort((a, b) => {
      const byName = collator.compare(key(a), key(b));
      const diff = (percentOf(b) ?? -1) - (percentOf(a) ?? -1);
      return sort === 'score' ? diff || byName : byName;
    });
  }, [hideNames, masked, rows, sort]);

  const goBack = (): void => (screen === 'home' ? onBack() : setScreen('home'));

  return (
    <div className="relative flex h-full w-full flex-col bg-white font-sans text-brand-gray-dark">
      <div
        className="flex shrink-0 items-center text-white"
        style={{
          backgroundColor: ACCENT,
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          {...tourTypeAttr('writing-results.back', 'writing')}
          className="touch-target-expand relative rounded-md transition-colors hover:bg-white/15"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <ArrowLeft aria-hidden style={headerIcon} />
        </button>
        <p
          className="flex-1 truncate font-sans font-semibold"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
          title={title}
        >
          {screen === 'students' ? 'Students' : title}
        </p>
        <button
          type="button"
          onClick={() => setHideNames((v) => !v)}
          aria-pressed={hideNames}
          aria-label="Hide student names"
          title={hideNames ? 'Show student names' : 'Hide student names'}
          {...tourTypeAttr('writing-results.hide-names', 'writing')}
          className="shrink-0 rounded-md transition-colors hover:bg-white/15"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          {hideNames ? (
            <EyeOff aria-hidden style={headerIcon} />
          ) : (
            <Eye aria-hidden style={headerIcon} />
          )}
        </button>
        <span
          className="shrink-0 rounded-full bg-white/20 font-sans font-semibold uppercase tracking-wider text-white"
          style={{
            fontSize: 'min(10px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
          }}
        >
          Results
        </span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-yellow-800">
          <Loader2
            aria-label="Loading"
            className="animate-spin"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
        </div>
      ) : error ? (
        <ScaledEmptyState
          icon={BarChart3}
          title="Couldn't load results"
          subtitle="Go back and open them again."
        />
      ) : rows.length === 0 ? (
        <ScaledEmptyState
          icon={BarChart3}
          title="No students yet"
          subtitle="Students appear here once they open it."
        />
      ) : (
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          {screen === 'home' && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(10px, 2.5cqmin)' }}
            >
              {graded ? (
                <>
                  <ResultsSummaryCard
                    label="Class average"
                    value={average !== null ? `${average}%` : 'None yet'}
                    detail={`${turnedIn} of ${rows.length} turned in · ${returned} returned`}
                  />
                  <ScoreDistributionBars scores={scores} />
                </>
              ) : (
                <ResultsSummaryCard
                  label="Turned in"
                  value={`${turnedIn} of ${rows.length}`}
                  detail={`${returned} returned`}
                />
              )}
              <ResultsDrillRow
                label="Students"
                detail={plural(rows.length, 'student')}
                onClick={() => setScreen('students')}
                anchor={tourTypeAttr(
                  'writing-results.drill-students',
                  'writing'
                )}
              />
            </div>
          )}

          {screen === 'students' && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {graded && (
                <div className="flex items-center justify-end">
                  <SegmentedToggle
                    label="Sort students"
                    value={sort}
                    options={[
                      ['lastName', 'Last name'],
                      ['score', 'Score'],
                    ]}
                    onChange={setSort}
                    anchor={(v) =>
                      tourFieldAttr('writing-results.sort', 'writing', v)
                    }
                  />
                </div>
              )}
              {studentRows.map((r, i) => {
                const can = isGradable(r);
                const grade = r.response?.grade;
                const pct = percentOf(r);
                const draftCount = r.response?.draftCount ?? 0;
                return (
                  <button
                    key={r.studentUid}
                    type="button"
                    disabled={!can}
                    onClick={() => onGrade(r.studentUid)}
                    {...tourFieldAttr(
                      'writing-results.student-row',
                      'writing',
                      `row-${i + 1}`
                    )}
                    className="flex items-center justify-between rounded-lg border border-brand-gray-lightest bg-white text-left transition-colors enabled:hover:border-brand-blue-light disabled:cursor-default"
                    style={{
                      gap: 'min(8px, 2cqmin)',
                      padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
                    }}
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate font-sans font-medium text-brand-gray-dark"
                        style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                        data-pii
                      >
                        {shownName(r)}
                      </p>
                      <p
                        className={`truncate ${r.state === 'turned-in' ? 'font-semibold text-yellow-800' : 'text-brand-gray-primary'}`}
                        style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                      >
                        {draftCount > 0
                          ? `${WRITING_ROW_LABELS[r.state]} · Draft ${draftCount}`
                          : WRITING_ROW_LABELS[r.state]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {grade?.excused ? (
                        <span
                          className="font-sans font-semibold text-brand-gray-primary"
                          style={{ fontSize: 'min(12px, 4cqmin)' }}
                        >
                          Excused
                        </span>
                      ) : pct !== null ? (
                        <>
                          <ScorePill score={pct} display="percent" />
                          <p
                            className="text-brand-gray-primary tabular-nums"
                            style={{ fontSize: 'min(10px, 3cqmin)' }}
                          >
                            {grade?.pointsAwarded}/{grade?.maxPoints} pts
                          </p>
                        </>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {screen === 'home' && !loading && !error && rows.length > 0 && (
        <div
          className="flex shrink-0 items-center border-t border-brand-gray-lightest"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          <button
            type="button"
            onClick={() => firstToGrade && onGrade(firstToGrade.studentUid)}
            disabled={!firstToGrade}
            {...tourTypeAttr('writing-results.grade', 'writing')}
            className="inline-flex items-center rounded-md border border-brand-gray-lighter bg-white font-sans font-semibold text-brand-blue-primary transition-colors hover:border-brand-blue-light disabled:opacity-60"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
              fontSize: 'min(13px, 4.5cqmin)',
            }}
          >
            <Pencil aria-hidden style={footerIcon} />
            Grade
          </button>
        </div>
      )}
    </div>
  );
};
