// The Writing results face: every student's status, draft and score, with the grader one click away.
import React from 'react';
import { ArrowLeft, Inbox, Loader2, PenLine } from 'lucide-react';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  formatWritingScore,
  isGradable,
  WRITING_ROW_LABELS,
  type WritingResultRow,
} from '@/utils/writingGrading';

const ACCENT = LIBRARY_HEADER_ACCENTS.writing ?? '#0f766e';

export interface WritingResultsViewProps {
  title: string;
  rows: WritingResultRow[];
  maxPoints: number | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onGrade: (studentUid: string) => void;
}

const icon = { width: 'min(16px, 5cqmin)', height: 'min(16px, 5cqmin)' };

export const WritingResultsView: React.FC<WritingResultsViewProps> = ({
  title,
  rows,
  maxPoints,
  loading,
  error,
  onBack,
  onGrade,
}) => {
  const gradable = rows.filter(isGradable);
  const turnedIn = rows.filter(
    (r) => r.state === 'turned-in' || r.state === 'returned'
  ).length;
  const firstToGrade =
    gradable.find((r) => r.state === 'turned-in' && !r.response?.grade) ??
    gradable.find((r) => r.state === 'turned-in') ??
    gradable[0];

  return (
    <div className="relative flex h-full flex-col bg-white font-sans text-slate-800">
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
          onClick={onBack}
          aria-label="Back"
          {...tourTypeAttr('writing-results.back', 'writing')}
          className="rounded-md transition-colors hover:bg-white/15"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <ArrowLeft aria-hidden style={icon} />
        </button>
        <p
          className="min-w-0 flex-1 truncate font-semibold"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
          title={title}
        >
          {title}
        </p>
        <button
          type="button"
          onClick={() => firstToGrade && onGrade(firstToGrade.studentUid)}
          disabled={!firstToGrade}
          {...tourTypeAttr('writing-results.grade', 'writing')}
          className="inline-flex shrink-0 items-center rounded-lg bg-white font-bold text-teal-800 transition-colors hover:bg-teal-50 disabled:opacity-50"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(5px, 1.2cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(12px, 4cqmin)',
          }}
        >
          <PenLine aria-hidden style={icon} />
          Grade
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-teal-700">
          <Loader2
            aria-label="Loading"
            className="animate-spin"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
        </div>
      ) : error ? (
        <ScaledEmptyState
          icon={Inbox}
          title="Couldn't load results"
          subtitle="Go back and open them again."
        />
      ) : rows.length === 0 ? (
        <ScaledEmptyState
          icon={Inbox}
          title="No students yet"
          subtitle="Students appear here once they open it."
        />
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ paddingBottom: 'min(16px, 4cqmin)' }}
        >
          <p
            className="font-semibold text-slate-500"
            style={{
              fontSize: 'min(12px, 4cqmin)',
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
            }}
          >
            {`${turnedIn} of ${rows.length} turned in`}
          </p>
          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {rows.map((r, i) => {
              const can = isGradable(r);
              const score = formatWritingScore(r.response?.grade, maxPoints);
              const draftCount = r.response?.draftCount ?? 0;
              return (
                <li key={r.studentUid}>
                  <button
                    type="button"
                    disabled={!can}
                    onClick={() => onGrade(r.studentUid)}
                    {...tourFieldAttr(
                      'writing-results.student-row',
                      'writing',
                      `row-${i + 1}`
                    )}
                    className="grid w-full items-center text-left transition-colors enabled:hover:bg-slate-50 disabled:cursor-default"
                    style={{
                      gridTemplateColumns: 'minmax(0, 1fr) 6.5em 4.5em 4.5em',
                      gap: 'min(12px, 2.5cqmin)',
                      padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                      fontSize: 'min(14px, 4.5cqmin)',
                    }}
                  >
                    <span className="truncate font-semibold" data-pii>
                      {r.name}
                    </span>
                    <span
                      className={`truncate ${
                        r.state === 'turned-in'
                          ? 'font-semibold text-teal-800'
                          : 'text-slate-500'
                      }`}
                    >
                      {WRITING_ROW_LABELS[r.state]}
                    </span>
                    <span className="truncate text-slate-500">
                      {draftCount > 0 ? `Draft ${draftCount}` : ''}
                    </span>
                    <span className="truncate text-right font-semibold tabular-nums text-slate-700">
                      {score ?? ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
