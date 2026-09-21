import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    ensureGoogleScope: vi.fn(),
    user: { uid: 'user-1' },
    orgId: null,
    isExternalUser: false,
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [],
    clearPlcSharedSheetUrl: vi.fn(),
    setPlcSharedSheetUrl: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Capitals',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q2',
      type: 'MC',
      text: 'Capital of Italy?',
      correctAnswer: 'Rome',
      incorrectAnswers: ['Paris'],
      timeLimit: 30,
      points: 1,
    },
    {
      id: 'q1',
      type: 'MC',
      text: 'Capital of France?',
      correctAnswer: 'Paris',
      incorrectAnswers: ['Rome', 'Oslo'],
      timeLimit: 30,
      points: 1,
    },
  ],
} as unknown as QuizData;

const response = (pin: string, q1: string, q2: string): QuizResponse =>
  ({
    studentUid: `uid-${pin}`,
    _responseKey: `uid-${pin}`,
    pin,
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
    answers: [
      { questionId: 'q1', answer: q1, answeredAt: 100 },
      { questionId: 'q2', answer: q2, answeredAt: 101 },
    ],
  }) as unknown as QuizResponse;

const responses = [
  response('1111', 'Paris', 'Rome'),
  response('2222', 'Rome', 'Rome'),
  response('3333', 'Rome', 'Rome'),
];

const openQuestions = (plcView = false) => {
  render(
    <QuizResults
      quiz={quiz}
      responses={responses}
      config={{ view: 'results' } as unknown as QuizConfig}
      onBack={vi.fn()}
      plcView={plcView}
    />
  );
  fireEvent.click(screen.getByText('Question results'));
};

const questionToggle = (text: string) =>
  screen.getByRole('button', { name: new RegExp(text) });

describe('QuizResults — question drill-down', () => {
  it('expands and collapses a question row with its distribution and columns', () => {
    openQuestions();
    const toggle = questionToggle('Capital of France');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('drilldown-column-correct')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Answers')).toBeTruthy();
    expect(
      within(screen.getByTestId('drilldown-column-correct')).getByText(
        'Correct · 1 (33%)'
      )
    ).toBeTruthy();
    expect(screen.getByText('Incorrect · 2 (67%)')).toBeTruthy();
    // No partial credit anywhere, so no Partial column.
    expect(screen.queryByTestId('drilldown-column-partial')).toBeNull();
    // Names show in the columns for the teacher.
    expect(screen.getAllByText('PIN 2222').length).toBeGreaterThan(0);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('drilldown-column-correct')).toBeNull();
  });

  it('opens name chips under an option, several at once', () => {
    openQuestions();
    fireEvent.click(questionToggle('Capital of France'));
    const rome = screen.getByRole('button', { name: /Rome/ });
    const paris = screen.getByRole('button', { name: /Paris/ });
    fireEvent.click(rome);
    fireEvent.click(paris);
    expect(rome.getAttribute('aria-expanded')).toBe('true');
    expect(paris.getAttribute('aria-expanded')).toBe('true');
    const romeGroup = screen.getByRole('group', { name: 'Answered Rome' });
    expect(within(romeGroup).getByText('PIN 2222')).toBeTruthy();
    expect(within(romeGroup).getByText('PIN 3333')).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: 'Answered Paris' })).getByText(
        'PIN 1111'
      )
    ).toBeTruthy();
  });

  it('flags a common wrong answer and sorts by most missed', () => {
    openQuestions();
    expect(screen.getByText('Common wrong answer: Rome')).toBeTruthy();

    const order = () =>
      screen
        .getAllByRole('button', { name: /Capital of/ })
        .map((b) => b.textContent ?? '');
    expect(order()[0]).toContain('Italy');
    fireEvent.click(screen.getByRole('button', { name: 'Most missed' }));
    expect(order()[0]).toContain('France');
    expect(order()[1]).toContain('Italy');
  });

  it('PLC view shows counts only, with no student names', () => {
    openQuestions(true);
    fireEvent.click(questionToggle('Capital of France'));
    expect(screen.getByText('Correct · 1 (33%)')).toBeTruthy();
    expect(screen.queryByText(/PIN \d{4}/)).toBeNull();
    // Options are plain lines, not buttons that open name chips.
    expect(screen.queryByRole('button', { name: /Rome/ })).toBeNull();
    expect(screen.getByText('Common wrong answer: Rome')).toBeTruthy();
  });
});
