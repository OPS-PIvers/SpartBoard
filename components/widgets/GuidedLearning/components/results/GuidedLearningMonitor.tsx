import React, { useState, type ReactNode } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { ResultsSheetButton } from '@/components/widgets/QuizWidget/components/results/ResultsSheetButton';
import type { ResultsSheetExport } from '@/hooks/useResultsSheetExport';
import { MonitorHeader } from '@/components/widgets/QuizWidget/components/monitor/MonitorHeader';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import type { GuidedLearningPublicStep } from '@/types';
import {
  StatusBuckets,
  type BucketKey,
} from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface GlMonitorRow {
  key: string;
  name: string;
  bucket: BucketKey;
}

export interface GlQuestionStat {
  step: Pick<GuidedLearningPublicStep, 'id' | 'question'>;
  correct: number;
  total: number;
  pct: number | null;
}

export type GlMonitorStatus = 'live' | 'paused' | 'waiting' | 'ended';

interface Props<R extends GlMonitorRow> {
  title: string;
  status: GlMonitorStatus;
  onBack: () => void;
  loading: boolean;
  /** Rows for the picked class, already bucketed. */
  rows: R[];
  /** Class picker and per-class Start/Pause, when there is more than one class. */
  classControls?: ReactNode;
  /** Rows under the header, e.g. who launched the session. */
  banner?: ReactNode;
  renderDetail: (row: R) => ReactNode;
  renderActions: (row: R, rowIndex: number) => ReactNode;
  questionStats: GlQuestionStat[];
  /** Slide engagement, shown on the Question results screen. */
  engagement?: ReactNode;
  sheet: ResultsSheetExport;
  exportDisabled: boolean;
}

const icon = { width: 'min(14px, 4.5cqmin)', height: 'min(14px, 4.5cqmin)' };
const footerButton =
  'inline-flex items-center whitespace-nowrap bg-white border border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light font-sans font-semibold rounded-md transition-colors disabled:opacity-50';
const footerButtonStyle = {
  gap: 'min(6px, 1.5cqmin)',
  padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
  fontSize: 'min(13px, 4.5cqmin)',
};

/** Guided Learning assignment monitor in the Quiz monitor's self-paced layout. */
export const GuidedLearningMonitor = <R extends GlMonitorRow>({
  title,
  status,
  onBack,
  loading,
  rows,
  classControls,
  banner,
  renderDetail,
  renderActions,
  questionStats,
  engagement,
  sheet,
  exportDisabled,
}: Props<R>): React.ReactElement => {
  const [screen, setScreen] = useState<'home' | 'questions'>('home');
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const onHome = screen === 'home';
  const counts = { notStarted: 0, inProgress: 0, done: 0 };
  for (const r of rows) counts[r.bucket]++;
  const bucketRows = openBucket
    ? rows
        .filter((r) => r.bucket === openBucket)
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        )
    : [];

  return (
    <div className="h-full w-full flex flex-col bg-white text-brand-gray-dark">
      <MonitorHeader
        title={onHome ? title : 'Question results'}
        status={
          status === 'live' ? 'live' : status === 'ended' ? 'ended' : 'paused'
        }
        label={status === 'waiting' ? 'Not started' : undefined}
        accent={LIBRARY_HEADER_ACCENTS['guided-learning']}
        onBack={() => (onHome ? onBack() : setScreen('home'))}
        backAnchor={tourAttr('gl-results.back')}
      />
      {banner}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2
            className="text-brand-gray-primary animate-spin"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          {onHome ? (
            <div
              className="flex flex-col"
              style={{ gap: 'min(10px, 2.5cqmin)' }}
            >
              {classControls}
              <StatusBuckets
                counts={counts}
                handCount={0}
                idleCount={0}
                openBucket={openBucket}
                onToggle={(key) =>
                  setOpenBucket((cur) => (cur === key ? null : key))
                }
                anchor={(key) =>
                  tourFieldAttr(
                    'gl-results.status-bucket',
                    'guided-learning',
                    key
                  )
                }
              />
              {openBucket && (
                <div
                  className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
                  style={{ gap: 'min(6px, 1.5cqmin)' }}
                >
                  {bucketRows.length === 0 && (
                    <p
                      className="text-brand-gray-primary text-center"
                      style={{
                        fontSize: 'min(12px, 4cqmin)',
                        padding: 'min(8px, 2cqmin)',
                      }}
                    >
                      No students here yet.
                    </p>
                  )}
                  {bucketRows.map((row, rowIndex) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between rounded-lg border border-brand-gray-lightest bg-white"
                      style={{
                        padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
                        gap: 'min(8px, 2cqmin)',
                      }}
                    >
                      <div className="min-w-0">
                        <p
                          className="font-sans font-medium text-brand-gray-dark truncate"
                          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                        >
                          {row.name}
                        </p>
                        {renderDetail(row)}
                      </div>
                      <div
                        className="flex items-center shrink-0"
                        style={{ gap: 'min(6px, 1.5cqmin)' }}
                      >
                        {renderActions(row, rowIndex)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 'min(12px, 3cqmin)' }}>
              {questionStats.length === 0 && (
                <p
                  className="text-brand-gray-primary text-center"
                  style={{
                    fontSize: 'min(12px, 4cqmin)',
                    padding: 'min(8px, 2cqmin)',
                  }}
                >
                  This set has no questions.
                </p>
              )}
              {questionStats.length > 0 && (
                <div
                  className="flex flex-col"
                  style={{ gap: 'min(6px, 1.5cqmin)' }}
                >
                  {questionStats.map(({ step, correct, total, pct }, i) => (
                    <div
                      key={step.id}
                      className="bg-white border border-brand-gray-lighter rounded-lg"
                      style={{
                        padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
                      }}
                    >
                      <div
                        className="flex items-start justify-between"
                        style={{ gap: 'min(8px, 2cqmin)' }}
                      >
                        <div className="min-w-0">
                          <p
                            className="font-sans font-semibold text-brand-blue-primary uppercase tracking-wider"
                            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
                          >
                            Q{i + 1}
                          </p>
                          <p
                            className="font-sans text-brand-gray-dark"
                            style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                          >
                            {step.question?.text}
                          </p>
                        </div>
                        <span
                          className="shrink-0 text-brand-gray-primary tabular-nums"
                          style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                        >
                          {pct !== null ? `${pct}% · ` : ''}
                          {correct} / {total} correct
                        </span>
                      </div>
                      {pct !== null && (
                        <div
                          className="bg-brand-gray-lightest rounded-full overflow-hidden"
                          style={{
                            height: 'min(6px, 1.5cqmin)',
                            marginTop: 'min(8px, 2cqmin)',
                          }}
                        >
                          <div
                            className="h-full rounded-full bg-brand-blue-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {engagement}
            </div>
          )}
        </div>
      )}

      {onHome && (
        <div
          className="flex flex-wrap items-center justify-end border-t border-brand-gray-lightest shrink-0"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          <button
            type="button"
            onClick={() => setScreen('questions')}
            {...tourAttr('gl-results.question-results')}
            className={footerButton}
            style={footerButtonStyle}
          >
            <BarChart3
              className="text-brand-blue-primary"
              style={icon}
              aria-hidden
            />
            Question results
          </button>
          <ResultsSheetButton
            sheet={sheet}
            disabled={exportDisabled}
            exportAnchor={tourAttr('gl-results.export')}
            openAnchor={tourAttr('gl-results.open-sheet')}
            className={footerButton}
            style={footerButtonStyle}
            iconStyle={icon}
            iconClassName="text-brand-blue-primary"
          />
        </div>
      )}
    </div>
  );
};
