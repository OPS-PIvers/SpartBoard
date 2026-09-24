// Catalog tile selectors: participation per assessment.

import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMember,
} from '@/types';
import { schoolYearStart } from '@/utils/plcHomeTime';
import { assessmentRunDate } from './resultsSelectors';

export interface ParticipationRow {
  assessmentId: string;
  title: string;
  date: number;
  ranCount: number;
  expectedCount: number;
}

/** Assessments this school year, newest first, with how many teachers ran each. */
export function participationRows(params: {
  aggregates: readonly PlcAssessmentAggregate[];
  assessments: readonly PlcCommonAssessment[];
  members: readonly PlcMember[];
  now: number;
}): ParticipationRow[] {
  const { aggregates, assessments, members, now } = params;
  const byId = new Map(aggregates.map((a) => [a.assessmentId, a]));
  const teachers = members.filter((m) => m.role !== 'viewer');
  const start = schoolYearStart(now);
  return assessments
    .filter((a) => a.deletedAt == null && assessmentRunDate(a) >= start)
    .map((a) => {
      const ran = new Set(byId.get(a.id)?.contributorUids ?? []);
      const expectedCount = Math.max(teachers.length, ran.size);
      return {
        assessmentId: a.id,
        title: a.title,
        date: assessmentRunDate(a),
        ranCount: ran.size,
        expectedCount,
      };
    })
    .sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
}
