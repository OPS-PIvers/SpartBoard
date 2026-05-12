/**
 * Pure aggregation helpers for PLC contributions. Lifted out of `PlcTab.tsx`
 * so the cross-quiz `PlcAnalyticsBody` can reuse the same math without
 * tripping `react-refresh/only-export-components` on the component file.
 *
 * The two callers of these helpers:
 *   - `PlcTab` — single-quiz schema-drift view (rendered inside QuizResults).
 *   - `PlcAnalyticsBody` — cross-quiz PLC dashboard analytics.
 *
 * Both group by exact question-id sequence so per-question stats can index
 * positionally without misaligning columns when teammates' synced quizzes
 * have drifted.
 */

import type { PlcContribution, PlcContributionQuestion } from '@/types';

export interface PlcAggregate {
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

export interface SchemaGroup {
  /** Stable key (joined question ids) — drives React reconciliation. */
  schemaKey: string;
  questions: PlcContributionQuestion[];
  teachers: { uid: string; name: string }[];
  contributions: PlcContribution[];
  aggregate: PlcAggregate;
}

export const SCORE_BUCKETS = [
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
export function aggregateGroup(
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
    for (const r of c.responses) {
      if (r.status !== 'completed') continue;
      // Only count teachers who actually contributed *completed* data to
      // this aggregate. Counting at the contribution-doc level would
      // inflate "X teachers" for any teacher who auto-published a doc
      // with all-in-progress (or zero) responses — the rest of the
      // aggregate (totalCompleted / averageScore / per-question stats)
      // already excludes those rows, so the headline count would be
      // inconsistent with the body.
      teacherUids.add(c.teacherUid);
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

// Use NUL as the join separator rather than a printable character so the
// schema key is collision-free regardless of how question IDs are formed.
// Today's IDs are UUIDs (no separator chars), but the old `|` separator
// would silently merge `['a|b', 'c']` with `['a', 'b|c']` if the ID
// format ever changes (numeric, slug, etc.). Firestore field names don't
// permit NUL bytes, so this can't collide with a real ID.
const SCHEMA_KEY_SEPARATOR = '\x00';
const EMPTY_SCHEMA_KEY = '__empty__';

/**
 * Bucket contributions by exact question-id sequence — that's the
 * alignment-by-position invariant the per-question stats rely on. Two
 * teammates whose synced quiz drifted by even one question id end up in
 * separate groups, so the caller can render them side-by-side with a
 * banner instead of silently misaligning columns.
 */
export function groupBySchema(contributions: PlcContribution[]): SchemaGroup[] {
  const groups = new Map<string, PlcContribution[]>();
  for (const c of contributions) {
    const key =
      c.questionsSnapshot.map((q) => q.id).join(SCHEMA_KEY_SEPARATOR) ||
      EMPTY_SCHEMA_KEY;
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
