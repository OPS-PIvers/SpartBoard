/**
 * Unit coverage for the client-side "Assign to Google Classroom" helpers:
 *   - buildClassroomAttachmentLink — only the embedded add-on path yields a
 *     persistable linkage (the link/redirect path has no grade passback).
 *   - persistClassroomAttachmentLink — writes the SESSION doc first (load-bearing
 *     for the grade-push button) then the assignment archive, in the correct
 *     per-kind collections. firebase/firestore is mocked so the test captures the
 *     write targets without a live Firestore.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  updateDoc: (
    ref: { path: string },
    data: Record<string, unknown>
  ): Promise<void> => {
    updateCalls.push({ path: ref.path, data });
    return Promise.resolve();
  },
}));

import {
  buildClassroomAttachmentLink,
  persistClassroomAttachmentLink,
  persistClassroomAttachmentLinks,
  type AssignToClassroomResult,
} from '@/utils/assignToClassroom';

const fakeDb = {} as unknown as Parameters<
  typeof persistClassroomAttachmentLink
>[0];

beforeEach(() => {
  updateCalls.length = 0;
});

describe('buildClassroomAttachmentLink', () => {
  it('maps an addon result into a ClassroomAttachmentLink', () => {
    const result: AssignToClassroomResult = {
      courseWorkId: 'CW1',
      attachmentId: 'ATT1',
      mode: 'addon',
      maxPoints: 20,
      dueAt: null,
    };
    const link = buildClassroomAttachmentLink(result, 'C1');
    expect(link).toMatchObject({
      attachmentId: 'ATT1',
      courseId: 'C1',
      itemId: 'CW1',
      maxPoints: 20,
    });
    expect(typeof link?.attachedAt).toBe('number');
  });

  it('returns null for the link/redirect path (no embedded passback)', () => {
    expect(
      buildClassroomAttachmentLink(
        {
          courseWorkId: 'CW1',
          attachmentId: null,
          mode: 'link',
          maxPoints: 20,
          dueAt: null,
        },
        'C1'
      )
    ).toBeNull();
  });

  it('returns null when an addon result is missing its attachmentId', () => {
    expect(
      buildClassroomAttachmentLink(
        {
          courseWorkId: 'CW1',
          attachmentId: null,
          mode: 'addon',
          maxPoints: 20,
          dueAt: null,
        },
        'C1'
      )
    ).toBeNull();
  });
});

describe('persistClassroomAttachmentLink', () => {
  const link = {
    attachmentId: 'ATT1',
    courseId: 'C1',
    itemId: 'CW1',
    maxPoints: 20,
    attachedAt: 123,
  };

  it('writes the quiz session doc FIRST, then the assignment archive', async () => {
    await persistClassroomAttachmentLink(
      fakeDb,
      'quiz',
      'S1',
      'teacher-1',
      link
    );
    expect(updateCalls.map((c) => c.path)).toEqual([
      'quiz_sessions/S1',
      'users/teacher-1/quiz_assignments/S1',
    ]);
    // Single-course assign still writes the singular (back-compat) AND the array
    // (the new canonical field) so old + new readers both light up.
    expect(updateCalls[0].data).toEqual({
      classroomAttachments: [link],
      classroomAttachment: link,
    });
    expect(updateCalls[1].data).toMatchObject({
      classroomAttachments: [link],
      classroomAttachment: link,
    });
  });

  it('targets the video-activity collections for kind=va', async () => {
    await persistClassroomAttachmentLink(
      fakeDb,
      'va',
      'VA1',
      'teacher-1',
      link
    );
    expect(updateCalls.map((c) => c.path)).toEqual([
      'video_activity_sessions/VA1',
      'users/teacher-1/video_activity_assignments/VA1',
    ]);
  });
});

describe('persistClassroomAttachmentLinks (multi-course)', () => {
  const linkA = {
    attachmentId: 'ATT-A',
    courseId: 'C-A',
    itemId: 'CW-A',
    maxPoints: 20,
    attachedAt: 1,
  };
  const linkB = {
    attachmentId: 'ATT-B',
    courseId: 'C-B',
    itemId: 'CW-B',
    maxPoints: 20,
    attachedAt: 2,
  };

  it('writes the full array plus the singular (= first link) to both docs', async () => {
    await persistClassroomAttachmentLinks(fakeDb, 'quiz', 'S1', 'teacher-1', [
      linkA,
      linkB,
    ]);
    expect(updateCalls.map((c) => c.path)).toEqual([
      'quiz_sessions/S1',
      'users/teacher-1/quiz_assignments/S1',
    ]);
    expect(updateCalls[0].data).toEqual({
      classroomAttachments: [linkA, linkB],
      classroomAttachment: linkA,
    });
    expect(updateCalls[1].data).toMatchObject({
      classroomAttachments: [linkA, linkB],
      classroomAttachment: linkA,
    });
  });

  it('is a no-op (no writes) when given an empty list', async () => {
    await persistClassroomAttachmentLinks(
      fakeDb,
      'quiz',
      'S1',
      'teacher-1',
      []
    );
    expect(updateCalls).toHaveLength(0);
  });
});
