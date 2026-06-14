import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePollData, type PollVotePayload } from './pollLink';

const {
  mockSignInAnonymously,
  mockSetDoc,
  mockOnSnapshot,
  mockCollection,
  mockDoc,
} = vi.hoisted(() => ({
  mockSignInAnonymously: vi.fn(),
  mockSetDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockCollection: vi.fn(() => 'votes-col'),
  mockDoc: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
}));

let snapshotDocs: Record<string, unknown>[] = [];

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'voter-1' } },
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: mockSignInAnonymously }));
vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
}));

import { PollVoteApp } from './PollVoteApp';

const payload: PollVotePayload = {
  id: 'sess-1',
  question: 'Favorite fruit?',
  options: [
    { id: 'o1', label: 'Apple' },
    { id: 'o2', label: 'Banana' },
  ],
  teacherUid: 'teacher-1',
};

const mountWith = (search: string) =>
  window.history.replaceState({}, '', `/poll/sess-1${search}`);

beforeEach(() => {
  vi.clearAllMocks();
  snapshotDocs = [];
  mockSignInAnonymously.mockResolvedValue(undefined);
  mockSetDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation(
    (
      _ref: unknown,
      cb: (snap: { docs: { data: () => Record<string, unknown> }[] }) => void
    ) => {
      cb({ docs: snapshotDocs.map((d) => ({ data: () => d })) });
      return vi.fn();
    }
  );
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('PollVoteApp', () => {
  it('shows an error state when there is no payload', () => {
    mountWith('');
    render(<PollVoteApp />);
    expect(screen.getByText(/isn't available/i)).toBeInTheDocument();
  });

  it('renders the question and option buttons from the payload', () => {
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);
    expect(screen.getByText('Favorite fruit?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apple/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Banana/i })).toBeInTheDocument();
  });

  it('casts a vote to the uid-keyed doc and shows confirmation', async () => {
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);

    await userEvent.click(screen.getByRole('button', { name: /Banana/i }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        { __path: 'poll_sessions/teacher-1_sess-1/votes/voter-1' },
        { optionIndex: 1, votedAt: expect.any(Number) as unknown }
      );
    });
    expect(await screen.findByText(/your vote is in/i)).toBeInTheDocument();
  });

  it('renders the live tally from the votes subscription', async () => {
    snapshotDocs = [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 1 }];
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);

    // Apple shows 2, Banana shows 1 once a vote is cast (tally is revealed
    // after voting). Vote, then assert.
    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    expect(await screen.findByText(/your vote is in/i)).toBeInTheDocument();
    expect(screen.getByTestId('poll-tally-0')).toHaveTextContent('2');
    expect(screen.getByTestId('poll-tally-1')).toHaveTextContent('1');
  });

  it('shows a closed state when the vote write is rejected', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);

    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    expect(await screen.findByText(/voting is closed/i)).toBeInTheDocument();
  });

  it('does not contradict itself when a re-vote is rejected after a successful vote', async () => {
    // First vote succeeds, then the poll closes and the change-vote attempt
    // is rejected. The confirmation must NOT keep inviting another tap while
    // also saying voting is closed.
    mockSetDoc
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('permission-denied'));
    mountWith(`?data=${encodePollData(payload)}`);
    render(<PollVoteApp />);

    await userEvent.click(screen.getByRole('button', { name: /Apple/i }));
    expect(await screen.findByText(/your vote is in/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Banana/i }));
    expect(await screen.findByText(/voting is closed/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/tap another option to change it/i)
    ).not.toBeInTheDocument();
  });
});
