import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizQuestion } from '@/types';

// Regression: attach flow's maxPoints must dedup duplicate question ids like other LMS-attach surfaces.

const mockCallable = vi.fn((_params: { maxPoints: number }) => ({
  data: { attachmentId: 'att-1' },
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockCallable,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(() => ({ exists: () => false })),
  updateDoc: vi.fn(() => undefined),
}));

vi.mock('@/components/classroomAddon/gisOAuth', () => ({
  ensureGis: vi.fn(() => undefined),
  requestAccessToken: vi.fn(() => 'addon-access-token'),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 't@example.com', displayName: 'T' },
    signInWithGoogle: vi.fn(),
    googleAccessToken: 'drive-token',
    ensureGoogleScope: vi.fn(() => null),
  }),
}));

// Two entries sharing the same id — simulates a Drive-sync/arrayUnion duplicate.
const dupQuestion: QuizQuestion = {
  id: 'q-dup',
  type: 'MC',
  points: 10,
} as unknown as QuizQuestion;
const duplicatedQuestions: QuizQuestion[] = [dupQuestion, dupQuestion];

const loadQuizData = vi.fn(() => ({
  id: 'quiz-1',
  title: 'My Quiz',
  questions: duplicatedQuestions,
  createdAt: 0,
  updatedAt: 0,
}));

const createAssignment = vi.fn(() => ({
  id: 'assign-1',
  code: 'ABC123',
}));

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    quizzes: [
      {
        id: 'quiz-1',
        title: 'My Quiz',
        driveFileId: 'drive-file-1',
        questionCount: 2,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    loadQuizData,
    loading: false,
  }),
}));

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({ createAssignment }),
}));

vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: [],
    loadActivityData: vi.fn(),
    loading: false,
  }),
}));

vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    createAssignment: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

import { ClassroomAddonTeacherSpike } from '@/components/classroomAddon/TeacherDiscoveryRoute';

describe('ClassroomAddonTeacherSpike attach flow — maxPoints dedup', () => {
  beforeEach(() => {
    mockCallable.mockClear();
    window.history.pushState(
      {},
      '',
      '/classroom-addon/teacher?courseId=course-1&itemId=item-1&addOnToken=tok-1'
    );
  });

  it('dedupes duplicate question ids when computing the attached quiz maxPoints', async () => {
    render(<ClassroomAddonTeacherSpike />);

    fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
    fireEvent.click(await screen.findByRole('option', { name: 'My Quiz' }));

    fireEvent.click(screen.getByRole('button', { name: /attach quiz/i }));

    await waitFor(() => expect(mockCallable).toHaveBeenCalled());

    const params = mockCallable.mock.calls[0][0];
    // Two entries of the SAME 10-point question id must dedup to 10, not 20.
    expect(params.maxPoints).toBe(10);
  });
});
