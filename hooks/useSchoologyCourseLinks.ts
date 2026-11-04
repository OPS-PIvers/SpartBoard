import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface SchoologyCourseLink {
  contextId: string;
  contextTitle: string | null;
  rosterId: string | null;
}

/** The signed-in teacher's own Schoology section links; `[]` until loaded or on error. */
export function useSchoologyCourseLinks(
  teacherUid: string | null | undefined,
  enabled = true
): SchoologyCourseLink[] {
  const [state, setState] = useState<{
    uid: string | null;
    links: SchoologyCourseLink[];
  }>({ uid: null, links: [] });

  useEffect(() => {
    if (!teacherUid || !enabled) return;
    const q = query(
      collection(db, 'lti_course_links'),
      where('teacherUid', '==', teacherUid)
    );
    return onSnapshot(
      q,
      (snap) => {
        const links = snap.docs.map((d): SchoologyCourseLink => {
          const data = d.data() as Record<string, unknown>;
          return {
            contextId: d.id,
            contextTitle:
              typeof data.contextTitle === 'string' ? data.contextTitle : null,
            rosterId: typeof data.rosterId === 'string' ? data.rosterId : null,
          };
        });
        setState({ uid: teacherUid, links });
      },
      () => setState({ uid: teacherUid, links: [] })
    );
  }, [teacherUid, enabled]);

  return teacherUid && enabled && state.uid === teacherUid ? state.links : [];
}
