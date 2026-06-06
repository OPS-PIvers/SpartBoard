/**
 * getClassroomAttachments — Item D part 2 back-compat reader.
 *
 * A SpartBoard assignment can be posted to MULTIPLE Google Classroom courses
 * (one per linked ClassLink class), so the session/assignment now carries a
 * `classroomAttachments[]` array. Historically it held a single
 * `classroomAttachment`, which the student-initiated (TeacherDiscoveryRoute)
 * flow still writes. This helper is the ONE place that reconciles both: prefer
 * the array, else fall back to the singular, else empty. Every reader (grade
 * push, Publish=Push, the Results "Push grades" buttons) goes through it so the
 * single-vs-multi distinction stays invisible to them.
 */
import type { ClassroomAttachmentLink } from '@/types';

export function getClassroomAttachments(
  source:
    | {
        classroomAttachments?: ClassroomAttachmentLink[] | null;
        classroomAttachment?: ClassroomAttachmentLink | null;
      }
    | null
    | undefined
): ClassroomAttachmentLink[] {
  if (!source) return [];
  if (source.classroomAttachments && source.classroomAttachments.length > 0) {
    return source.classroomAttachments;
  }
  return source.classroomAttachment ? [source.classroomAttachment] : [];
}
