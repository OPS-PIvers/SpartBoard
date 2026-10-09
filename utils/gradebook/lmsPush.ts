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
  | { lms: 'schoology'; mode: 'launch' }
  /** SpartBoard makes the gradebook column itself (SCHOOLOGY_TOOL_COLUMNS.md D9). */
  | { lms: 'schoology'; mode: 'tool-column'; columnExists: boolean }
  | null;

/** The teacher's classes linked to a Schoology section (rosters carry the mirrored `ltiContextId`). */
export interface SchoologyLinkedTargets {
  rosterIds: ReadonlySet<string>;
  classIds: ReadonlySet<string>;
}

export function schoologyLinkedTargets(
  rosters: readonly {
    id: string;
    ltiContextId?: string;
    classlinkClassId?: string;
    testClassId?: string;
  }[]
): SchoologyLinkedTargets {
  const rosterIds = new Set<string>();
  const classIds = new Set<string>();
  for (const r of rosters) {
    if (!r.ltiContextId) continue;
    rosterIds.add(r.id);
    if (r.classlinkClassId) classIds.add(r.classlinkClassId);
    if (r.testClassId) classIds.add(r.testClassId);
  }
  return { rosterIds, classIds };
}

/** An assignment is a Classroom attachment, a Schoology launch, or (flag on) a tool column for a linked class. */
export function readLmsLink(
  session: {
    classroomAttachments?: ClassroomAttachmentLink[] | null;
    classroomAttachment?: ClassroomAttachmentLink | null;
    ltiAttachment?: unknown;
    ltiToolColumn?: boolean;
    rosterIds?: string[];
    classIds?: string[];
  } | null,
  toolColumns: SchoologyLinkedTargets | null = null
): GradebookLmsLink {
  if (!session) return null;
  const attachments = getClassroomAttachments(session);
  if (attachments.length > 0) return { lms: 'classroom', attachments };
  if (session.ltiAttachment) return { lms: 'schoology', mode: 'launch' };
  if (
    toolColumns &&
    ((session.rosterIds ?? []).some((id) => toolColumns.rosterIds.has(id)) ||
      (session.classIds ?? []).some((id) => toolColumns.classIds.has(id)))
  ) {
    return {
      lms: 'schoology',
      mode: 'tool-column',
      columnExists: session.ltiToolColumn === true,
    };
  }
  return null;
}

export interface GradebookPushCell {
  student: { uid: string };
  final: FinalScore;
}

export interface GradebookPushPlan {
  entries: ClassroomGradeEntry[];
  /** Students whose cell shows the Missing flag and no score; only tool columns send these. */
  missing: string[];
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
  const plan: GradebookPushPlan = {
    entries: [],
    missing: [],
    awaiting: 0,
    excluded: 0,
  };
  for (const { student, final } of cells) {
    if (final.status === 'awaiting') {
      plan.awaiting++;
      continue;
    }
    if (final.status === 'excluded') {
      plan.excluded++;
      continue;
    }
    const raw =
      final.status === 'scored' &&
      final.pct !== null &&
      Number.isFinite(final.pct) &&
      (final.source === 'raw' || final.source === 'override');
    if (!raw) {
      // Tool columns send Schoology's own Missing flag for these (SCHOOLOGY_TOOL_COLUMNS.md D12).
      if (
        final.status !== 'not-assigned' &&
        final.flags.some((f) => f.id === 'missing')
      ) {
        plan.missing.push(student.uid);
      }
      continue;
    }
    plan.entries.push({
      pseudonymUid: student.uid,
      pointsEarned: Math.max(
        0,
        Math.min(maxPoints, Math.round(((final.pct ?? 0) / 100) * maxPoints))
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
