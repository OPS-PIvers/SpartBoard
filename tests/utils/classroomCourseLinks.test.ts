/**
 * findLinkedClassroomCourseId — the Item D reverse lookup (classlinkClassId →
 * googleCourseId). firebase/firestore is mocked so we exercise the matching
 * (this-teacher filter + unambiguous-single rule) without a live backend.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';

interface Link {
  courseId: string; // doc id
  classlinkClassId: string;
  teacherUid: string;
}
let links: Link[] = [];

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (_coll: unknown, constraint: { value: string[] }) => ({ constraint }),
  getDocs: (q: { constraint: { value: string[] } }) => {
    const wanted = new Set(q.constraint.value);
    const matched = links.filter((l) => wanted.has(l.classlinkClassId));
    return Promise.resolve({
      docs: matched.map((l) => ({ id: l.courseId, data: () => l })),
    });
  },
}));

import { findLinkedClassroomCourseId } from '@/utils/classroomCourseLinks';

const db = {} as unknown as Firestore;

beforeEach(() => {
  links = [];
});

describe('findLinkedClassroomCourseId', () => {
  it('returns the single linked course for the teacher', async () => {
    links = [{ courseId: 'C-ALG', classlinkClassId: 'CL-1', teacherUid: 'T1' }];
    expect(await findLinkedClassroomCourseId(db, ['CL-1'], 'T1')).toBe('C-ALG');
  });

  it('returns null when nothing is linked', async () => {
    expect(await findLinkedClassroomCourseId(db, ['CL-1'], 'T1')).toBeNull();
  });

  it('ignores a link owned by a different teacher', async () => {
    links = [
      { courseId: 'C-ALG', classlinkClassId: 'CL-1', teacherUid: 'OTHER' },
    ];
    expect(await findLinkedClassroomCourseId(db, ['CL-1'], 'T1')).toBeNull();
  });

  it('returns null when the classes map to TWO different courses (ambiguous)', async () => {
    links = [
      { courseId: 'C-ALG', classlinkClassId: 'CL-1', teacherUid: 'T1' },
      { courseId: 'C-GEO', classlinkClassId: 'CL-2', teacherUid: 'T1' },
    ];
    expect(
      await findLinkedClassroomCourseId(db, ['CL-1', 'CL-2'], 'T1')
    ).toBeNull();
  });

  it('resolves a single course when several classes map to the SAME course', async () => {
    links = [
      { courseId: 'C-ALG', classlinkClassId: 'CL-1', teacherUid: 'T1' },
      { courseId: 'C-ALG', classlinkClassId: 'CL-2', teacherUid: 'T1' },
    ];
    expect(await findLinkedClassroomCourseId(db, ['CL-1', 'CL-2'], 'T1')).toBe(
      'C-ALG'
    );
  });

  it('returns null for empty inputs without querying', async () => {
    expect(await findLinkedClassroomCourseId(db, [], 'T1')).toBeNull();
    expect(await findLinkedClassroomCourseId(db, ['CL-1'], '')).toBeNull();
  });
});
