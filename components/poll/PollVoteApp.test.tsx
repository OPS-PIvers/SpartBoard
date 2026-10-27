import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollSessionDoc } from '@/types';

const {
  mockSignInAnonymously,
  mockSetDoc,
  mockOnSnapshot,
  mockCollection,
  mockDoc,
  mockLookup,
} = vi.hoisted(() => ({
  mockSignInAnonymously: vi.fn(),
  mockSetDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockCollection: vi.fn(() => 'votes-col'),
  mockDoc: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
  mockLookup: vi.fn(),
}));

let snapshotDocs: { id: string; data: Record<string, unknown> }[] = [];
let myAnswerText: string | null = null;
let sessionDoc: PollSessionDoc;

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'voter-1' } },
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: mockSignInAnonymously }));
vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  serverTimestamp: () => 'SERVER_TIME',
  setDoc: mockSetDoc,
}));
vi.mock('./pollSession', async () => {
  const actual =
    await vi.importActual<typeof import('./pollSession')>('./pollSession');
  return {
    ...actual,
    lookupPollSessionByCode: (code: string) => mockLookup(code) as unknown,
  };
});

import { PollVoteApp } from './PollVoteApp';

const makeSession = (
  overrides: Partial<PollSessionDoc> = {}
): PollSessionDoc => ({
  id: 'K3F9Q',
  teacherUid: 'teacher-1',
  code: 'K3F9Q',
  questions: [
    {
      id: 'q1',
      question: 'Favorite fruit?',
      options: [
        { id: 'o1', label: 'Apple' },
        { id: 'o2', label: 'Banana' },
      ],
    },
    {
      id: 'q2',
      question: 'Best season?',
      options: [
        { id: 'o3', label: 'Summer' },
        { id: 'o4', label: 'Winter' },
      ],
    },
  ],
  optionCounts: [2, 2],
  currentQuestionIndex: 0,
  active: true,
  startedAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const mountWith = (search: string) =>
  window.history.replaceState({}, '', `/poll${search}`);

beforeEach(() => {
  vi.clearAllMocks();
  snapshotDocs = [];
  myAnswerText = null;
  sessionDoc = makeSession();
  mockSignInAnonymously.mockResolvedValue(undefined);
  mockSetDoc.mockResolvedValue(undefined);
  mockLookup.mockImplementation(() =>
    Promise.resolve({ sessionId: 'teacher-1_K3F9Q', data: sessionDoc })
  );
  // Two listeners: the votes collection (ref === 'votes-col' from
  // mockCollection) and the session doc (a doc ref from mockDoc).
  mockOnSnapshot.mockImplementation(
    (ref: unknown, cb: (snap: unknown) => void) => {
      if (ref === 'votes-col') {
        cb({
          docs: snapshotDocs.map((d) => ({ id: d.id, data: () => d.data })),
        });
      } else if ((ref as { __path?: string }).__path?.includes('/answers/')) {
        cb({
          exists: () => myAnswerText !== null,
          data: () => ({ text: myAnswerText }),
        });
      } else {
        cb({ exists: () => true, data: () => sessionDoc });
      }
      return vi.fn();
    }
  );
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('PollVoteApp', () => {
  it('shows an error state when the URL carries no code', async () => {
    mountWith('');
    render(<PollVoteApp />);
    expect(await screen.findByText(/isn't available/i)).toBeInTheDocument();
  });

  it('shows an error state when the code resolves to nothing', async () => {
    mockLookup.mockResolvedValue(null);
    mountWith('?code=NOPE1');
    render(<PollVoteApp />);
    expect(await screen.findByText(/isn't available/i)).toBeInTheDocument();
  });

  it('renders the current question and its options', async () => {
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    expect(await screen.findByText('Favorite fruit?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apple/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Banana/i })).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('accepts a lowercase, punctuated code', async () => {
    mountWith('?code=k3f-9q');
    render(<PollVoteApp />);
    await screen.findByText('Favorite fruit?');
    expect(mockLookup).toHaveBeenCalledWith('K3F9Q');
  });

  it('waits for the teacher when the session has not started', async () => {
    sessionDoc = makeSession({ startedAt: null, active: false });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    expect(
      await screen.findByText(/waiting for your teacher/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Apple/i })
    ).not.toBeInTheDocument();
  });

  it('shows the closed banner once a started session goes inactive', async () => {
    sessionDoc = makeSession({ active: false });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    expect(await screen.findByText(/voting is closed/i)).toBeInTheDocument();
  });

  it('follows the teacher’s question cursor', async () => {
    sessionDoc = makeSession({ currentQuestionIndex: 1 });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    expect(await screen.findByText('Best season?')).toBeInTheDocument();
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
  });

  it('writes a question-keyed vote doc', async () => {
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    await screen.findByText('Favorite fruit?');
    await userEvent.click(screen.getByRole('button', { name: /Banana/i }));

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_K3F9Q',
      'votes',
      '0_voter-1'
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ questionIndex: 0, optionIndex: 1 })
    );
  });

  it('keys the vote to the question the teacher is showing', async () => {
    sessionDoc = makeSession({ currentQuestionIndex: 1 });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    await screen.findByText('Best season?');
    await userEvent.click(screen.getByRole('button', { name: /Winter/i }));

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_K3F9Q',
      'votes',
      '1_voter-1'
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ questionIndex: 1, optionIndex: 1 })
    );
  });

  it('shows this question’s tallies once the voter has voted', async () => {
    snapshotDocs = [
      { id: '0_voter-1', data: { questionIndex: 0, optionIndex: 0 } },
      { id: '0_voter-2', data: { questionIndex: 0, optionIndex: 0 } },
      { id: '0_voter-3', data: { questionIndex: 0, optionIndex: 1 } },
      { id: '1_voter-9', data: { questionIndex: 1, optionIndex: 1 } },
    ];
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    await screen.findByText('Favorite fruit?');

    // Question 1's votes only — the question-2 vote must not leak in.
    expect(await screen.findByTestId('poll-tally-0')).toHaveTextContent(
      '2 (67%)'
    );
    expect(screen.getByTestId('poll-tally-1')).toHaveTextContent('1 (33%)');
  });

  it('shows the closed state when the vote write is rejected', async () => {
    mockSetDoc.mockRejectedValue({ code: 'permission-denied' });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    await screen.findByText('Favorite fruit?');
    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    expect(await screen.findByText(/voting is closed/i)).toBeInTheDocument();
  });

  it('reopens voting when the session comes back live after a rejected vote', async () => {
    let pushSession: ((data: PollSessionDoc) => void) | null = null;
    mockOnSnapshot.mockImplementation(
      (ref: unknown, cb: (snap: unknown) => void) => {
        if (ref === 'votes-col') {
          cb({ docs: [] });
        } else {
          pushSession = (data) => cb({ exists: () => true, data: () => data });
          pushSession(sessionDoc);
        }
        return vi.fn();
      }
    );
    mockSetDoc.mockRejectedValueOnce({ code: 'permission-denied' });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    await screen.findByText('Favorite fruit?');
    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    expect(await screen.findByText(/voting is closed/i)).toBeInTheDocument();

    act(() => pushSession?.(makeSession({ active: false })));
    act(() => pushSession?.(makeSession({ active: true })));

    expect(screen.queryByText(/voting is closed/i)).not.toBeInTheDocument();
    const apple = screen.getByRole('button', { name: /Apple/i });
    expect(apple).toBeEnabled();
    await userEvent.click(apple);
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalledTimes(2));
  });

  it('keeps the options open when a vote fails for a non-rules reason', async () => {
    mockSetDoc.mockRejectedValueOnce({ code: 'unavailable' });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    await screen.findByText('Favorite fruit?');
    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apple/i })).toBeEnabled()
    );
    expect(screen.queryByText(/voting is closed/i)).not.toBeInTheDocument();
  });

  it('shows a rating scale as number buttons with end labels and an average', async () => {
    sessionDoc = makeSession({
      questions: [
        {
          id: 'q1',
          question: 'How sure are you?',
          kind: 'scale',
          scaleLow: 'Not sure',
          scaleHigh: 'Very sure',
          options: [1, 2, 3, 4, 5].map((n) => ({
            id: `s${n}`,
            label: String(n),
          })),
        },
      ],
      optionCounts: [5],
    });
    snapshotDocs = [
      {
        id: '0_voter-1',
        data: { questionIndex: 0, optionIndex: 3, votedAt: 1 },
      },
      {
        id: '0_voter-2',
        data: { questionIndex: 0, optionIndex: 1, votedAt: 1 },
      },
    ];
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    expect(await screen.findByTestId('poll-scale-ballot')).toBeInTheDocument();
    expect(screen.getByText('Not sure')).toBeInTheDocument();
    expect(screen.getByText('Very sure')).toBeInTheDocument();
    // The voter's uid arrives after sign-in resolves, so wait for the pressed state.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^4/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    expect(screen.getByTestId('poll-scale-average')).toHaveTextContent(
      'Average 3.0'
    );
    await userEvent.click(screen.getByRole('button', { name: /^5/ }));
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ questionIndex: 0, optionIndex: 4 })
    );
  });

  it('sends up to three words on a word cloud question', async () => {
    sessionDoc = makeSession({
      questions: [
        {
          id: 'q1',
          question: 'One word for today?',
          kind: 'words',
          options: [],
        },
      ],
      optionCounts: [0],
      textQuestions: [0],
    });
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    const input = await screen.findByRole('textbox', { name: 'Your answer' });
    await userEvent.type(input, '  sunny and   warm today ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        { __path: 'poll_sessions/teacher-1_K3F9Q/answers/0_voter-1' },
        expect.objectContaining({
          questionIndex: 0,
          text: 'sunny and warm',
          answeredAt: 'SERVER_TIME',
        })
      )
    );
  });

  it('shows an open response answer already sent', async () => {
    sessionDoc = makeSession({
      questions: [{ id: 'q1', question: 'Why?', kind: 'text', options: [] }],
      optionCounts: [0],
      textQuestions: [0],
    });
    myAnswerText = 'Because';
    mountWith('?code=K3F9Q');
    render(<PollVoteApp />);
    expect(await screen.findByText('Your answer is in!')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
      'Because'
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
