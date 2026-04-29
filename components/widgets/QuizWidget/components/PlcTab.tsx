/**
 * PlcTab — cross-teacher aggregate view of a PLC's quiz results.
 *
 * Renders only when the active assignment is in PLC mode (Share-with-PLC
 * enabled). The teacher's own class data lives in the Overview / Questions /
 * Students tabs; this tab is the consolidated view across every PLC peer
 * who exported to the same shared sheet, so a teacher can compare their
 * own class average and per-question accuracy against the PLC-wide numbers.
 *
 * Data source is the shared Google Sheet itself (via `readPlcSheet`), not
 * Firestore — every peer's exports already land there, and reading it
 * directly avoids a separate cross-tenant aggregation channel. Per-teacher
 * and per-period filtering is intentionally NOT exposed here: if a teacher
 * needs that level of detail, they open the sheet itself. This tab keeps
 * the focus on aggregate signal.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Trophy,
  Users,
  Target,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import type { QuizQuestion } from '@/types';
import { QuizDriveService, type PlcSheetRow } from '@/utils/quizDriveService';

interface PlcTabProps {
  plcSheetUrl: string;
  googleAccessToken: string | null;
  questions: QuizQuestion[];
}

interface PlcAggregate {
  totalCompleted: number;
  totalTeachers: number;
  averageScore: number | null;
  buckets: {
    label: string;
    min: number;
    max: number;
    color: string;
    count: number;
  }[];
  perQuestion: {
    answered: number;
    correct: number;
    percent: number;
  }[];
}

const SCORE_BUCKETS = [
  {
    label: '90-100%',
    min: 90,
    max: 100,
    color: 'bg-emerald-500 shadow-emerald-500/20',
  },
  {
    label: '80-89%',
    min: 80,
    max: 89,
    color: 'bg-blue-500 shadow-blue-500/20',
  },
  {
    label: '60-79%',
    min: 60,
    max: 79,
    color: 'bg-amber-500 shadow-amber-500/20',
  },
  {
    label: '0-59%',
    min: 0,
    max: 59,
    color: 'bg-brand-red-primary shadow-brand-red-primary/20',
  },
] as const;

function aggregate(
  rows: PlcSheetRow[],
  questions: QuizQuestion[]
): PlcAggregate {
  const completed = rows.filter((r) => r.status === 'completed');
  const teachers = new Set<string>();
  let scoreSum = 0;
  let scoreCount = 0;
  const bucketCounts = SCORE_BUCKETS.map(() => 0);

  for (const r of completed) {
    if (r.teacher) teachers.add(r.teacher);
    // scorePercent is rendered as "67%"; parse leniently — a missing or
    // malformed cell drops out of the average rather than poisoning it.
    const numeric = parseInt(r.scorePercent.replace('%', '').trim(), 10);
    if (Number.isFinite(numeric)) {
      scoreSum += numeric;
      scoreCount++;
      const bucketIdx = SCORE_BUCKETS.findIndex(
        (b) => numeric >= b.min && numeric <= b.max
      );
      if (bucketIdx >= 0) bucketCounts[bucketIdx]++;
    }
  }

  const perQuestion = questions.map((_q, qi) => {
    let answered = 0;
    let correct = 0;
    for (const r of completed) {
      const cell = r.questionAnswers[qi] ?? '';
      if (cell === '') continue;
      answered++;
      // The export writes '0' for incorrect and the points value for
      // correct, so anything non-empty and non-'0' is a correct answer.
      if (cell !== '0') correct++;
    }
    const percent = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return { answered, correct, percent };
  });

  return {
    totalCompleted: completed.length,
    totalTeachers: teachers.size,
    averageScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    buckets: SCORE_BUCKETS.map((b, i) => ({ ...b, count: bucketCounts[i] })),
    perQuestion,
  };
}

export const PlcTab: React.FC<PlcTabProps> = ({
  plcSheetUrl,
  googleAccessToken,
  questions,
}) => {
  const [rows, setRows] = useState<PlcSheetRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(!!googleAccessToken);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Bumped on Retry; combined with the URL into the fetch identity below
  // so manual retries re-run the effect.
  const [reloadToken, setReloadToken] = useState(0);

  // Adjust state during render when the fetch identity changes (URL change,
  // token change, or Retry click). This resets rows/loading/error in the
  // same commit as the prop change instead of through a useEffect →
  // setState round-trip, satisfying react-hooks/set-state-in-effect.
  const fetchKey = `${plcSheetUrl}::${googleAccessToken ?? ''}::${reloadToken}`;
  const [lastFetchKey, setLastFetchKey] = useState(fetchKey);
  if (fetchKey !== lastFetchKey) {
    setLastFetchKey(fetchKey);
    setRows(null);
    setFetchError(null);
    setLoading(!!googleAccessToken);
  }

  // Render-derived: a missing OAuth token is a synchronous "we can't
  // fetch" condition, not effect-driven state. Surfacing it inline keeps
  // the auth-prompt visible from mount.
  const error = !googleAccessToken
    ? 'Sign in with Google to load PLC results.'
    : fetchError;

  useEffect(() => {
    if (!googleAccessToken) return;
    let cancelled = false;
    const svc = new QuizDriveService(googleAccessToken);
    svc
      .readPlcSheet(plcSheetUrl)
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Could not load PLC results from the shared sheet.';
        setFetchError(message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plcSheetUrl, googleAccessToken, reloadToken]);

  const data = useMemo(
    () => (rows ? aggregate(rows, questions) : null),
    [rows, questions]
  );

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ minHeight: 'min(200px, 30cqmin)', gap: 'min(8px, 2cqmin)' }}
      >
        <Loader2
          className="text-brand-blue-primary animate-spin"
          style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
        />
        <span
          className="text-brand-blue-primary/60 font-bold"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          Loading PLC results…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-brand-red-primary/20 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-red-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p
              className="font-black text-brand-blue-dark uppercase tracking-widest mb-1"
              style={{ fontSize: 'min(11px, 3.5cqmin)' }}
            >
              Couldn&apos;t load PLC results
            </p>
            <p
              className="text-brand-blue-dark/80"
              style={{ fontSize: 'min(13px, 4cqmin)' }}
            >
              {error}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setReloadToken((t) => t + 1)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary text-white font-bold rounded-lg hover:bg-brand-blue-dark transition-colors"
                style={{ fontSize: 'min(12px, 3.5cqmin)' }}
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
              <a
                href={plcSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-brand-blue-primary font-bold hover:underline"
                style={{ fontSize: 'min(12px, 3.5cqmin)' }}
              >
                Open sheet
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.totalCompleted === 0) {
    return (
      <div className="bg-white border border-brand-blue-primary/10 rounded-2xl p-8 text-center shadow-sm">
        <Users
          className="text-brand-blue-primary/30 mx-auto mb-3"
          style={{ width: 'min(40px, 10cqmin)', height: 'min(40px, 10cqmin)' }}
        />
        <p
          className="font-black text-brand-blue-dark uppercase tracking-widest"
          style={{ fontSize: 'min(12px, 3.5cqmin)' }}
        >
          Waiting for PLC results
        </p>
        <p
          className="text-brand-blue-primary/60 mt-2"
          style={{ fontSize: 'min(13px, 4cqmin)' }}
        >
          Once your PLC peers run their classes, their results will land in the
          shared sheet and appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 'min(20px, 5cqmin)' }}>
      {/* Hero — PLC-wide totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-4 text-center shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-400"></div>
          <Trophy
            className="text-amber-400 mx-auto mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
          <p
            className="font-black text-brand-blue-dark leading-none"
            style={{ fontSize: 'min(28px, 9cqmin)' }}
          >
            {data.averageScore !== null ? `${data.averageScore}%` : '—'}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            PLC Average
          </p>
        </div>
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-4 text-center shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-blue-primary"></div>
          <Users
            className="text-brand-blue-primary mx-auto mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
          <p
            className="font-black text-brand-blue-dark leading-none"
            style={{ fontSize: 'min(28px, 9cqmin)' }}
          >
            {data.totalCompleted}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            Students
          </p>
        </div>
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-4 text-center shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
          <Target
            className="text-emerald-500 mx-auto mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
          <p
            className="font-black text-brand-blue-dark leading-none"
            style={{ fontSize: 'min(28px, 9cqmin)' }}
          >
            {data.totalTeachers}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            {data.totalTeachers === 1 ? 'Teacher' : 'Teachers'}
          </p>
        </div>
      </div>

      {/* Distribution Chart — same buckets/colors as OverviewTab for visual continuity */}
      <div className="bg-white border border-brand-blue-primary/10 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-brand-blue-primary" />
          <span
            className="font-black text-brand-blue-dark uppercase tracking-widest"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Score Distribution (PLC)
          </span>
        </div>
        <div className="space-y-4">
          {data.buckets.map((b) => {
            const pct =
              data.totalCompleted > 0
                ? Math.round((b.count / data.totalCompleted) * 100)
                : 0;
            return (
              <div key={b.label}>
                <div
                  className="flex items-center justify-between mb-1.5 font-bold"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  <span className="text-brand-blue-dark">{b.label}</span>
                  <span className="text-brand-blue-primary/60">
                    {b.count} {b.count === 1 ? 'Student' : 'Students'} ({pct}%)
                  </span>
                </div>
                <div className="h-3 bg-brand-blue-lighter rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full ${b.color} rounded-full transition-all duration-1000 shadow-lg`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-question breakdown — same card visual as QuestionsTab */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Target className="w-4 h-4 text-brand-blue-primary" />
          <span
            className="font-black text-brand-blue-dark uppercase tracking-widest"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Per-Question Accuracy (PLC)
          </span>
        </div>
        {questions.map((q, i) => {
          const stats = data.perQuestion[i];
          return (
            <div
              key={q.id}
              className="bg-white border border-brand-blue-primary/10 rounded-2xl p-4 shadow-sm hover:border-brand-blue-primary/20 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div
                  className="bg-brand-blue-lighter px-2 py-0.5 rounded text-brand-blue-primary font-black uppercase tracking-tighter"
                  style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                >
                  Question {i + 1}
                </div>
                <div
                  className="font-black text-brand-blue-dark"
                  style={{ fontSize: 'min(12px, 4cqmin)' }}
                >
                  {stats.percent}% Accuracy
                </div>
              </div>
              <p
                className="font-bold text-brand-blue-dark leading-tight line-clamp-2"
                style={{ fontSize: 'min(13px, 4.5cqmin)' }}
              >
                {q.text}
              </p>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-brand-blue-primary/5">
                <div
                  className="flex items-center gap-1.5 text-emerald-600 font-bold"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  <CheckCircle2
                    style={{
                      width: 'min(14px, 4cqmin)',
                      height: 'min(14px, 4cqmin)',
                    }}
                  />
                  {stats.correct} Correct
                </div>
                <div
                  className="flex items-center gap-1.5 text-brand-red-primary font-bold"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  <XCircle
                    style={{
                      width: 'min(14px, 4cqmin)',
                      height: 'min(14px, 4cqmin)',
                    }}
                  />
                  {stats.answered - stats.correct} Missed
                </div>
              </div>
              <div className="h-2 bg-brand-blue-lighter rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${stats.percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
