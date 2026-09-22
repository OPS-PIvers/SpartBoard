import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubCollectionsList } from '@/components/subs/SubCollectionsList';
import type { SharedCollection } from '@/types';

const noop = () => undefined;

type SnapHandler = (snap: {
  docs: Array<{ id: string; data: () => unknown }>;
}) => void;
type ErrHandler = (err: { code?: string }) => void;

// The list subscribes now, so the test drives the listener directly: `emit`
// delivers a snapshot, `fail` an error, and `unsubscribed` proves teardown.
let emit: SnapHandler = () => undefined;
let fail: ErrHandler = () => undefined;
const unsubscribe = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db: unknown, path: string) => ({ path })),
  query: vi.fn((...args: unknown[]) => ({ args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
  onSnapshot: vi.fn((_q: unknown, next: SnapHandler, onErr: ErrHandler) => {
    emit = next;
    fail = onErr;
    return unsubscribe;
  }),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const fakeCollection = (
  shareId: string,
  name: string,
  boardIds: string[],
  color?: string
): SharedCollection => ({
  shareId,
  hostUid: 'host-uid',
  hostDisplayName: 'Mr. Teacher',
  intendedMode: 'substitute',
  collection: { name, ...(color !== undefined && { color }) },
  boardIds,
  createdAt: 0,
  expiresAt: Date.now() + 86400000,
  buildingId: 'middle-school',
});

// Each doc needs an `id` property because the component does `shareId: d.id`
// to set the final shareId (spreading over the data's shareId field).
const docsResponse = (...collections: SharedCollection[]) => ({
  docs: collections.map((c) => ({ id: c.shareId, data: () => c })),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubCollectionsList', () => {
  it('renders the loading state until the first snapshot arrives', () => {
    render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    expect(screen.getByText(/loading shared collections/i)).toBeInTheDocument();
  });

  it('renders nothing when no Collections are shared', async () => {
    const { container } = render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    act(() => emit(docsResponse()));
    await waitFor(() => {
      expect(
        screen.queryByText(/loading shared collections/i)
      ).not.toBeInTheDocument();
    });
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders one section per Collection with name + board count', async () => {
    render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    act(() =>
      emit(
        docsResponse(
          fakeCollection('s1', 'Math', ['b1', 'b2']),
          fakeCollection('s2', 'Reading', ['b3'])
        )
      )
    );
    await waitFor(() => {
      expect(screen.getByText('Math')).toBeInTheDocument();
    });
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('2 board(s)')).toBeInTheDocument();
    expect(screen.getByText('1 board(s)')).toBeInTheDocument();
  });

  it('renders per-board buttons as enabled and calls onPickBoard with (shareId, boardId)', async () => {
    const onPickBoard = vi.fn();
    render(
      <SubCollectionsList
        buildingId="middle-school"
        onPickBoard={onPickBoard}
      />
    );
    act(() =>
      emit(docsResponse(fakeCollection('s1', 'Math', ['boardA-1234'])))
    );
    const btn = await screen.findByRole('button', { name: /Board …1234/i });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onPickBoard).toHaveBeenCalledWith('s1', 'boardA-1234');
  });

  // The point of subscribing: the teacher presses "End now" and the card goes
  // without the sub refreshing. "End now" stamps expiresAt in the past, which
  // is a write, so the listener fires and the client filter drops it.
  it('drops a share the teacher has just ended', async () => {
    render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    act(() => emit(docsResponse(fakeCollection('s1', 'Math', ['b1']))));
    await waitFor(() => expect(screen.getByText('Math')).toBeInTheDocument());

    act(() =>
      emit(
        docsResponse({
          ...fakeCollection('s1', 'Math', ['b1']),
          expiresAt: Date.now() - 1,
        })
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Math')).not.toBeInTheDocument()
    );
  });

  it('shows a newly shared Collection without a refresh', async () => {
    render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    act(() => emit(docsResponse(fakeCollection('s1', 'Math', ['b1']))));
    await waitFor(() => expect(screen.getByText('Math')).toBeInTheDocument());

    act(() =>
      emit(
        docsResponse(
          fakeCollection('s1', 'Math', ['b1']),
          fakeCollection('s2', 'Science', ['b2'])
        )
      )
    );
    await waitFor(() =>
      expect(screen.getByText('Science')).toBeInTheDocument()
    );
  });

  it('surfaces a failed subscription rather than an empty pane', async () => {
    render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    // Past the permission-denied retry budget, so this is a real failure.
    act(() => fail({ code: 'unavailable' }));
    await waitFor(() =>
      expect(
        screen.getByText(/couldn't load shared collections/i)
      ).toBeInTheDocument()
    );
  });

  // A stale token right after sign-in denies the first read; retrying keeps
  // the sub on the loading state rather than showing a bogus error.
  it('retries a permission-denied read before giving up', async () => {
    render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    act(() => fail({ code: 'permission-denied' }));
    await waitFor(() =>
      expect(
        screen.getByText(/loading shared collections/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText(/couldn't load shared collections/i)
    ).not.toBeInTheDocument();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(
      <SubCollectionsList buildingId="middle-school" onPickBoard={noop} />
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
