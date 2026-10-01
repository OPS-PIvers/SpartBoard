import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  DEFAULT_PROFICIENCY_SCALE,
  GRADEBOOK_COLLECTIONS,
  parseScale,
  type StudentGradesDoc,
} from '@/utils/gradebook/gradebookCore';
import type { StudentGradesData } from '@/utils/gradebook/studentGrades';
import type { GlobalFeaturePermission } from '@/types';

const STUDENT_GRADEBOOK_FEATURE = 'student-gradebook';

/** Students pass the `student-gradebook` gate only once it is Public (D38); a missing doc is off. */
export function isStudentGradebookOpen(
  permission: Partial<GlobalFeaturePermission> | undefined
): boolean {
  return (
    permission?.enabled === true &&
    permission.accessLevel === 'public' &&
    (permission.buildings ?? []).length === 0
  );
}

export function useStudentGradebookEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (isAuthBypass) return;
    return onSnapshot(
      doc(db, 'global_permissions', STUDENT_GRADEBOOK_FEATURE),
      (snap) =>
        setEnabled(
          isStudentGradebookOpen(
            snap.data() as Partial<GlobalFeaturePermission> | undefined
          )
        ),
      () => setEnabled(false)
    );
  }, []);
  return enabled;
}

export type StudentGradesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: StudentGradesData };

const EMPTY: StudentGradesData = {
  entries: {},
  standards: null,
  scale: DEFAULT_PROFICIENCY_SCALE,
};

interface Snapshot {
  key: string;
  state: StudentGradesState;
}

/** D37: the student's own server-written projection for one class. */
export function useStudentGrades(
  studentUid: string | null,
  classId: string | null,
  active: boolean
): StudentGradesState {
  const key = `${studentUid ?? ''}/${classId ?? ''}`;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    if (!active || !studentUid || !classId || isAuthBypass) return;
    return onSnapshot(
      doc(
        db,
        GRADEBOOK_COLLECTIONS.studentGrades,
        studentUid,
        GRADEBOOK_COLLECTIONS.studentClasses,
        classId
      ),
      (s) => {
        const d = s.data() as Partial<StudentGradesDoc> | undefined;
        setSnap({
          key,
          state: {
            status: 'ready',
            data: d
              ? {
                  entries: d.entries ?? {},
                  standards: d.standards ?? null,
                  scale:
                    parseScale(
                      d.levels
                        ? { levels: d.levels }
                        : { ...d.cutoffs, levelNames: d.levelNames }
                    ) ?? EMPTY.scale,
                }
              : EMPTY,
          },
        });
      },
      () => setSnap({ key, state: { status: 'error' } })
    );
  }, [active, studentUid, classId, key]);
  if (isAuthBypass) return { status: 'ready', data: EMPTY };
  return snap?.key === key ? snap.state : { status: 'loading' };
}
