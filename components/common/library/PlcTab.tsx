/**
 * PlcTab — cross-teacher aggregate view of a PLC's results.
 *
 * Reads `/plcs/{plcId}/contributions/*` via Firestore `onSnapshot`. Each
 * PLC member's `QuizResults` auto-publishes a contribution doc the first
 * time she views her results — no Google Sheet roundtrip, no manual
 * export step, no schema-mismatch error. Real-time across all members.
 *
 * When teammates are on different versions of a synced quiz (or copy-mode
 * divergence has left their local question lists out of sync), the tab
 * groups contributions by exact question-id sequence and renders one
 * aggregate card per version with a "members are on different versions"
 * banner. That's option (a) from the design discussion — show the data
 * side-by-side instead of trying to merge mismatched columns.
 */

import React, { useMemo } from 'react';
import {
  Trophy,
  Users,
  Target,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import type { PlcContribution, PlcContributionQuestion } from '@/types';
import { usePlcContributions } from '@/hooks/usePlcContributions';

interface PlcTabProps {
  /** PLC doc id; null disables the tab (caller should not render in that case). */
  plcId: string;
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

interface SchemaGroup {
  /** Stable key (joined question ids) — drives React reconciliation. */
  schemaKey: string;
  questions: PlcContributionQuestion[];
  teachers: { uid: string; name: string }[];
  contributions: PlcContribution[];
  aggregate: PlcAggregate;
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

/**
 * Aggregate one schema group's contributions into the stats the cards
 * render. Per-question stats are indexed positionally against the group's
 * `questions` — safe because all contributions in the group share the
 * exact same question-id sequence (that's the grouping invariant).
 */
function aggregateGroup(
  contributions: PlcContribution[],
  questions: PlcContributionQuestion[]
): PlcAggregate {
  const teacherUids = new Set<string>();
  let totalCompleted = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  const bucketCounts = SCORE_BUCKETS.map(() => 0);
  const perQuestion = questions.map(() => ({ answered: 0, correct: 0 }));

  for (const c of contributions) {
    teacherUids.add(c.teacherUid);
    for (const r of c.responses) {
      if (r.status !== 'completed') continue;
      totalCompleted++;
      const score = r.scorePercent;
      if (typeof score === 'number') {
        scoreSum += score;
        scoreCount++;
        const idx = SCORE_BUCKETS.findIndex(
          (b) => score >= b.min && score <= b.max
        );
        if (idx >= 0) bucketCounts[idx]++;
      }
      questions.forEach((q, qi) => {
        const points = r.pointsByQuestionId[q.id];
        if (points === undefined) return;
        perQuestion[qi].answered++;
        if (points > 0) perQuestion[qi].correct++;
      });
    }
  }

  return {
    totalCompleted,
    totalTeachers: teacherUids.size,
    averageScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    buckets: SCORE_BUCKETS.map((b, i) => ({ ...b, count: bucketCounts[i] })),
    perQuestion: perQuestion.map((p) => ({
      ...p,
      percent: p.answered > 0 ? Math.round((p.correct / p.answered) * 100) : 0,
    })),
  };
}

/**
 * Bucket contributions by exact question-id sequence — that's the
 * alignment-by-position invariant the per-question stats rely on. Two
 * teammates whose synced quiz drifted by even one question id end up in
 * separate groups, so we can render them side-by-side with a banner
 * instead of silently misaligning columns.
 */
function groupBySchema(contributions: PlcContribution[]): SchemaGroup[] {
  const groups = new Map<string, PlcContribution[]>();
  for (const c of contributions) {
    const key = c.questionsSnapshot.map((q) => q.id).join('|') || '∅';
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }
  // Sort groups by contributor count (desc) — the "majority schema" reads
  // top so the most representative aggregate is what the eye lands on
  // first.
  const sorted = Array.from(groups.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );
  return sorted.map(([schemaKey, members]) => {
    const teachers = Array.from(
      new Map(members.map((m) => [m.teacherUid, m.teacherName])).entries()
    )
      .map(([uid, name]) => ({ uid, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const questions = members[0]?.questionsSnapshot ?? [];
    return {
      schemaKey,
      questions,
      teachers,
      contributions: members,
      aggregate: aggregateGroup(members, questions),
    };
  });
}

export const PlcTab: React.FC<PlcTabProps> = ({ plcId }) => {
  const { contributions, loading, error } = usePlcContributions(plcId);

  const groups = useMemo(() => groupBySchema(contributions), [contributions]);
  const totalCompletedAcrossGroups = useMemo(
    () => groups.reduce((sum, g) => sum + g.aggregate.totalCompleted, 0),
    [groups]
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
          <AlertCircle
            className="text-brand-red-primary flex-shrink-0 mt-0.5"
            style={{ width: 'min(20px, 5cqmin)', height: 'min(20px, 5cqmin)' }}
          />
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
          </div>
        </div>
      </div>
    );
  }

  if (groups.length === 0 || totalCompletedAcrossGroups === 0) {
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
          Once your PLC peers run their classes and view their results, their
          data will appear here automatically.
        </p>
      </div>
    );
  }

  const hasSchemaDrift = groups.length > 1;

  return (
    <div className="flex flex-col" style={{ gap: 'min(20px, 5cqmin)' }}>
      {hasSchemaDrift && (
        <div
          className="bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-sm flex items-start gap-3"
          role="alert"
        >
          <AlertTriangle
            className="text-amber-600 flex-shrink-0 mt-0.5"
            style={{ width: 'min(20px, 5cqmin)', height: 'min(20px, 5cqmin)' }}
          />
          <div className="flex-1">
            <p
              className="font-black text-amber-900 uppercase tracking-widest mb-1"
              style={{ fontSize: 'min(11px, 3.5cqmin)' }}
            >
              Members are on different versions of this quiz
            </p>
            <p
              className="text-amber-900/80"
              style={{ fontSize: 'min(12px, 4cqmin)' }}
            >
              Aggregates are computed per version below. To merge, ask everyone
              to re-sync the quiz from the PLC library so they share the same
              questions.
            </p>
          </div>
        </div>
      )}

      {groups.map((group, groupIdx) => (
        <PlcAggregateSection
          key={group.schemaKey}
          group={group}
          showHeader={hasSchemaDrift}
          groupNumber={groupIdx + 1}
        />
      ))}
    </div>
  );
};

interface PlcAggregateSectionProps {
  group: SchemaGroup;
  showHeader: boolean;
  groupNumber: number;
}

const PlcAggregateSection: React.FC<PlcAggregateSectionProps> = ({
  group,
  showHeader,
  groupNumber,
}) => {
  const { aggregate, questions, teachers } = group;
  return (
    <section className="flex flex-col" style={{ gap: 'min(16px, 4cqmin)' }}>
      {showHeader && (
        <header
          className="bg-white border border-brand-blue-primary/10 rounded-2xl p-3 shadow-sm"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          <p
            className="font-black text-brand-blue-primary uppercase tracking-widest mb-1"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Version {groupNumber} · {questions.length} question
            {questions.length === 1 ? '' : 's'}
          </p>
          <p className="text-brand-blue-dark/80 font-bold">
            {teachers.map((t) => t.name).join(', ')}
          </p>
        </header>
      )}

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
            {aggregate.averageScore !== null
              ? `${aggregate.averageScore}%`
              : '—'}
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
            {aggregate.totalCompleted}
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
            {aggregate.totalTeachers}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            {aggregate.totalTeachers === 1 ? 'Teacher' : 'Teachers'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-brand-blue-primary/10 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Target
            className="text-brand-blue-primary"
            style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}
          />
          <span
            className="font-black text-brand-blue-dark uppercase tracking-widest"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Score Distribution (PLC)
          </span>
        </div>
        <div className="space-y-4">
          {aggregate.buckets.map((b) => {
            const pct =
              aggregate.totalCompleted > 0
                ? Math.round((b.count / aggregate.totalCompleted) * 100)
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

      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Target
            className="text-brand-blue-primary"
            style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}
          />
          <span
            className="font-black text-brand-blue-dark uppercase tracking-widest"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Per-Question Accuracy (PLC)
          </span>
        </div>
        {questions.map((q, i) => {
          const stats = aggregate.perQuestion[i];
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
    </section>
  );
};
