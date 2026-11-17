// Resolves a Course's Class page link (D18) to the one class in it the signed-in student is in.
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { COURSE_PAGE_LINKS_COLLECTION } from '@/utils/course/contract';
import { pickCourseLinkClass } from '@/utils/myAssignmentsPath';

export type CourseLinkClass =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'found'; classId: string }
  | { status: 'missing' };

/** `none` without a link; `missing` when the link is gone, unreadable, or names none of the student's classes. */
export function useCourseLinkClass(
  linkId: string | null,
  studentClassIds: readonly string[]
): CourseLinkClass {
  const [result, setResult] = useState<{
    linkId: string;
    linkClassIds: unknown[] | null;
  } | null>(null);

  useEffect(() => {
    if (!linkId || isAuthBypass) return;
    let cancelled = false;
    getDoc(doc(db, COURSE_PAGE_LINKS_COLLECTION, linkId))
      .then((snap) => {
        if (cancelled) return;
        const ids: unknown = snap.data()?.classIds;
        setResult({ linkId, linkClassIds: Array.isArray(ids) ? ids : null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logError('useCourseLinkClass', err);
        setResult({ linkId, linkClassIds: null });
      });
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  if (!linkId) return { status: 'none' };
  if (isAuthBypass) return { status: 'missing' };
  if (result?.linkId !== linkId) return { status: 'loading' };
  const classId = result.linkClassIds
    ? pickCourseLinkClass(result.linkClassIds, studentClassIds)
    : null;
  return classId ? { status: 'found', classId } : { status: 'missing' };
}
