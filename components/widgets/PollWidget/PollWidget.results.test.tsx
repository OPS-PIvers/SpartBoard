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

const { mockSetDoc, mockOnSnapshot, mockDeleteDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockDeleteDoc: vi.fn(),
}));

let liveVotes: { id: string; data: Record<string, unknown> }[] = [];
let hiddenWordDocs: { id: string; data: Record<string, unknown> }[] = [];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((..._args: unknown[]) => _args.slice(1).join('/')),
  doc: vi.fn((..._args: unknown[]) => ({ __path: _args.slice(1).join('/') })),
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  deleteDoc: mockDeleteDoc,
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
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
      (ref: unknown, cb: (snap: unknown) => void) => {
        const source =
          typeof ref === 'string' && ref.endsWith('/hidden_words')
            ? hiddenWordDocs
            : liveVotes;
        const docs = source.map((d) => ({ id: d.id, data: () => d.data }));
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

  describe('rating scale', () => {
    const scale: PollConfig['questions'] = [
      {
        id: 'q1',
        question: 'How sure are you?',
        kind: 'scale',
        scaleLow: 'Not sure',
        scaleHigh: 'Very sure',
        options: [1, 3, 0, 0, 1].map((votes, i) => ({
          id: `s${i}`,
          label: String(i + 1),
          votes,
        })),
      },
    ];

    it('shows columns, end labels and the average', () => {
      render(<PollWidget widget={makeWidget({ questions: scale })} />);
      expect(screen.getByTestId('poll-scale-results')).toBeInTheDocument();
      expect(screen.getByText('Very sure')).toBeInTheDocument();
      expect(screen.getByTestId('poll-scale-average')).toHaveTextContent(
        'Average 2.4'
      );
    });

    it('holds the average back while results are hidden', () => {
      render(
        <PollWidget
          widget={makeWidget({ questions: scale, hideResults: true })}
        />
      );
      expect(
        screen.queryByTestId('poll-scale-average')
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    });

    it('falls back to the numbered list without the flag', () => {
      flagOn = false;
      render(<PollWidget widget={makeWidget({ questions: scale })} />);
      expect(
        screen.queryByTestId('poll-scale-results')
      ).not.toBeInTheDocument();
      expect(screen.getByText('3 (60%)')).toBeInTheDocument();
    });
  });

  describe('word cloud and open response', () => {
    const live = (kind: 'words' | 'text', extra: Partial<PollConfig> = {}) =>
      makeWidget({
        questions: [{ id: 'q1', question: 'Say it', kind, options: [] }],
        joinCode: 'K3F9Q',
        activePollSessionId: 'K3F9Q',
        ...extra,
      });

    beforeEach(() => {
      hiddenWordDocs = [];
      liveVotes = [
        {
          id: '0_p1',
          data: { questionIndex: 0, text: 'Gravity  ', votedAt: 1 },
        },
        { id: '0_p2', data: { questionIndex: 0, text: 'gravity', votedAt: 2 } },
        {
          id: '0_p3',
          data: { questionIndex: 0, text: 'friction', votedAt: 3 },
        },
      ];
    });

    it('builds a word cloud and hides a word', () => {
      render(<PollWidget widget={live('words')} />);
      expect(screen.getByTestId('poll-answered-count')).toHaveTextContent(
        '3 answered'
      );
      expect(screen.getByTitle('gravity (2)')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Hide friction' }));
      // The word goes to the owner-only doc; shared board config never holds it.
      expect(mockSetDoc).toHaveBeenCalledWith(
        { __path: 'poll_sessions/teacher-1_K3F9Q/hidden_words/q1' },
        { words: { __arrayUnion: ['friction'] } },
        { merge: true }
      );
      expect(mockUpdateWidget).not.toHaveBeenCalled();
    });

    it('leaves hidden words out of the cloud and brings them back', () => {
      hiddenWordDocs = [{ id: 'q1', data: { words: ['friction'] } }];
      render(
        <PollWidget
          widget={live('words', { hiddenResponses: ['q1#legacyhash'] })}
        />
      );
      expect(screen.queryByTitle('friction (1)')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Show 1 hidden/ }));
      expect(mockDeleteDoc).toHaveBeenCalledWith({
        __path: 'poll_sessions/teacher-1_K3F9Q/hidden_words/q1',
      });
      // The old hashed key is dropped from config on that write.
      expect(lastConfig().hiddenResponses).toEqual([]);
    });

    it('waits for hidden words before drawing the cloud', () => {
      mockOnSnapshot.mockImplementation(
        (ref: unknown, cb: (snap: unknown) => void) => {
          if (typeof ref === 'string' && ref.endsWith('/hidden_words'))
            return vi.fn();
          const docs = liveVotes.map((d) => ({ id: d.id, data: () => d.data }));
          cb({ docs, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) });
          return vi.fn();
        }
      );
      render(<PollWidget widget={live('words')} />);
      expect(screen.queryByTitle('friction (1)')).not.toBeInTheDocument();
    });

    it('orders open responses by server time over the student clock', () => {
      liveVotes = [
        {
          id: '0_p1',
          data: {
            questionIndex: 0,
            text: 'pinned',
            votedAt: 9e12,
            answeredAt: { toMillis: () => 1 },
          },
        },
        {
          id: '0_p2',
          data: {
            questionIndex: 0,
            text: 'latest',
            votedAt: 1,
            answeredAt: { toMillis: () => 2 },
          },
        },
      ];
      render(<PollWidget widget={live('text')} />);
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('latest');
    });

    it('lists open responses newest first and hides one', () => {
      render(<PollWidget widget={live('text')} />);
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('friction');
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Hide response' })[0]
      );
      expect(lastConfig().hiddenResponses).toEqual(['q1:0_p3']);
    });

    it('brings hidden responses back', () => {
      render(
        <PollWidget
          widget={live('text', { hiddenResponses: ['q1:0_p3', 'q9:x'] })}
        />
      );
      expect(screen.queryByText('friction')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Show 1 hidden/ }));
      expect(lastConfig().hiddenResponses).toEqual(['q9:x']);
    });

    it('holds answers back while results are hidden', () => {
      render(<PollWidget widget={live('text', { hideResults: true })} />);
      expect(screen.queryByText('friction')).not.toBeInTheDocument();
    });
  });
});
