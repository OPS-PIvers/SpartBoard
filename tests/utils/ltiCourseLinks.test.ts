/**
 * findLinkedLtiContextId — the Schoology reverse lookup (classlinkClassId →
 * contextId) for showing per-class link state. firebase/firestore is mocked so
 * we exercise the matching (this-teacher filter + unambiguous-single rule)
 * without a live backend. Mirrors classroomCourseLinks.test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';

interface Link {
  contextId: string; // doc id
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
      docs: matched.map((l) => ({ id: l.contextId, data: () => l })),
    });
  },
}));

import { findLinkedLtiContextId } from '@/utils/ltiCourseLinks';

const db = {} as unknown as Firestore;

beforeEach(() => {
  links = [];
});

describe('findLinkedLtiContextId', () => {
  it('returns the single linked Schoology section for the teacher', async () => {
    links = [
      { contextId: 'ctx-alg', classlinkClassId: 'CL-1', teacherUid: 'T1' },
    ];
    expect(await findLinkedLtiContextId(db, ['CL-1'], 'T1')).toBe('ctx-alg');
  });

  it('returns null when nothing is linked', async () => {
    expect(await findLinkedLtiContextId(db, ['CL-1'], 'T1')).toBeNull();
  });

  it('ignores a link owned by a different teacher', async () => {
    links = [
      { contextId: 'ctx-alg', classlinkClassId: 'CL-1', teacherUid: 'OTHER' },
    ];
    expect(await findLinkedLtiContextId(db, ['CL-1'], 'T1')).toBeNull();
  });

  it('returns null when classes map to TWO different sections (ambiguous)', async () => {
    links = [
      { contextId: 'ctx-alg', classlinkClassId: 'CL-1', teacherUid: 'T1' },
      { contextId: 'ctx-geo', classlinkClassId: 'CL-2', teacherUid: 'T1' },
    ];
    expect(await findLinkedLtiContextId(db, ['CL-1', 'CL-2'], 'T1')).toBeNull();
  });

  it('resolves a single section when several classes map to the SAME section', async () => {
    links = [
      { contextId: 'ctx-alg', classlinkClassId: 'CL-1', teacherUid: 'T1' },
      { contextId: 'ctx-alg', classlinkClassId: 'CL-2', teacherUid: 'T1' },
    ];
    expect(await findLinkedLtiContextId(db, ['CL-1', 'CL-2'], 'T1')).toBe(
      'ctx-alg'
    );
  });

  it('returns null for empty inputs without querying', async () => {
    expect(await findLinkedLtiContextId(db, [], 'T1')).toBeNull();
    expect(await findLinkedLtiContextId(db, ['CL-1'], '')).toBeNull();
  });

  it('chunks > 30 class ids across multiple `in` queries and still resolves', async () => {
    const manyIds = Array.from({ length: 40 }, (_, i) => `CL-${i}`);
    links = [
      { contextId: 'ctx-alg', classlinkClassId: 'CL-39', teacherUid: 'T1' },
    ];
    expect(await findLinkedLtiContextId(db, manyIds, 'T1')).toBe('ctx-alg');
  });
});
