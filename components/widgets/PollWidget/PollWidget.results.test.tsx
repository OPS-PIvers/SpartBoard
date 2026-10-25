import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, Mock, beforeEach } from 'vitest';
import { PollWidget } from '.';
import {
  useActiveBoardLinkedShareId,
  useGlobalStyle,
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { WidgetData, DEFAULT_GLOBAL_STYLE, PollConfig } from '@/types';

vi.mock('@/context/dashboardCanvasStore');
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));

const { mockSetDoc, mockOnSnapshot } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
}));

let liveVotes: { id: string; data: Record<string, unknown> }[] = [];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  doc: vi.fn((..._args: unknown[]) => ({ __path: _args.slice(1).join('/') })),
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  increment: (n: number) => ({ __increment: n }),
}));

const mockUpdateWidget = vi.fn();
let flagOn = true;

const makeWidget = (config: PollConfig): WidgetData => ({
  id: 'poll-1',
  type: 'poll',
  w: 2,
  h: 2,
  x: 0,
  y: 0,
  z: 1,
  flipped: false,
  config,
});

const twoQuestions: PollConfig['questions'] = [
  {
    id: 'q1',
    question: 'Best fruit?',
    options: [
      { id: 'a', label: 'Apple', votes: 3 },
      { id: 'b', label: 'Banana', votes: 1 },
    ],
  },
  {
    id: 'q2',
    question: 'Best season?',
    options: [
      { id: 'c', label: 'Summer', votes: 0 },
      { id: 'd', label: 'Winter', votes: 0 },
    ],
  },
];

const lastConfig = (): PollConfig =>
  (mockUpdateWidget.mock.calls.at(-1)?.[1] as { config: PollConfig }).config;

describe('PollWidget results controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flagOn = true;
    liveVotes = [];
    vi.mocked(useGlobalStyle).mockReturnValue({
      ...DEFAULT_GLOBAL_STYLE,
      fontFamily: 'sans',
    });
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
    } as unknown as DashboardActions);
    vi.mocked(useActiveBoardLinkedShareId).mockReturnValue(null);
    (useAuth as Mock).mockReturnValue({
      user: { uid: 'teacher-1' },
      canAccessFeature: vi.fn((id: string) =>
        id === 'poll-pro' ? flagOn : true
      ),
    });
    mockSetDoc.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation(
      (_ref: unknown, cb: (snap: unknown) => void) => {
        const docs = liveVotes.map((d) => ({ id: d.id, data: () => d.data }));
        cb({ docs, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) });
        return vi.fn();
      }
    );
  });

  it('hides counts while results are hidden and offers Show results', () => {
    render(
      <PollWidget
        widget={makeWidget({ questions: twoQuestions, hideResults: true })}
      />
    );
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('3 (75%)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show results/ }));
    expect(lastConfig().revealedQuestionIds).toEqual(['q1']);
  });

  it('shows counts once the current question is revealed', () => {
    render(
      <PollWidget
        widget={makeWidget({
          questions: twoQuestions,
          hideResults: true,
          revealedQuestionIds: ['q1'],
        })}
      />
    );
    expect(screen.getByText('3 (75%)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Hide results/ }));
    expect(lastConfig().revealedQuestionIds).toEqual([]);
  });

  it('keeps the old always-visible results without the flag', () => {
    flagOn = false;
    render(
      <PollWidget
        widget={makeWidget({ questions: twoQuestions, hideResults: true })}
      />
    );
    expect(screen.getByText('3 (75%)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show results/ })
    ).not.toBeInTheDocument();
  });

  it('shows the answered count and locks voting during a live session', () => {
    liveVotes = [
      { id: '0_p1', data: { questionIndex: 0, optionIndex: 0, votedAt: 1 } },
      { id: '0_p2', data: { questionIndex: 0, optionIndex: 1, votedAt: 1 } },
    ];
    render(
      <PollWidget
        widget={makeWidget({
          questions: twoQuestions,
          joinCode: 'K3F9Q',
          activePollSessionId: 'K3F9Q',
        })}
      />
    );
    expect(screen.getByTestId('poll-answered-count')).toHaveTextContent(
      '2 answered'
    );
    fireEvent.click(screen.getByRole('button', { name: /Lock voting/ }));
    expect(lastConfig().lockedQuestionIds).toEqual(['q1']);
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'poll_sessions/teacher-1_K3F9Q' },
      expect.objectContaining({
        lockedQuestions: [0],
        hideResults: false,
        revealedQuestions: [],
      }),
      { merge: true }
    );
  });

  it('offers Unlock voting on a locked question', () => {
    render(
      <PollWidget
        widget={makeWidget({
          questions: twoQuestions,
          joinCode: 'K3F9Q',
          activePollSessionId: 'K3F9Q',
          lockedQuestionIds: ['q1'],
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Unlock voting/ }));
    expect(lastConfig().lockedQuestionIds).toEqual([]);
  });

  it('still reaches phones on a stopped session after Show results', () => {
    render(
      <PollWidget
        widget={makeWidget({
          questions: twoQuestions,
          hideResults: true,
          joinCode: 'K3F9Q',
          lastPollSessionId: 'K3F9Q',
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Show results/ }));
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'poll_sessions/teacher-1_K3F9Q' },
      expect.objectContaining({ revealedQuestions: [0] }),
      { merge: true }
    );
  });

  it('hides lock and reveal from a colleague when the live session has no stamped owner', () => {
    vi.mocked(useActiveBoardLinkedShareId).mockReturnValue('share-1');
    render(
      <PollWidget
        widget={makeWidget({
          questions: twoQuestions,
          hideResults: true,
          joinCode: 'K3F9Q',
          activePollSessionId: 'K3F9Q',
        })}
      />
    );
    expect(
      screen.queryByRole('button', { name: /Lock voting/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show results/ })
    ).not.toBeInTheDocument();
  });

  it('shows the correct answer on demand', () => {
    const questions = [
      {
        ...twoQuestions[0],
        options: [
          { id: 'a', label: 'Apple', votes: 3, correct: true },
          { id: 'b', label: 'Banana', votes: 1 },
        ],
      },
    ];
    const { rerender } = render(
      <PollWidget widget={makeWidget({ questions })} />
    );
    expect(screen.queryByLabelText('Correct answer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    expect(lastConfig().answerShownQuestionIds).toEqual(['q1']);
    expect(lastConfig().lockedQuestionIds).toEqual(['q1']);
    rerender(
      <PollWidget
        widget={makeWidget({ questions, answerShownQuestionIds: ['q1'] })}
      />
    );
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
  });

  it('offers no Show answer when no option is marked correct', () => {
    render(<PollWidget widget={makeWidget({ questions: twoQuestions })} />);
    expect(
      screen.queryByRole('button', { name: /Show answer/ })
    ).not.toBeInTheDocument();
  });
});
