import { describe, expect, it } from 'vitest';
import {
  classPreviewAssignments,
  studentPageListsSession,
} from '@/hooks/useClassStudentPagePreview';

const CLASS = 'cl-1';

describe('studentPageListsSession', () => {
  it('lists the statuses the student page queries', () => {
    expect(studentPageListsSession('quiz', { status: 'waiting' })).toBe(true);
    expect(studentPageListsSession('quiz', { status: 'active' })).toBe(true);
    expect(studentPageListsSession('quiz', { status: 'ended' })).toBe(true);
    expect(studentPageListsSession('quiz', { status: 'paused' })).toBe(false);
    expect(studentPageListsSession('mini-app', { status: 'draft' })).toBe(
      false
    );
    expect(studentPageListsSession('guided-learning', {})).toBe(true);
  });

  it('drops view-only shares', () => {
    expect(
      studentPageListsSession('quiz', { status: 'active', mode: 'view-only' })
    ).toBe(false);
    expect(
      studentPageListsSession('guided-learning', {
        assignmentMode: 'view-only',
      })
    ).toBe(false);
  });
});

describe('classPreviewAssignments', () => {
  it('keeps only rows a student in the class would see', () => {
    const rows = classPreviewAssignments(
      [
        {
          kind: 'quiz',
          id: 'q1',
          data: {
            status: 'active',
            sessionMode: 'teacher',
            classIds: [CLASS, 'other'],
            quizTitle: 'Live quiz',
            code: 'ABC',
          },
        },
        {
          kind: 'quiz',
          id: 'q2',
          data: {
            status: 'active',
            classIds: [CLASS],
            individualTargeting: true,
            quizTitle: 'Picked students',
          },
        },
        {
          kind: 'quiz',
          id: 'q3',
          data: {
            status: 'active',
            classIds: [CLASS],
            studentTargetClassIds: [CLASS],
            quizTitle: 'Narrowed',
          },
        },
        {
          kind: 'guided-learning',
          id: 'g1',
          data: { classId: CLASS, title: 'Legacy single class' },
        },
        {
          kind: 'mini-app',
          id: 'm1',
          data: { status: 'active', classIds: ['other'], appTitle: 'Other' },
        },
      ],
      CLASS
    );
    expect(rows.map((r) => r.sessionId).sort()).toEqual(['g1', 'q1']);
    const quiz = rows.find((r) => r.sessionId === 'q1');
    expect(quiz?.live).toBe(true);
    expect(quiz?.classIds).toEqual([CLASS]);
    expect(quiz?.openHref).toBe('/quiz?code=ABC');
  });

  it('caps ended sessions per kind like the student page', () => {
    const docs = Array.from({ length: 55 }, (_, i) => ({
      kind: 'quiz' as const,
      id: `e${i}`,
      data: { status: 'ended', endedAt: i, classIds: [CLASS] },
    }));
    const rows = classPreviewAssignments(docs, CLASS);
    expect(rows).toHaveLength(50);
    expect(rows.some((r) => r.sessionId === 'e0')).toBe(false);
    expect(rows[0].sessionId).toBe('e54');
  });
});
