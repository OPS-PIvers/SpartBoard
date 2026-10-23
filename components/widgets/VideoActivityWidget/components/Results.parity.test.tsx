import '@testing-library/jest-dom';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';

let features: Record<string, boolean> = {};
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    ensureGoogleScope: vi.fn(),
    user: { uid: 'teacher-1' },
    orgId: null,
    canAccessFeature: (id: string) => features[id] === true,
    isExternalUser: false,
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn(), rosters: [] }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    targetRefKeyByStudentUid: new Map(),
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));
const q = (id: string): VideoActivityQuestion => ({
  id,
  timestamp: 10,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  timeLimit: 0,
  points: 1,
});
const QUESTIONS = [q('q1'), q('q2')];
vi.mock('@/hooks/useVideoActivityKeyQuestions', () => ({
  useVideoActivityKeyQuestions: () => ({
    questions: QUESTIONS,
    loading: false,
  }),
}));

import { Results } from './Results';

const session: VideoActivitySession = {
  id: 's1',
  activityId: 'va-1',
  activityTitle: 'Photosynthesis',
  assignmentName: 'Photosynthesis',
  teacherUid: 'teacher-1',
  youtubeUrl: 'https://youtu.be/abc',
  questions: [],
  status: 'ended',
  allowedPins: [],
  createdAt: 1,
};

const response = (
  uid: string,
  answers: string[],
  completedAt: number | null = 3
): VideoActivityResponse => ({
  studentUid: uid,
  name: uid,
  joinedAt: 1,
  answers: answers.map((answer, i) => ({
    questionId: `q${i + 1}`,
    answer,
    answeredAt: 2,
  })),
  completedAt,
  score: null,
});

const RESPONSES = [
  response('Ada', ['A', 'A']),
  response('Bo', ['A', 'B']),
  response('Cy', ['A'], null),
];

const renderResults = (
  responses: VideoActivityResponse[] = RESPONSES,
  onBack = vi.fn()
) =>
  render(<Results session={session} responses={responses} onBack={onBack} />);

beforeEach(() => {
  features = { 'monitor-parity': true };
});

describe('Video activity Results — monitor-parity layout', () => {
  it('shows the class average and score spread of finished students', () => {
    renderResults();
    expect(screen.getByText('Class average')).toBeVisible();
    expect(screen.getByText('75%')).toBeVisible();
    expect(screen.getByText('2 of 3 students finished')).toBeVisible();
    expect(screen.getAllByText('1 · 50%')).toHaveLength(2);
    expect(screen.getAllByText('0 · 0%')).toHaveLength(2);
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('drills into questions and students, and Back steps out one level', () => {
    const onBack = vi.fn();
    renderResults(RESPONSES, onBack);
    fireEvent.click(screen.getByRole('button', { name: /Question results/ }));
    expect(screen.getByText('1. Question q1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /Students.*3 students/ })
    );
    expect(screen.getByText('Ada')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers Export to Sheets in the footer, off with no students', () => {
    renderResults();
    expect(
      screen.getByRole('button', { name: 'Export to Sheets' })
    ).toBeEnabled();
    renderResults([]);
    expect(
      screen.getAllByRole('button', { name: 'Export to Sheets' })[1]
    ).toBeDisabled();
    expect(screen.getAllByText('—')[0]).toBeVisible();
  });

  it('keeps the tabbed layout with the flag off', () => {
    features = {};
    renderResults();
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.queryByText('Class average')).toBeNull();
    expect(screen.getByText('Avg Score')).toBeInTheDocument();
  });
});
