// Results for v2 Mini App sessions, laid out like the Quiz results page (docs/plans/shipped/MINI_APP_RESULTS.md D10).
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Loader2,
  XCircle,
} from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ScorePill } from '@/components/common/sessionViews';
import { StudentAnswerLine } from '@/components/widgets/QuizWidget/components/results/StudentAnswerLine';
import {
  SCORE_DISTRIBUTION_BANDS,
  scoreColorClasses,
} from '@/utils/scoreColor';
import type { StudentQuestionLine } from '@/utils/quizStudentDrilldown';
import type { MiniAppBestAttempt, MiniAppManifestQuestion } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';

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
  /** Per-question answers and marks for this attempt. */
  items?: {
    id: string;
    answer: unknown;
    correct: boolean | null;
    earned: number;
    points: number;
  }[];
  /** Old apps' free-form result, shown as-is. */
  rawPayload?: unknown;
}

type Screen = 'home' | 'questions' | 'students';
type StudentSort = 'score' | 'lastName';
type ScoreDisplay = 'percent' | 'points';

const HIDE_NAMES_KEY = 'spartboard.quizResults.hideNames';
const STUDENT_VIEW_KEY = 'spartboard.quizResults.studentView';

const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
};

const SMALL_TEXT = { fontSize: 'min(11px, 3.8cqmin)' } as const;
const SMALL_ICON = {
  width: 'min(12px, 3.8cqmin)',
  height: 'min(12px, 3.8cqmin)',
} as const;
const HEADER_ICON = {
  width: 'min(16px, 5cqmin)',
  height: 'min(16px, 5cqmin)',
} as const;
const SECTION_LABEL =
  'font-sans font-semibold text-brand-blue-primary uppercase tracking-wider';
const CARD = 'bg-white border border-brand-gray-lighter rounded-lg';

const pct = (score: number, max: number): number =>
  max > 0 ? Math.round((score / max) * 100) : 0;

const num = (n: number): string => String(Number(n.toFixed(2)));

const formatTime = (ms: number): string =>
  ms > 0
    ? new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

const answerText = (answer: unknown): string => {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.map(String).join(', ');
  return typeof answer === 'string' ? answer : JSON.stringify(answer);
};

const lastNameOf = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border border-brand-gray-lighter"
    >
      {options.map(([v, text], i) => {
        const on = v === value;
        return (
          // no-tour-anchor: filter option generated from the options list
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={on}
            className={`font-sans font-semibold transition-colors ${i > 0 ? 'border-l border-brand-gray-lighter' : ''} ${
              on
                ? 'bg-brand-blue-lighter text-brand-blue-dark'
                : 'bg-white text-brand-gray-primary hover:text-brand-gray-dark'
            }`}
            style={{
              fontSize: 'min(11px, 3.5cqmin)',
              padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

const DrillRow: React.FC<{
  label: string;
  detail: string;
  onClick: () => void;
}> = ({ label, detail, onClick }) => (
  // no-tour-anchor: summary card generated per results section
  <button
    onClick={onClick}
    className={`flex items-center justify-between ${CARD} hover:border-brand-blue-light transition-colors text-left`}
    style={{
      padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
      gap: 'min(8px, 2cqmin)',
    }}
  >
    <p
      className="font-sans font-semibold text-brand-gray-dark truncate"
      style={{ fontSize: 'min(13px, 4.5cqmin)' }}
    >
      {label}
    </p>
    <span
      className="flex items-center shrink-0 text-brand-gray-primary"
      style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(11px, 3.8cqmin)' }}
    >
      {detail}
      <ChevronRight
        className="text-brand-gray-light"
        aria-hidden
        style={{ width: 'min(14px, 4.5cqmin)', height: 'min(14px, 4.5cqmin)' }}
      />
    </span>
  </button>
);

const FromApp: React.FC = () => (
  <span
    className="font-sans text-brand-gray-primary shrink-0"
    style={{ fontSize: 'min(10px, 3cqmin)' }}
    title="Scored by the app, not by your answer key"
  >
    from app
  </span>
);

export const MiniAppResultsView: React.FC<{
  title: string;
  rows: MiniAppResultRow[];
  questions: MiniAppManifestQuestion[];
  attemptLimit: number | null;
  loadAttempts: (rowId: string) => Promise<MiniAppAttemptView[]>;
  onBack: () => void;
  /** Creates the results sheet and resolves to its URL. */
  onExport?: () => Promise<string>;
  /** Per-period open/close controls, shown under the header. */
  periodControls?: React.ReactNode;
  /** Keys the shared Quiz results view choices (hide names, % or points). */
  uid?: string;
}> = ({
  title,
  rows,
  questions,
  attemptLimit,
  loadAttempts,
  onBack,
  onExport,
  periodControls,
  uid,
}) => {
  const hideKey = `${HIDE_NAMES_KEY}.${uid ?? 'anon'}`;
  const viewKey = `${STUDENT_VIEW_KEY}.${uid ?? 'anon'}`;
  const [screen, setScreen] = useState<Screen>('home');
  const [hideNames, setHideNames] = useState(() => readStored(hideKey) === '1');
  const [view, setView] = useState<{
    sort: StudentSort;
    display: ScoreDisplay;
  }>(() => {
    const [sort, display] = (readStored(viewKey) ?? '').split('|');
    return {
      sort: sort === 'lastName' ? 'lastName' : 'score',
      display: display === 'points' ? 'points' : 'percent',
    };
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<
    Record<string, MiniAppAttemptView[] | 'loading' | 'error'>
  >({});
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const maskedName = useMemo(() => {
    const sorted = rows
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
    return new Map(sorted.map((r, i) => [r.id, `Student ${i + 1}`]));
  }, [rows]);
  const shownName = (r: MiniAppResultRow): string =>
    hideNames ? (maskedName.get(r.id) ?? 'Student') : r.name;

  const scored = rows.filter((r) => r.best);
  const scores = scored.map((r) =>
    pct(r.best?.score ?? 0, r.best?.maxScore ?? 0)
  );
  const avgScore =
    scores.length === 0
      ? null
      : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const finished = rows.filter((r) => !r.doneOnly).length;

  const questionStats = questions.map((q) => {
    const marks = scored
      .map((r) => r.best?.items?.find((m) => m.id === q.id))
      .filter((m) => m !== undefined);
    const correct = marks.filter((m) => m.correct).length;
    return {
      q,
      correct,
      total: marks.length,
      pct: marks.length ? Math.round((correct / marks.length) * 100) : null,
    };
  });

  const toggleHideNames = () => {
    setHideNames((on) => {
      writeStored(hideKey, on ? '0' : '1');
      return !on;
    });
  };
  const changeView = (next: { sort: StudentSort; display: ScoreDisplay }) => {
    setView(next);
    writeStored(viewKey, `${next.sort}|${next.display}`);
  };

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

  const headerTitle =
    screen === 'home'
      ? title
      : screen === 'questions'
        ? 'Questions'
        : 'Students';

  const answerLines = (
    row: MiniAppResultRow,
    list: MiniAppAttemptView[]
  ): StudentQuestionLine[] => {
    const bestAttempt = list.find((a) => a.attemptNo === row.best?.attemptNo);
    if (!bestAttempt?.items) return [];
    return questions.map((q, i) => {
      const item = bestAttempt.items?.find((it) => it.id === q.id);
      const max = item?.points ?? q.points ?? 1;
      return {
        questionId: q.id,
        number: i + 1,
        text: q.prompt,
        type: 'MC',
        mark: !item
          ? 'noAnswer'
          : item.correct === true
            ? 'correct'
            : item.correct === false
              ? 'incorrect'
              : 'ungraded',
        pointsEarned: item?.earned ?? 0,
        pointsMax: max,
        answerText: answerText(item?.answer),
        correctAnswerText: null,
        manual: false,
      };
    });
  };

  const sortedRows = rows.slice().sort((a, b) => {
    const sa = a.best ? pct(a.best.score, a.best.maxScore) : -1;
    const sb = b.best ? pct(b.best.score, b.best.maxScore) : -1;
    const byName = hideNames
      ? collator.compare(shownName(a), shownName(b))
      : collator.compare(lastNameOf(a.name), lastNameOf(b.name)) ||
        collator.compare(a.name, b.name);
    return view.sort === 'lastName' ? byName || sb - sa : sb - sa || byName;
  });

  return (
    <div className="flex flex-col h-full font-sans bg-white text-brand-gray-dark relative">
      <div
        className="flex items-center bg-brand-blue-primary text-white shrink-0"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        <button
          onClick={() => (screen === 'home' ? onBack() : setScreen('home'))}
          {...tourTypeAttr('mini-app.results-back', 'miniApp')}
          aria-label="Back"
          className="rounded-md hover:bg-white/15 transition-colors"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <ArrowLeft style={HEADER_ICON} />
        </button>
        <p
          className="font-sans font-semibold truncate flex-1"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
        >
          {headerTitle}
        </p>
        <button
          type="button"
          onClick={toggleHideNames}
          {...tourTypeAttr('mini-app.results-hide-names', 'miniApp')}
          aria-pressed={hideNames}
          aria-label="Hide student names"
          title={hideNames ? 'Show student names' : 'Hide student names'}
          className="shrink-0 rounded-md hover:bg-white/15 transition-colors"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          {hideNames ? (
            <EyeOff aria-hidden style={HEADER_ICON} />
          ) : (
            <Eye aria-hidden style={HEADER_ICON} />
          )}
        </button>
        <span
          className="shrink-0 rounded-full font-sans font-semibold uppercase tracking-wider bg-white/20 text-white"
          style={{
            fontSize: 'min(10px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
          }}
        >
          Results
        </span>
      </div>

      {periodControls && (
        <div
          className="flex shrink-0 items-center border-b border-slate-200"
          style={{ padding: 'min(6px, 1.6cqmin) min(12px, 3cqmin)' }}
        >
          {periodControls}
        </div>
      )}

      {exportError && (
        <div
          className="mx-4 mt-3 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          <div className="font-bold text-center">{exportError}</div>
        </div>
      )}

      {rows.length === 0 ? (
        <ScaledEmptyState
          icon={BarChart3}
          title="No data available yet"
          subtitle="Results appear here once students submit."
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
              <div
                className="bg-brand-blue-lighter rounded-lg"
                style={{ padding: 'min(12px, 3cqmin)' }}
              >
                <p
                  className={SECTION_LABEL}
                  style={{ fontSize: 'min(10px, 3.5cqmin)' }}
                >
                  Class average
                </p>
                <p
                  className="font-sans font-bold text-brand-blue-dark tabular-nums"
                  style={{ fontSize: 'min(26px, 10cqmin)', lineHeight: 1.15 }}
                >
                  {avgScore !== null ? `${avgScore}%` : '—'}
                </p>
                <p
                  className="text-brand-blue-dark/70"
                  style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                >
                  {`${finished} of ${rows.length} students finished`}
                </p>
              </div>

              {scores.length > 0 && (
                <div
                  className="flex flex-col"
                  style={{ gap: 'min(6px, 1.5cqmin)' }}
                >
                  <p
                    className={SECTION_LABEL}
                    style={{ fontSize: 'min(10px, 3.5cqmin)' }}
                  >
                    Score distribution
                  </p>
                  {SCORE_DISTRIBUTION_BANDS.map((b) => {
                    const count = scores.filter(
                      (s) => s >= b.min && s <= b.max
                    ).length;
                    const share = Math.round((count / scores.length) * 100);
                    return (
                      <div key={b.label}>
                        <div
                          className="flex items-center justify-between"
                          style={{
                            gap: 'min(8px, 2cqmin)',
                            marginBottom: 'min(2px, 0.5cqmin)',
                          }}
                        >
                          <span
                            className="font-sans text-brand-gray-dark"
                            style={{ fontSize: 'min(12px, 4cqmin)' }}
                          >
                            {b.label}
                          </span>
                          <span
                            className="text-brand-gray-primary tabular-nums shrink-0"
                            style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                          >
                            {count} · {share}%
                          </span>
                        </div>
                        <div
                          className="bg-brand-gray-lightest rounded-full overflow-hidden"
                          style={{ height: 'min(8px, 2cqmin)' }}
                        >
                          <div
                            className={`h-full rounded-full ${b.color}`}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className="flex flex-col"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                {questions.length > 0 && (
                  <DrillRow
                    label="Questions"
                    detail={`${questions.length} question${questions.length === 1 ? '' : 's'}`}
                    onClick={() => setScreen('questions')}
                  />
                )}
                <DrillRow
                  label="Students"
                  detail={`${rows.length} student${rows.length === 1 ? '' : 's'}`}
                  onClick={() => setScreen('students')}
                />
              </div>
            </div>
          )}

          {screen === 'questions' && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {questionStats.map(({ q, correct, total, pct: p }, i) => (
                <div
                  key={q.id}
                  className={CARD}
                  style={{ padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)' }}
                >
                  <span
                    className="flex items-center justify-between"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <span
                      className={`${SECTION_LABEL} shrink-0`}
                      style={{ fontSize: 'min(10px, 3.5cqmin)' }}
                    >
                      Q{i + 1}
                    </span>
                    {p !== null && (
                      <span
                        className={`font-sans font-semibold tabular-nums shrink-0 ${scoreColorClasses(p).text}`}
                        style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                      >
                        {p}%
                      </span>
                    )}
                  </span>
                  <span
                    className="block font-sans text-brand-gray-dark wrap-break-word"
                    style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                  >
                    {q.prompt}
                  </span>
                  <div
                    className="flex items-center flex-wrap"
                    style={{
                      gap: 'min(12px, 3cqmin)',
                      marginTop: 'min(6px, 1.5cqmin)',
                    }}
                  >
                    <div
                      className="flex items-center text-emerald-700 font-sans font-medium shrink-0"
                      style={{
                        gap: 'min(4px, 1cqmin)',
                        fontSize: 'min(11px, 3.8cqmin)',
                      }}
                    >
                      <CheckCircle2
                        aria-hidden
                        style={{
                          width: 'min(13px, 4cqmin)',
                          height: 'min(13px, 4cqmin)',
                        }}
                      />
                      {correct} Correct
                    </div>
                    <div
                      className="flex items-center text-brand-red-primary font-sans font-medium shrink-0"
                      style={{
                        gap: 'min(4px, 1cqmin)',
                        fontSize: 'min(11px, 3.8cqmin)',
                      }}
                    >
                      <XCircle
                        aria-hidden
                        style={{
                          width: 'min(13px, 4cqmin)',
                          height: 'min(13px, 4cqmin)',
                        }}
                      />
                      {total - correct} Missed
                    </div>
                    <div
                      className="flex-1 bg-brand-gray-lightest rounded-full overflow-hidden min-w-0"
                      style={{ height: 'min(8px, 2cqmin)' }}
                    >
                      <div
                        className={`h-full rounded-full ${scoreColorClasses(p ?? 0).bar}`}
                        style={{ width: `${p ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {screen === 'students' && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <div
                className="flex items-center"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                <div
                  className="ml-auto flex items-center"
                  style={{ gap: 'min(8px, 2cqmin)' }}
                >
                  <SegmentedToggle
                    label="Sort students"
                    value={view.sort}
                    options={[
                      ['score', 'Score'],
                      ['lastName', 'Last name'],
                    ]}
                    onChange={(sort) => changeView({ ...view, sort })}
                  />
                  <SegmentedToggle
                    label="Show scores as"
                    value={view.display}
                    options={[
                      ['percent', '%'],
                      ['points', 'Points'],
                    ]}
                    onChange={(display) => changeView({ ...view, display })}
                  />
                </div>
              </div>
              {sortedRows.map((row) => {
                const open = openId === row.id;
                const list = attempts[row.id];
                const best = row.best;
                const score = best ? pct(best.score, best.maxScore) : 0;
                const attemptsText =
                  attemptLimit === null
                    ? `${row.attemptCount} ${row.attemptCount === 1 ? 'attempt' : 'attempts'}`
                    : `${row.attemptCount} of ${attemptLimit} attempts`;
                return (
                  <div
                    key={row.id}
                    className={`rounded-lg border bg-white ${open ? 'border-brand-blue-light' : 'border-brand-gray-lightest'}`}
                    style={{
                      padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
                    }}
                  >
                    <div
                      onClick={() => toggle(row.id)}
                      className="flex items-center justify-between cursor-pointer"
                      style={{ gap: 'min(8px, 2cqmin)' }}
                    >
                      <div
                        className="flex items-center min-w-0"
                        style={{ gap: 'min(6px, 1.5cqmin)' }}
                      >
                        {/* no-tour-anchor: per-student row expander */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(row.id);
                          }}
                          aria-expanded={open}
                          className="flex items-center min-w-0 text-left rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
                          style={{ gap: 'min(4px, 1cqmin)' }}
                        >
                          <ChevronRight
                            aria-hidden
                            className={`shrink-0 text-brand-gray-primary transition-transform ${open ? 'rotate-90' : ''}`}
                            style={SMALL_ICON}
                          />
                          <span
                            className="font-sans font-medium text-brand-gray-dark truncate"
                            style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                          >
                            {shownName(row)}
                          </span>
                        </button>
                        {best?.gradedBy === 'app' && <FromApp />}
                      </div>
                      <div className="text-right shrink-0">
                        {best ? (
                          <>
                            <ScorePill
                              score={score}
                              display={
                                view.display === 'points' ? 'points' : 'percent'
                              }
                              points={Number(num(best.score))}
                              total={Number(num(best.maxScore))}
                            />
                            <p
                              className="text-brand-gray-primary tabular-nums"
                              style={{ fontSize: 'min(10px, 3cqmin)' }}
                            >
                              {view.display === 'points'
                                ? `${score}%`
                                : `${num(best.score)}/${num(best.maxScore)} pts`}
                              {` · ${attemptsText}`}
                            </p>
                          </>
                        ) : (
                          <>
                            <span
                              className="font-black tabular-nums text-slate-400"
                              style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                            >
                              —
                            </span>
                            <p
                              className="text-brand-gray-primary"
                              style={{ fontSize: 'min(10px, 3cqmin)' }}
                            >
                              {row.doneOnly ? 'Done' : attemptsText}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {open && (
                      <div style={{ marginTop: 'min(8px, 2cqmin)' }}>
                        {list === 'loading' || list === undefined ? (
                          <p
                            className="flex items-center text-brand-gray-primary"
                            style={{ ...SMALL_TEXT, gap: 'min(6px, 1.5cqmin)' }}
                          >
                            <Loader2
                              className="animate-spin"
                              style={SMALL_ICON}
                            />
                            Loading…
                          </p>
                        ) : list === 'error' ? (
                          <p
                            className="text-brand-red-primary"
                            style={SMALL_TEXT}
                          >
                            Could not load attempts.
                          </p>
                        ) : (
                          <>
                            {answerLines(row, list).length > 0 && (
                              <ol
                                className="flex flex-col"
                                style={{ gap: 'min(8px, 2cqmin)' }}
                              >
                                {answerLines(row, list).map((line) => (
                                  <StudentAnswerLine
                                    key={line.questionId}
                                    line={line}
                                  />
                                ))}
                              </ol>
                            )}
                            {list.length === 0 &&
                              row.legacyPayload !== undefined && (
                                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                                  {JSON.stringify(row.legacyPayload, null, 2)}
                                </pre>
                              )}
                            {list.length > 0 && (
                              <div style={{ marginTop: 'min(10px, 2.5cqmin)' }}>
                                <p
                                  className={SECTION_LABEL}
                                  style={{ fontSize: 'min(10px, 3.5cqmin)' }}
                                >
                                  Attempts
                                </p>
                                <ul>
                                  {list.map((a) => (
                                    <li
                                      key={a.attemptNo}
                                      className="flex flex-wrap items-baseline border-b border-brand-gray-lightest last:border-b-0 text-brand-gray-dark"
                                      style={{
                                        ...SMALL_TEXT,
                                        columnGap: 'min(12px, 3cqmin)',
                                        paddingBlock: 'min(4px, 1cqmin)',
                                      }}
                                    >
                                      <span className="font-semibold">
                                        Attempt {a.attemptNo}
                                      </span>
                                      {a.score !== undefined &&
                                        a.maxScore !== undefined && (
                                          <span className="tabular-nums">
                                            {view.display === 'points'
                                              ? `${num(a.score)}/${num(a.maxScore)}`
                                              : `${pct(a.score, a.maxScore)}%`}
                                          </span>
                                        )}
                                      {a.attemptNo === best?.attemptNo && (
                                        <span className="font-semibold text-emerald-700">
                                          Best
                                        </span>
                                      )}
                                      <span className="text-brand-gray-primary">
                                        {formatTime(a.submittedAt)}
                                      </span>
                                      {a.rawPayload !== undefined && (
                                        <pre className="mt-1 w-full max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                                          {JSON.stringify(
                                            a.rawPayload,
                                            null,
                                            2
                                          )}
                                        </pre>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {list.length === 0 &&
                              row.legacyPayload === undefined && (
                                <p
                                  className="text-brand-gray-primary"
                                  style={SMALL_TEXT}
                                >
                                  No graded attempts.
                                </p>
                              )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {screen === 'home' && onExport && (
        <div
          className="flex items-center border-t border-brand-gray-lightest shrink-0"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          {exportUrl ? (
            <a
              href={exportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center bg-white border border-brand-gray-lighter hover:border-brand-blue-light text-brand-blue-primary font-sans font-semibold rounded-md transition-colors"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
                fontSize: 'min(13px, 4.5cqmin)',
              }}
            >
              <ExternalLink
                style={{
                  width: 'min(14px, 4.5cqmin)',
                  height: 'min(14px, 4.5cqmin)',
                }}
              />
              Open Sheet
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void handleExport()}
              {...tourTypeAttr('mini-app.results-export-sheet', 'miniApp')}
              disabled={exporting || rows.length === 0}
              className="inline-flex items-center bg-white border border-brand-gray-lighter hover:border-brand-blue-light text-brand-blue-primary font-sans font-semibold rounded-md transition-colors disabled:opacity-60"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
                fontSize: 'min(13px, 4.5cqmin)',
              }}
            >
              {exporting ? (
                <Loader2
                  className="animate-spin"
                  style={{
                    width: 'min(14px, 4.5cqmin)',
                    height: 'min(14px, 4.5cqmin)',
                  }}
                />
              ) : (
                <FileSpreadsheet
                  style={{
                    width: 'min(14px, 4.5cqmin)',
                    height: 'min(14px, 4.5cqmin)',
                  }}
                />
              )}
              Export to Sheets
            </button>
          )}
        </div>
      )}
    </div>
  );
};
