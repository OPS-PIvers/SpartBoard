import { describe, it, expect } from 'vitest';
import { getClassroomAttachments } from '@/utils/classroomAttachments';
import type { ClassroomAttachmentLink } from '@/types';

const A = (id: string): ClassroomAttachmentLink => ({
  attachmentId: id,
  courseId: `course-${id}`,
  itemId: `cw-${id}`,
  maxPoints: 20,
});

describe('getClassroomAttachments', () => {
  it('returns the array when present', () => {
    const list = [A('1'), A('2')];
    expect(getClassroomAttachments({ classroomAttachments: list })).toEqual(
      list
    );
  });

  it('falls back to the singular for back-compat', () => {
    const single = A('1');
    expect(getClassroomAttachments({ classroomAttachment: single })).toEqual([
      single,
    ]);
  });

  it('prefers a non-empty array over the singular', () => {
    expect(
      getClassroomAttachments({
        classroomAttachments: [A('arr')],
        classroomAttachment: A('single'),
      })
    ).toEqual([A('arr')]);
  });

  it('falls back to the singular when the array is empty', () => {
    expect(
      getClassroomAttachments({
        classroomAttachments: [],
        classroomAttachment: A('single'),
      })
    ).toEqual([A('single')]);
  });

  it('returns [] for nothing linked / nullish source', () => {
    expect(getClassroomAttachments({})).toEqual([]);
    expect(getClassroomAttachments(null)).toEqual([]);
    expect(getClassroomAttachments(undefined)).toEqual([]);
  });
});
