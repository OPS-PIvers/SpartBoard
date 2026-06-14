import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemotePollControl } from './RemotePollControl';
import { WidgetData } from '@/types';

const {
  mockOnSnapshot,
  mockSetDoc,
  mockCollection,
  mockDoc,
  mockUser,
  mockCanAccessFeature,
} = vi.hoisted(() => ({
  mockOnSnapshot: vi.fn(),
  mockSetDoc: vi.fn(),
  mockCollection: vi.fn(() => 'votes-col'),
  mockDoc: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
  mockUser: { uid: 'teacher-1' },
  mockCanAccessFeature: vi.fn(() => true),
}));

let snapshotDocs: Record<string, unknown>[] = [];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser, canAccessFeature: mockCanAccessFeature }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
}));

const idleWidget: WidgetData = {
  id: 'poll-1',
  type: 'poll',
  x: 0,
  y: 0,
  w: 3,
  h: 3,
  z: 1,
  flipped: false,
  config: {
    question: 'Pick one',
    options: [
      { id: 'o1', label: 'Red', votes: 2 },
      { id: 'o2', label: 'Blue', votes: 1 },
    ],
  },
} as WidgetData;

const liveWidget: WidgetData = {
  ...idleWidget,
  config: { ...idleWidget.config, activePollSessionId: 'sess-1' },
} as WidgetData;

beforeEach(() => {
  vi.clearAllMocks();
  snapshotDocs = [];
  mockCanAccessFeature.mockReturnValue(true);
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

describe('RemotePollControl', () => {
  it('shows manual +/- controls when no session is live', () => {
    render(<RemotePollControl widget={idleWidget} updateWidget={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /add vote to Red/i })
    ).toBeInTheDocument();
  });

  it('hides the QR affordance when anonymous-join is not permitted', async () => {
    mockCanAccessFeature.mockReturnValue(false);
    render(<RemotePollControl widget={liveWidget} updateWidget={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /join qr/i })
      ).not.toBeInTheDocument();
    });
    expect(mockCanAccessFeature).toHaveBeenCalledWith('anonymous-join');
  });

  it('renders a join QR + URL when live and toggled on', async () => {
    render(<RemotePollControl widget={liveWidget} updateWidget={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: /show join qr/i })
    );
    const qr = await screen.findByAltText(/join qr/i);
    expect(qr.getAttribute('src') ?? '').toContain(
      'https://api.qrserver.com/v1/create-qr-code/'
    );
    expect(screen.getByTestId('poll-join-url').textContent ?? '').toContain(
      '/poll/sess-1'
    );
  });

  it('starts a fresh session and persists the active id', async () => {
    const updateWidget = vi.fn();
    render(
      <RemotePollControl widget={idleWidget} updateWidget={updateWidget} />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /start voting/i })
    );

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    await waitFor(() => {
      const lastCall = updateWidget.mock.calls[
        updateWidget.mock.calls.length - 1
      ] as [string, { config: { activePollSessionId?: unknown } }];
      expect(typeof lastCall[1].config.activePollSessionId).toBe('string');
      expect(lastCall[1].config.activePollSessionId).toBeTruthy();
    });
  });

  it('shows live tallies (not manual +/-) when a session is live', () => {
    snapshotDocs = [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 1 }];
    render(<RemotePollControl widget={liveWidget} updateWidget={vi.fn()} />);
    // Manual +/- are gone while live.
    expect(
      screen.queryByRole('button', { name: /add vote to Red/i })
    ).not.toBeInTheDocument();
    // Live counts surface (Red 2, Blue 1).
    expect(screen.getByTestId('poll-remote-tally-0')).toHaveTextContent('2');
    expect(screen.getByTestId('poll-remote-tally-1')).toHaveTextContent('1');
  });

  it('stops a live session and clears the active id', async () => {
    const updateWidget = vi.fn();
    render(
      <RemotePollControl widget={liveWidget} updateWidget={updateWidget} />
    );

    await userEvent.click(screen.getByRole('button', { name: /stop voting/i }));

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    await waitFor(() => {
      const lastCall = updateWidget.mock.calls[
        updateWidget.mock.calls.length - 1
      ] as [string, { config: { activePollSessionId?: unknown } }];
      expect(lastCall[1].config.activePollSessionId).toBeNull();
    });
  });
});
