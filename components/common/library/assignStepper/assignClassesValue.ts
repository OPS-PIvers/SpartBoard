import type { ClassRoster, StudentTargetRef } from '@/types';

/** Classes step value; a class with no `studentsByClass` key goes to all its students. */
export interface AssignClassesValue {
  classIds: string[];
  studentsByClass: Record<string, StudentTargetRef[]>;
}

export const EMPTY_ASSIGN_CLASSES_VALUE: AssignClassesValue = {
  classIds: [],
  studentsByClass: {},
};

export const studentCountLabel = (n: number): string =>
  `${n} student${n === 1 ? '' : 's'}`;

/** Replaces the picked classes, dropping student picks for classes no longer picked. */
export function withClassIds(
  value: AssignClassesValue,
  classIds: string[]
): AssignClassesValue {
  const keep = new Set(classIds);
  const studentsByClass: Record<string, StudentTargetRef[]> = {};
  for (const [id, refs] of Object.entries(value.studentsByClass)) {
    if (keep.has(id)) studentsByClass[id] = refs;
  }
  return { classIds, studentsByClass };
}

/** Sets one class's student picks; an empty list means all students. */
export function withClassStudents(
  value: AssignClassesValue,
  classId: string,
  refs: StudentTargetRef[] | null
): AssignClassesValue {
  const studentsByClass = { ...value.studentsByClass };
  if (refs && refs.length > 0) studentsByClass[classId] = refs;
  else delete studentsByClass[classId];
  return { ...value, studentsByClass };
}

type ClassLabelRoster = Pick<ClassRoster, 'id' | 'name'> &
  Partial<Pick<ClassRoster, 'studentCount'>>;

const sharesName = (r: ClassLabelRoster, rosters: ClassLabelRoster[]) =>
  rosters.some((o) => o.id !== r.id && o.name === r.name);

/** A class's name, plus its student count when another class has the same name. */
export function classLabel(
  r: ClassLabelRoster,
  rosters: ClassLabelRoster[]
): string {
  return sharesName(r, rosters) && r.studentCount !== undefined
    ? `${r.name} (${studentCountLabel(r.studentCount)})`
    : r.name;
}

/** Collapsed Classes step text, e.g. "Sample 2 (3 students), Sample 3". */
export function formatClassesValue(
  value: AssignClassesValue,
  rosters: ClassLabelRoster[]
): string {
  const picked = rosters.filter((r) => value.classIds.includes(r.id));
  if (picked.length === 0) return 'No classes (link only)';
  const narrowed = picked.some((r) => value.studentsByClass[r.id]?.length);
  if (!narrowed && picked.length === rosters.length && picked.length > 1) {
    return `All ${picked.length} classes`;
  }
  return picked
    .map((r) => {
      const refs = value.studentsByClass[r.id];
      if (!refs?.length) return classLabel(r, rosters);
      return sharesName(r, rosters) && r.studentCount !== undefined
        ? `${r.name} (${refs.length} of ${studentCountLabel(r.studentCount)})`
        : `${r.name} (${studentCountLabel(refs.length)})`;
    })
    .join(', ');
}
