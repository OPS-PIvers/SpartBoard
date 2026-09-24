// Catalog tile selectors: participation per assessment and the per-teacher breakdown.

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
  /** Teachers who have not run it; filled only when names may show (showPerTeacher). */
  notRanNames: string[];
}

export interface PerTeacherBar {
  teacherUid: string;
  teacherName: string;
  averagePercent: number;
  classCount: number;
  studentCount: number;
}

function memberName(member: PlcMember): string {
  const display = member.displayName.trim();
  return display !== '' ? display : member.email;
}

/** Assessments this school year, newest first, with how many teachers ran each. */
export function participationRows(params: {
  aggregates: readonly PlcAssessmentAggregate[];
  assessments: readonly PlcCommonAssessment[];
  members: readonly PlcMember[];
  now: number;
  withNames: boolean;
}): ParticipationRow[] {
  const { aggregates, assessments, members, now, withNames } = params;
  const byId = new Map(aggregates.map((a) => [a.assessmentId, a]));
  const teachers = members.filter((m) => m.role !== 'viewer');
  const start = schoolYearStart(now);
  return assessments
    .filter((a) => a.deletedAt == null && assessmentRunDate(a) >= start)
    .map((a) => {
      const ran = new Set(
        (byId.get(a.id)?.perTeacher ?? []).map((p) => p.teacherUid)
      );
      const expectedCount = Math.max(teachers.length, ran.size);
      return {
        assessmentId: a.id,
        title: a.title,
        date: assessmentRunDate(a),
        ranCount: ran.size,
        expectedCount,
        notRanNames: withNames
          ? teachers.filter((m) => !ran.has(m.uid)).map(memberName)
          : [],
      };
    })
    .sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
}

/** The chosen assessment's aggregate, else the newest assessment that has results. */
export function pickPerTeacherAggregate(params: {
  aggregates: readonly PlcAssessmentAggregate[];
  assessments: readonly PlcCommonAssessment[];
  assessmentId?: string;
}): {
  assessment: PlcCommonAssessment;
  aggregate: PlcAssessmentAggregate;
} | null {
  const { aggregates, assessments, assessmentId } = params;
  const byId = new Map(aggregates.map((a) => [a.assessmentId, a]));
  const live = assessments.filter(
    (a) => a.deletedAt == null && (byId.get(a.id)?.perTeacher.length ?? 0) > 0
  );
  const chosen = assessmentId
    ? live.find((a) => a.id === assessmentId)
    : undefined;
  const assessment =
    chosen ??
    [...live].sort((a, b) => assessmentRunDate(b) - assessmentRunDate(a))[0];
  const aggregate = assessment ? byId.get(assessment.id) : undefined;
  return assessment && aggregate ? { assessment, aggregate } : null;
}

/** One bar per teacher, highest average first. */
export function perTeacherBars(
  aggregate: PlcAssessmentAggregate
): PerTeacherBar[] {
  return aggregate.perTeacher
    .map((p) => ({
      teacherUid: p.teacherUid,
      teacherName: p.teacherName,
      averagePercent: p.averagePercent,
      classCount: p.classCount,
      studentCount: p.studentCount,
    }))
    .sort(
      (a, b) =>
        b.averagePercent - a.averagePercent ||
        a.teacherName.localeCompare(b.teacherName)
    );
}
