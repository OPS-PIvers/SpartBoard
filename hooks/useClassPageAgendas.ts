// The Course copies on a Class page (docs/plans/COURSE_AND_AGENDA.md D11, D22): every teacher's for students, the teacher's own for the preview.
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  CLASS_PAGES_COLLECTION,
  CLASS_PAGE_TEACHERS_SUBCOLLECTION,
  cleanCourseAgenda,
  cleanCourseText,
  cleanPinnedLinks,
  COURSE_MAX_NAME_LENGTH,
  type CourseAgenda,
  type CoursePinnedLink,
} from '@/utils/course/contract';

export interface ClassPageCopyRow {
  teacherUid: string;
  teacherName: string;
  agenda: CourseAgenda | null;
  pinnedLinks: CoursePinnedLink[];
}

export interface ClassPageAgenda extends CourseAgenda {
  /** Set only when co-teachers point at different decks (D22). */
  teacherName: string | null;
}

export interface ClassPageView {
  agendas: ClassPageAgenda[];
  links: CoursePinnedLink[];
}

/** Reads one stored copy defensively; the server wrote it, but the page never trusts its shape. */
export function readClassPageCopy(
  teacherUid: string,
  data: Record<string, unknown> | undefined
): ClassPageCopyRow | null {
  if (!data) return null;
  return {
    teacherUid,
    teacherName: cleanCourseText(data.teacherName, COURSE_MAX_NAME_LENGTH),
    agenda: cleanCourseAgenda(data.agenda),
    pinnedLinks: cleanPinnedLinks(data.pinnedLinks),
  };
}

/** One Agenda when every teacher shares a deck, one per teacher by name when they differ; links merged without repeats. */
export function classPageView(
  copies: readonly ClassPageCopyRow[]
): ClassPageView {
  const sorted = [...copies].sort(
    (a, b) =>
      a.teacherName.localeCompare(b.teacherName) ||
      a.teacherUid.localeCompare(b.teacherUid)
  );
  const decks = new Map<string, ClassPageCopyRow>();
  for (const copy of sorted) {
    if (copy.agenda && !decks.has(copy.agenda.fileId))
      decks.set(copy.agenda.fileId, copy);
  }
  const several = decks.size > 1;
  const agendas = [...decks.values()].map((copy) => ({
    fileId: copy.agenda?.fileId ?? '',
    title: copy.agenda?.title ?? '',
    ...(copy.agenda?.aspect !== undefined
      ? { aspect: copy.agenda.aspect }
      : {}),
    teacherName: several ? copy.teacherName || null : null,
  }));
  const seen = new Set<string>();
  const links: CoursePinnedLink[] = [];
  for (const copy of sorted) {
    for (const link of copy.pinnedLinks) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      links.push(link);
    }
  }
  return { agendas, links };
}

const EMPTY: ClassPageView = { agendas: [], links: [] };

/** Live Class page content for `classId`; `teacherUid` limits it to that teacher's own copy (the preview). Errors show nothing. */
export function useClassPageAgendas(
  classId: string | null,
  teacherUid?: string | null
): ClassPageView {
  const key =
    classId && !isAuthBypass && teacherUid !== null
      ? `${classId}\u0000${teacherUid ?? ''}`
      : null;
  const [state, setState] = useState<{
    key: string | null;
    copies: ClassPageCopyRow[];
  }>({ key: null, copies: [] });

  useEffect(() => {
    if (!key || !classId) return;
    const onError = (err: Error) => {
      logError('useClassPageAgendas', err, { classId });
      setState({ key, copies: [] });
    };
    const teachers = collection(
      db,
      CLASS_PAGES_COLLECTION,
      classId,
      CLASS_PAGE_TEACHERS_SUBCOLLECTION
    );
    if (teacherUid) {
      return onSnapshot(
        doc(teachers, teacherUid),
        (snap) => {
          const copy = readClassPageCopy(snap.id, snap.data());
          setState({ key, copies: copy ? [copy] : [] });
        },
        onError
      );
    }
    return onSnapshot(
      teachers,
      (snap) => {
        const copies = snap.docs
          .map((d) => readClassPageCopy(d.id, d.data()))
          .filter((c): c is ClassPageCopyRow => c !== null);
        setState({ key, copies });
      },
      onError
    );
  }, [key, classId, teacherUid]);

  const copies = state.key === key ? state.copies : null;
  return useMemo(() => (copies ? classPageView(copies) : EMPTY), [copies]);
}
