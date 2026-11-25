import type { ClassroomAttachmentLink } from '@/types';
import { getClassroomAttachments } from '@/utils/classroomAttachments';
import type { GradebookKind } from '@/utils/gradebook/gradebookCore';

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

/** An assignment is a Classroom attachment, a Schoology launch, or a tool column for a linked class. */
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

export {
  buildGradebookPushPlan,
  schoologyMaxPoints,
  type GradebookPushCell,
  type GradebookPushPlan,
} from '@/utils/gradebook/gradebookCore';
