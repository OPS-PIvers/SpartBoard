import type { ClassroomAttachmentLink } from '@/types';
import type { ClassroomGradeEntry } from '@/utils/classroomGradePush';
import { getClassroomAttachments } from '@/utils/classroomAttachments';
import type {
  FinalScore,
  GradebookColumnConfig,
  GradebookKind,
} from '@/utils/gradebook/gradebookCore';

/** Kinds that have a Classroom or Schoology grade push today. */
export type GradebookPushKind = Extract<
  GradebookKind,
  'quiz' | 'video-activity'
>;

export function isGradebookPushKind(
  kind: GradebookKind
): kind is GradebookPushKind {
  return kind === 'quiz' || kind === 'video-activity';
}

export type GradebookLmsLink =
  | { lms: 'classroom'; attachments: ClassroomAttachmentLink[] }
  | { lms: 'schoology' }
  | null;

/** An assignment is a Classroom attachment or a Schoology launch, never both. */
export function readLmsLink(
  session: {
    classroomAttachments?: ClassroomAttachmentLink[] | null;
    classroomAttachment?: ClassroomAttachmentLink | null;
    ltiAttachment?: unknown;
  } | null
): GradebookLmsLink {
  if (!session) return null;
  const attachments = getClassroomAttachments(session);
  if (attachments.length > 0) return { lms: 'classroom', attachments };
  if (session.ltiAttachment) return { lms: 'schoology' };
  return null;
}

export interface GradebookPushCell {
  student: { uid: string };
  final: FinalScore;
}

export interface GradebookPushPlan {
  entries: ClassroomGradeEntry[];
  /** Awaiting a teacher grade: left out so a partial score never lands (RR-06). */
  awaiting: number;
  /** Excused or otherwise excluded: never sent, not even a 0. */
  excluded: number;
}

/** D22 push payload from final scores: raw or override only; a flag value such as Missing = 0 never pushes. */
export function buildGradebookPushPlan(
  cells: readonly GradebookPushCell[],
  maxPoints: number
): GradebookPushPlan {
  const plan: GradebookPushPlan = { entries: [], awaiting: 0, excluded: 0 };
  for (const { student, final } of cells) {
    if (final.status === 'awaiting') {
      plan.awaiting++;
      continue;
    }
    if (final.status === 'excluded') {
      plan.excluded++;
      continue;
    }
    if (
      final.status !== 'scored' ||
      final.pct === null ||
      !Number.isFinite(final.pct) ||
      (final.source !== 'raw' && final.source !== 'override')
    ) {
      continue;
    }
    plan.entries.push({
      pseudonymUid: student.uid,
      pointsEarned: Math.max(
        0,
        Math.min(maxPoints, Math.round((final.pct / 100) * maxPoints))
      ),
    });
  }
  return plan;
}

/** Schoology's scale: the column's Out of, else the assignment total (the largest per-student max). */
export function schoologyMaxPoints(
  cells: readonly { final: FinalScore }[],
  config: GradebookColumnConfig | null
): number | null {
  if (config?.maxPointsOverride != null) return config.maxPointsOverride;
  let max: number | null = null;
  for (const { final } of cells) {
    if (
      final.max !== null &&
      final.max > 0 &&
      (max === null || final.max > max)
    ) {
      max = final.max;
    }
  }
  return max;
}
