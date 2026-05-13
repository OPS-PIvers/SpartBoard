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
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { type SchemaGroup, groupBySchema } from './plcAnalyticsAggregate';

interface PlcTabProps {
  /** PLC doc id; null disables the tab (caller should not render in that case). */
  plcId: string;
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

  // Three empty-state cases worth disambiguating for the teacher:
  //   1. No contributions yet — nobody's opened her Results screen.
  //   2. Contributions exist but every response is still in-progress —
  //      peers ran sessions and saw their results but no kid has finished
  //      yet (the aggregate only reflects completed responses).
  //   3. Should-not-happen (contributions exist, completed > 0, but the
  //      group-aggregate still reports 0) — defensive; folds into case 1.
  if (groups.length === 0) {
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
  if (totalCompletedAcrossGroups === 0) {
    const inProgressContributors = new Set(
      groups
        .flatMap((g) => g.contributions)
        .filter((c) => c.responses.length > 0)
        .map((c) => c.teacherUid)
    );
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
          PLC sessions still in progress
        </p>
        <p
          className="text-brand-blue-primary/60 mt-2"
          style={{ fontSize: 'min(13px, 4cqmin)' }}
        >
          {inProgressContributors.size}{' '}
          {inProgressContributors.size === 1 ? 'teacher has' : 'teachers have'}{' '}
          run sessions but no students have finished yet — aggregates appear
          once the first completion lands.
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
              Aggregates are computed per version below. The quiz schema
              diverged across members (added / removed / renamed questions). To
              merge into a single aggregate, members on the older version need
              to re-import the quiz from the PLC library and re-run the affected
              sessions on the current schema.
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

export const PlcAggregateSection: React.FC<PlcAggregateSectionProps> = ({
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
