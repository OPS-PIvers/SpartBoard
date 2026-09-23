import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  QuizConfig,
  QuizData,
  QuizResponse,
  QuizResultsOverride,
  QuizSession,
} from '@/types';

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast,
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => false,
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    user: { uid: 'teacher-1' },
    orgId: null,
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
vi.mock('@/utils/quizDriveService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizDriveService')>();
  class MockQuizDriveService {
    exportResultsToSheet = vi.fn();
    createPlcSheetAndShare = vi.fn();
    regeneratePlcSheet = vi.fn();
  }
  return { ...actual, QuizDriveService: MockQuizDriveService };
});

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';
import { useStudentResultsSelectionState } from '@/components/widgets/QuizWidget/components/results/studentResultsSelection';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Sample Quiz',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Q1',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 30,
      points: 1,
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

const response = (
  pin: string,
  override?: QuizResultsOverride,
  status: QuizResponse['status'] = 'completed'
): QuizResponse =>
  ({
    studentUid: `uid-${pin}`,
    _responseKey: `pin-p1-${pin}`,
    pin,
    classPeriod: 'Period 1',
    answers: [{ questionId: 'q1', answer: 'a', answeredAt: 100 }],
    status,
    submittedAt: 200,
    score: null,
    joinedAt: 1,
    ...(override ? { resultsOverride: override } : {}),
  }) as QuizResponse;

const session = {
  id: 'session-1',
  quizId: 'quiz-1',
  teacherUid: 'teacher-1',
  classIds: [],
} as unknown as QuizSession;

const makeActions = () => ({
  publish: vi.fn().mockResolvedValue({ responsesUpdated: 1, skipped: 0 }),
  hide: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
});

const renderResults = (
  responses: QuizResponse[],
  actions?: ReturnType<typeof makeActions>
) => {
  render(
    <QuizResults
      quiz={quiz}
      responses={responses}
      config={{ view: 'results' } as unknown as QuizConfig}
      onBack={vi.fn()}
      session={session}
      tabWarningsEnabled
      studentResultsActions={actions}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /students/i }));
};

describe('QuizResults — per-student publishing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders no selection or results controls without handlers', () => {
    renderResults([response('1111')]);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /results options/i })
    ).not.toBeInTheDocument();
  });

  it('shows the bulk bar for a selection and hides the selected students', async () => {
    const actions = makeActions();
    renderResults([response('1111'), response('2222')], actions);

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 1111' }));
    expect(screen.getByRole('toolbar')).toHaveTextContent('1 selected');

    fireEvent.click(screen.getByRole('button', { name: /hide results/i }));
    await waitFor(() =>
      expect(actions.hide).toHaveBeenCalledWith(['pin-p1-1111'])
    );
    await waitFor(() =>
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    );
  });

  it('shows results to the completed students in a selection with the chosen level and expiry', async () => {
    const actions = makeActions();
    renderResults(
      [response('1111'), response('2222', undefined, 'in-progress')],
      actions
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('toolbar')).toHaveTextContent('2 selected');

    fireEvent.click(screen.getByRole('button', { name: 'Show results…' }));
    fireEvent.click(screen.getByLabelText(/Score, Responses, & Answers/));
    fireEvent.click(screen.getByLabelText('3 days'));
    const before = Date.now();
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }));

    await waitFor(() => expect(actions.publish).toHaveBeenCalledTimes(1));
    const [keys, visibility, expiresAt] = actions.publish.mock.calls[0] as [
      string[],
      string,
      number,
    ];
    expect(keys).toEqual(['pin-p1-1111']);
    expect(visibility).toBe('score-responses-and-answers');
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3 * 24 * 3600 * 1000);
  });

  it('copies the selected names, one per line', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderResults([response('1111'), response('2222')], makeActions());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: /copy names/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect((writeText.mock.calls[0][0] as string).split('\n').sort()).toEqual([
      'PIN 1111',
      'PIN 2222',
    ]);
  });

  it('badges a Shown student and returns them to the class from the row menu', async () => {
    const actions = makeActions();
    renderResults(
      [
        response('1111', {
          mode: 'shown',
          visibility: 'score-responses-and-answers',
          publishedAt: 1,
        }),
      ],
      actions
    );
    expect(screen.getByText('Shown · answers')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Results options for PIN 1111' })
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /follow class setting/i })
    );
    await waitFor(() =>
      expect(actions.clear).toHaveBeenCalledWith(['pin-p1-1111'])
    );
  });

  it('labels an expired override and still offers Hide', async () => {
    renderResults(
      [
        response('1111', {
          mode: 'shown',
          visibility: 'score-only',
          publishedAt: 1,
          expiresAt: 2,
        }),
      ],
      makeActions()
    );
    expect(screen.getByText('Expired')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Results options for PIN 1111' })
    );
    expect(
      await screen.findByRole('menuitem', { name: /hide results/i })
    ).toBeInTheDocument();
  });
});

describe('useStudentResultsSelectionState', () => {
  it('adds, toggles and clears keys', () => {
    const { result } = renderHook(() => useStudentResultsSelectionState());
    act(() => result.current.addToSelection(['a', 'b']));
    act(() => result.current.addToSelection(['b', 'c']));
    expect([...result.current.selectedResponseKeys]).toEqual(['a', 'b', 'c']);
    act(() => result.current.toggle('a'));
    expect(result.current.selectedResponseKeys.has('a')).toBe(false);
    act(() => result.current.clearSelection());
    expect(result.current.selectedResponseKeys.size).toBe(0);
  });
});
