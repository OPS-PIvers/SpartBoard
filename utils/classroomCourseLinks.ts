/**
 * classroomCourseLinks — client reverse lookup for Item D: given the ClassLink
 * class(es) a SpartBoard assignment targets, find the Google Classroom course
 * already linked to them so the assign flow can AUTO-TARGET it instead of making
 * the teacher pick the course again (the "double-pick" the handoff calls out).
 *
 * The forward link `classroom_course_links/{courseId} = { classlinkClassId,
 * teacherUid, … }` is written server-side (the assign flow + SidebarClasses).
 * Here we query it BY `classlinkClassId` — a single-field equality, so no
 * composite index is needed — and filter to the caller's own links.
 *
 * v1 deliberately resolves only an UNAMBIGUOUS single course: if the targeted
 * classes map to zero or to several distinct courses (a multi-period assign,
 * which the single-attachment model can't fan out yet — see the Item D part-2
 * design doc), we return null and the caller falls back to the manual picker.
 */
import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';

/** Firestore `in` filters accept at most 30 values; chunk defensively. */
const IN_CHUNK = 30;

interface CourseLinkDoc {
  classlinkClassId?: string;
  teacherUid?: string;
}

/**
 * Resolve the single Google Classroom course linked to the given ClassLink
 * class(es) for this teacher, or null when there's no unambiguous match
 * (none linked, or several different courses).
 */
export async function findLinkedClassroomCourseId(
  db: Firestore,
  classlinkClassIds: readonly string[],
  teacherUid: string
): Promise<string | null> {
  const ids = [...new Set(classlinkClassIds.filter((c) => !!c))];
  if (ids.length === 0 || !teacherUid) return null;

  const courseIds = new Set<string>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const snap = await getDocs(
      query(
        collection(db, 'classroom_course_links'),
        where('classlinkClassId', 'in', chunk)
      )
    );
    for (const d of snap.docs) {
      const data = d.data() as CourseLinkDoc;
      // The link must belong to THIS teacher (the doc id is the courseId).
      if (data.teacherUid === teacherUid) courseIds.add(d.id);
    }
  }

  // Unambiguous single course only — see the file header.
  return courseIds.size === 1 ? [...courseIds][0] : null;
}
