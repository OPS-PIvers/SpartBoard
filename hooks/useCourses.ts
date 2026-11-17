// The teacher's Courses (docs/plans/COURSE_AND_AGENDA.md §4.1): a live listener plus the saveCourseV1 call, the only writer.
import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import {
  COURSES_SUBCOLLECTION,
  type Course,
  type SaveCourseReply,
  type SaveCourseRequest,
} from '@/utils/course/contract';

export interface UseCoursesResult {
  courses: Course[];
  loading: boolean;
  error: string | null;
  saveCourse: (request: SaveCourseRequest) => Promise<SaveCourseReply>;
}

const callSaveCourse = httpsCallable<SaveCourseRequest, SaveCourseReply>(
  functions,
  'saveCourseV1'
);

/** Listens only while `enabled` (the `course-agenda` flag), so teachers without it open no listener. */
export function useCourses(enabled = true): UseCoursesResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const live = enabled && !!uid && !isAuthBypass;
  const [state, setState] = useState<{
    key: string | null;
    courses: Course[];
    error: string | null;
  }>({ key: null, courses: [], error: null });
  const key = live ? uid : null;

  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      collection(db, 'users', key, COURSES_SUBCOLLECTION),
      (snap) => {
        const courses = snap.docs
          .map((d) => ({ ...(d.data() as Omit<Course, 'id'>), id: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setState({ key, courses, error: null });
      },
      (err) => {
        logError('useCourses', err);
        setState({ key, courses: [], error: err.message });
      }
    );
  }, [key]);

  const saveCourse = useCallback(
    async (request: SaveCourseRequest) => (await callSaveCourse(request)).data,
    []
  );

  const current = state.key === key && key !== null;
  return {
    courses: current ? state.courses : [],
    loading: live && !current,
    error: current ? state.error : null,
    saveCourse,
  };
}
