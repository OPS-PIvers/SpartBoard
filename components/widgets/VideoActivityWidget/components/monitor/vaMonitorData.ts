// Pure helpers for the Video Activity monitor (monitor-parity layout).

import type { VideoActivityQuestion, VideoActivityResponse } from '@/types';
import type { BucketKey } from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import type {
  MonitorFilterBy,
  MonitorSortBy,
  SortableStudent,
} from '@/components/widgets/QuizWidget/components/monitor/monitorUtils';
import {
  compareStudents,
  matchesFilter,
} from '@/components/widgets/QuizWidget/components/monitor/monitorUtils';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';
import {
  canScoreVideoActivityResponse,
  computeVideoActivityScorePct,
  gradeVideoActivityAnswer,
} from '@/utils/videoActivityGrading';
import { isVaResponseCompleted } from '@/utils/videoActivityState';
import { staffResultsLabel } from '@/utils/staffAudience';

export type VaMark = 'correct' | 'wrong' | 'open';

export interface VaMonitorStudent {
  response: VideoActivityResponse;
  key: string;
  name: string;
  bucket: BucketKey;
  /** One mark per keyed question, in question order. */
  marks: VaMark[];
  /** Percent score once done and the key has loaded; null otherwise. */
  score: number | null;
  tabWarnings: number;
}

/** Done once submitted; not started until the first answer. */
export function vaBucketOf(
  r: Pick<VideoActivityResponse, 'completedAt' | 'answers'>
): BucketKey {
  if (isVaResponseCompleted(r)) return 'done';
  return r.answers.length > 0 ? 'inProgress' : 'notStarted';
}

/** The class a response belongs to, by its own label or its class id. */
export function vaResponsePeriod(
  r: Pick<VideoActivityResponse, 'classPeriod' | 'classId'>,
  classPeriodByClassId: Record<string, string> | undefined
): string | undefined {
  return (
    r.classPeriod ?? (r.classId ? classPeriodByClassId?.[r.classId] : undefined)
  );
}

export function buildVaStudent(
  r: VideoActivityResponse,
  questions: VideoActivityQuestion[],
  name: string
): VaMonitorStudent {
  const first = selectRepresentativeAnswers(r.answers);
  const marks = questions.map<VaMark>((q) => {
    const a = first.get(q.id);
    if (a === undefined) return 'open';
    return gradeVideoActivityAnswer(q, a.answer).isCorrect
      ? 'correct'
      : 'wrong';
  });
  const bucket = vaBucketOf(r);
  return {
    response: r,
    key: r._responseKey ?? r.studentUid,
    name: staffResultsLabel(r) ?? name,
    bucket,
    marks,
    score:
      bucket === 'done' && canScoreVideoActivityResponse(questions, r.answers)
        ? computeVideoActivityScorePct(questions, r.answers)
        : null,
    tabWarnings: r.tabSwitchWarnings ?? 0,
  };
}

const sortable = (s: VaMonitorStudent): SortableStudent => ({
  name: s.name,
  status:
    s.bucket === 'done'
      ? 'completed'
      : s.bucket === 'inProgress'
        ? 'in-progress'
        : 'joined',
  score: s.score,
  tabWarnings: s.tabWarnings,
});

/** One bucket's rows, filtered and sorted the way the Quiz monitor does. */
export function vaRosterRows(
  students: VaMonitorStudent[],
  sortBy: MonitorSortBy,
  filterBy: MonitorFilterBy
): VaMonitorStudent[] {
  return students
    .filter((s) => matchesFilter(sortable(s), filterBy))
    .sort((a, b) => compareStudents(sortable(a), sortable(b), sortBy));
}
