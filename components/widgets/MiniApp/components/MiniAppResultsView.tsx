// Results for v2 Mini App sessions, built like the Video Activity results page (docs/plans/MINI_APP_RESULTS.md D10).
import React, { useId, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  ListChecks,
  Users,
  XCircle,
} from 'lucide-react';
import {
  OverflowMenu,
  ScorePill,
  SegmentedTabs,
  SessionBadge,
  SessionRow,
  SessionViewHeader,
  StatTile,
  type OverflowMenuItem,
} from '@/components/common/sessionViews';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { scoreColorClasses } from '@/utils/scoreColor';
import type { MiniAppBestAttempt, MiniAppManifestQuestion } from '@/types';

export interface MiniAppResultRow {
  id: string;
  name: string;
  attemptCount: number;
  best: MiniAppBestAttempt | null;
  lastSubmittedAt: number;
  /** "I'm Done" with no graded attempt. */
  doneOnly: boolean;
  /** Latest result from an older app that does not use attempts. */
  legacyPayload?: unknown;
}

export interface MiniAppAttemptView {
  attemptNo: number;
  submittedAt: number;
  score?: number;
  maxScore?: number;
  gradedBy?: 'server' | 'app' | null;
  /** Old apps' free-form result, shown as-is. */
  rawPayload?: unknown;
}

type Tab = 'overview' | 'questions' | 'students';

const ICON = { width: 'min(20px, 5cqmin)', height: 'min(20px, 5cqmin)' };
const MARK = { width: 'min(14px, 3.5cqmin)', height: 'min(14px, 3.5cqmin)' };
const LIST =
  'bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm overflow-hidden';

const pct = (score: number, max: number): number =>
  max > 0 ? Math.round((score / max) * 100) : 0;

const formatTime = (ms: number): string =>
  ms > 0
    ? new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

const scoreText = (score: number, max: number): string =>
  `${Number(score.toFixed(2))}/${Number(max.toFixed(2))}`;

const FromApp: React.FC = () => (
  <span
    className="text-slate-400"
    style={{ fontSize: 'min(10px, 3cqmin)' }}
    title="Scored by the app, not by your answer key"
  >
    from app
  </span>
);

export const MiniAppResultsView: React.FC<{
  title: string;
  subtitle?: string;
  ended: boolean;
  rows: MiniAppResultRow[];
  questions: MiniAppManifestQuestion[];
  attemptLimit: number | null;
  loadAttempts: (rowId: string) => Promise<MiniAppAttemptView[]>;
  onBack: () => void;
  /** Creates the results sheet and resolves to its URL. */
  onExport?: () => Promise<string>;
  /** Per-period open/close controls, shown under the header. */
  periodControls?: React.ReactNode;
}> = ({
  title,
  subtitle,
  ended,
  rows,
  questions,
  attemptLimit,
  loadAttempts,
  onBack,
  onExport,
  periodControls,
}) => {
  const tabPanelId = useId();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<
    Record<string, MiniAppAttemptView[] | 'loading' | 'error'>
  >({});
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const scored = rows.filter((r) => r.best);
  const avgScore =
    scored.length === 0
      ? null
      : Math.round(
          scored.reduce(
            (sum, r) => sum + pct(r.best?.score ?? 0, r.best?.maxScore ?? 0),
            0
          ) / scored.length
        );
  const accuracy = (qid: string): number | null => {
    const marks = scored
      .map((r) => r.best?.items?.find((m) => m.id === qid))
      .filter((m) => m !== undefined);
    if (marks.length === 0) return null;
    return Math.round(
      (marks.filter((m) => m.correct).length / marks.length) * 100
    );
  };
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        (b.best ? pct(b.best.score, b.best.maxScore) : -1) -
        (a.best ? pct(a.best.score, a.best.maxScore) : -1)
    );

  const toggle = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (attempts[id] && attempts[id] !== 'error') return;
    setAttempts((prev) => ({ ...prev, [id]: 'loading' }));
    loadAttempts(id).then(
      (list) => setAttempts((prev) => ({ ...prev, [id]: list })),
      () => setAttempts((prev) => ({ ...prev, [id]: 'error' }))
    );
  };

  const handleExport = async () => {
    if (!onExport) return;
    setExporting(true);
    setExportError(null);
    try {
      setExportUrl(await onExport());
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Export failed. Please try again.'
      );
    } finally {
      setExporting(false);
    }
  };

  const overflowItems: OverflowMenuItem[] = [];
  if (!exportUrl && onExport) {
    overflowItems.push({
      label: 'Export',
      icon: Download,
      loading: exporting,
      onClick: () => void handleExport(),
      disabled: exporting || rows.length === 0,
    });
  }
  if (exportUrl) {
    const sheetUrl = exportUrl;
    overflowItems.push({
      label: 'Open Sheet',
      icon: ExternalLink,
      onClick: () => window.open(sheetUrl, '_blank', 'noopener,noreferrer'),
    });
  }

  const tabs: {
    key: Tab;
    label: string;
    icon: typeof Users;
    count?: number;
  }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    ...(questions.length > 0
      ? [{ key: 'questions' as const, label: 'Questions', icon: ListChecks }]
      : []),
    { key: 'students', label: 'Students', icon: Users, count: rows.length },
  ];

  return (
    <div className="flex flex-col h-full font-sans">
      <SessionViewHeader
        onBack={onBack}
        status={ended ? 'ended' : 'live'}
        title={title}
        subtitle={subtitle && subtitle !== title ? subtitle : undefined}
        actions={
          overflowItems.length > 0 ? (
            <OverflowMenu items={overflowItems} />
          ) : undefined
        }
      />

      {periodControls && (
        <div
          className="border-b border-slate-200 shrink-0"
          style={{ padding: 'min(6px, 1.6cqmin) min(16px, 4cqmin)' }}
        >
          {periodControls}
        </div>
      )}

      {exportError && (
        <div
          className="flex items-center bg-amber-50 border-b border-amber-200 text-amber-700"
          style={{
            padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
            gap: 'min(8px, 2cqmin)',
            fontSize: 'min(11px, 3.5cqmin)',
          }}
        >
          <AlertTriangle
            className="shrink-0"
            style={{ width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' }}
          />
          {exportError}
        </div>
      )}

      <div
        className="flex border-b border-slate-200"
        style={{ padding: 'min(8px, 2cqmin) min(16px, 4cqmin)' }}
      >
        <SegmentedTabs
          ariaLabel="Mini app results sections"
          panelIdPrefix={tabPanelId}
          value={activeTab}
          onChange={setActiveTab}
          tabs={tabs}
        />
      </div>

      <div
        role="tabpanel"
        id={`${tabPanelId}-panel-${activeTab}`}
        aria-labelledby={`${tabPanelId}-tab-${activeTab}`}
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(14px, 3.5cqmin)' }}
      >
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                tone="blue"
                icon={<Users style={ICON} />}
                value={rows.length}
                label="Students"
              />
              <StatTile
                tone="green"
                icon={<CheckCircle2 style={ICON} />}
                value={rows.filter((r) => !r.doneOnly).length}
                label="Submitted"
              />
              <StatTile
                tone="amber"
                icon={<BarChart3 style={ICON} />}
                value={avgScore === null ? '—' : `${avgScore}%`}
                label="Avg Score"
              />
            </div>
            {rows.length === 0 && (
              <ScaledEmptyState icon={Users} title="No students yet" />
            )}
          </div>
        )}

        {activeTab === 'questions' && (
          <div className={LIST}>
            {questions.map((q, idx) => {
              const acc = accuracy(q.id);
              const colors = scoreColorClasses(acc ?? 0);
              return (
                <SessionRow
                  key={q.id}
                  trailing={
                    acc === null ? (
                      <SessionBadge tone="neutral" label="No answers" />
                    ) : (
                      <div className="shrink-0 text-right">
                        <p
                          className={`font-black tabular-nums ${colors.text}`}
                          style={{ fontSize: 'min(16px, 5cqmin)' }}
                        >
                          {acc}%
                        </p>
                        <p
                          className="text-slate-400"
                          style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                        >
                          accuracy
                        </p>
                      </div>
                    )
                  }
                >
                  <p
                    className="text-slate-700 font-medium break-words"
                    style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                  >
                    {idx + 1}. {q.prompt}
                  </p>
                  {acc !== null && (
                    <div
                      className="bg-slate-100 rounded-full overflow-hidden"
                      style={{
                        height: 'min(6px, 1.5cqmin)',
                        marginTop: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${colors.bar}`}
                        style={{ width: `${acc}%` }}
                      />
                    </div>
                  )}
                </SessionRow>
              );
            })}
          </div>
        )}

        {activeTab === 'students' &&
          (rows.length === 0 ? (
            <ScaledEmptyState icon={Users} title="No students yet" />
          ) : (
            <div className={LIST}>
              {sorted.map((row) => {
                const marks = new Map(
                  (row.best?.items ?? []).map((m) => [m.id, m])
                );
                const correct = [...marks.values()].filter(
                  (m) => m.correct
                ).length;
                const list = attempts[row.id];
                return (
                  <React.Fragment key={row.id}>
                    <SessionRow
                      onClick={() => toggle(row.id)}
                      trailing={
                        <>
                          <div
                            className="flex items-center shrink-0"
                            style={{ gap: 'min(6px, 1.5cqmin)' }}
                          >
                            {questions.map((q) => {
                              const m = marks.get(q.id);
                              if (!m) return null;
                              return m.correct ? (
                                <CheckCircle2
                                  key={q.id}
                                  role="img"
                                  aria-label="Correct"
                                  className="text-emerald-500"
                                  style={MARK}
                                />
                              ) : (
                                <XCircle
                                  key={q.id}
                                  role="img"
                                  aria-label="Incorrect"
                                  className="text-brand-red-primary"
                                  style={MARK}
                                />
                              );
                            })}
                          </div>
                          {row.best ? (
                            <ScorePill
                              score={pct(row.best.score, row.best.maxScore)}
                              display="percent"
                            />
                          ) : (
                            <span
                              className="font-black tabular-nums shrink-0 text-slate-400"
                              style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                            >
                              —
                            </span>
                          )}
                        </>
                      }
                    >
                      <p
                        className="font-bold text-slate-800 truncate"
                        style={{ fontSize: 'min(13px, 4cqmin)' }}
                      >
                        {row.name}
                      </p>
                      <div
                        className="flex flex-wrap items-center"
                        style={{
                          gap: 'min(6px, 1.5cqmin)',
                          marginTop: 'min(3px, 0.8cqmin)',
                        }}
                      >
                        <SessionBadge
                          tone={row.doneOnly ? 'neutral' : 'success'}
                          label={row.doneOnly ? 'Done' : 'Submitted'}
                        />
                        <span
                          className="text-slate-400"
                          style={{ fontSize: 'min(10px, 3cqmin)' }}
                        >
                          {attemptLimit === null
                            ? `${row.attemptCount} ${row.attemptCount === 1 ? 'attempt' : 'attempts'}`
                            : `${row.attemptCount} of ${attemptLimit} attempts`}
                          {row.best && marks.size > 0
                            ? ` · ${correct}/${marks.size} correct`
                            : ''}
                          {row.best && marks.size === 0
                            ? ` · ${scoreText(row.best.score, row.best.maxScore)}`
                            : ''}
                        </span>
                        {row.best?.gradedBy === 'app' && <FromApp />}
                      </div>
                    </SessionRow>
                    {openId === row.id && (
                      <div
                        className="border-b border-slate-200/60 bg-slate-50/60"
                        style={{
                          padding: 'min(8px, 2cqmin) min(12px, 2.6cqmin)',
                          paddingLeft: 'min(30px, 7cqmin)',
                          fontSize: 'min(11px, 3.2cqmin)',
                        }}
                      >
                        {list === 'loading' || list === undefined ? (
                          <p className="text-slate-500">Loading…</p>
                        ) : list === 'error' ? (
                          <p className="text-brand-red-primary">
                            Could not load attempts.
                          </p>
                        ) : list.length === 0 ? (
                          row.legacyPayload !== undefined ? (
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                              {JSON.stringify(row.legacyPayload, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-slate-500">
                              No graded attempts.
                            </p>
                          )
                        ) : (
                          <ul className="divide-y divide-slate-200">
                            {list.map((a) => (
                              <li key={a.attemptNo} className="py-1.5">
                                <div
                                  className="flex flex-wrap items-baseline text-slate-700"
                                  style={{ columnGap: 'min(12px, 3cqmin)' }}
                                >
                                  <span className="font-bold">
                                    Attempt {a.attemptNo}
                                  </span>
                                  {a.score !== undefined &&
                                    a.maxScore !== undefined && (
                                      <span>
                                        {scoreText(a.score, a.maxScore)}
                                      </span>
                                    )}
                                  {a.gradedBy === 'app' && <FromApp />}
                                  <span className="text-slate-500">
                                    {formatTime(a.submittedAt)}
                                  </span>
                                </div>
                                {a.rawPayload !== undefined && (
                                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                                    {JSON.stringify(a.rawPayload, null, 2)}
                                  </pre>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
};
