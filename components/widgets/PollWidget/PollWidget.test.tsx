import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PollWidget, PollSettings } from '.';
import { useDashboard } from '@/context/useDashboard';
import {
  useGlobalStyle,
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { vi, describe, it, expect, Mock, beforeEach, afterEach } from 'vitest';
import { WidgetData, DEFAULT_GLOBAL_STYLE } from '@/types';
import { GeneratedPoll } from '@/utils/ai';

// Mock useDashboard (PollSettings still consumes the legacy context).
vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

// Mock the mount-stable store surfaces (PollWidget consumes these).
vi.mock('@/context/dashboardCanvasStore');

// Mock useAuth
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const { mockOnSnapshot, mockCollection, mockDoc, mockSetDoc } = vi.hoisted(
  () => ({
    mockOnSnapshot: vi.fn(),
    mockCollection: vi.fn(() => 'col'),
    mockDoc: vi.fn((..._args: unknown[]) => ({
      __path: _args.slice(1).join('/'),
    })),
    mockSetDoc: vi.fn(),
  })
);

let pollSnapshotDocs: Record<string, unknown>[] = [];

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  increment: (n: number) => ({ __increment: n }),
}));

// Mock MagicInput to simulate interaction
vi.mock('@/components/common/MagicInput', () => ({
  MagicInput: ({
    onSuccess,
    buttonLabel,
  }: {
    onSuccess: (data: GeneratedPoll) => void;
    buttonLabel: string;
  }) => (
    <button
      data-testid="magic-btn"
      onClick={() =>
        onSuccess({
          question: 'Magic Question?',
          options: ['Opt1', 'Opt2', 'Opt3', 'Opt4'],
        })
      }
    >
      {buttonLabel}
    </button>
  ),
}));

describe('PollWidget', () => {
  const mockUpdateWidget = vi.fn();

  beforeEach(() => {
    // Clear call history FIRST, then install stubs — clearing afterward would
    // wipe nothing functional (clearAllMocks keeps implementations) but reads
    // as a footgun. Order it conventionally so the stubs are the final word.
    vi.clearAllMocks();
    vi.mocked(useGlobalStyle).mockReturnValue({
      ...DEFAULT_GLOBAL_STYLE,
      fontFamily: 'sans',
    });
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
    } as unknown as DashboardActions);
    (useAuth as Mock).mockReturnValue({
      user: { uid: 'teacher-1' },
      canAccessFeature: vi.fn(() => true),
    });
    pollSnapshotDocs = [];
    mockSetDoc.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        cb: (snap: { docs: { data: () => Record<string, unknown> }[] }) => void
      ) => {
        cb({ docs: pollSnapshotDocs.map((d) => ({ data: () => d })) });
        return vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders question and options, and allows voting', () => {
    const mockWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Favorite Color?',
        options: [
          { id: 'opt-1', label: 'Red', votes: 2 },
          { id: 'opt-2', label: 'Blue', votes: 3 },
        ],
      },
    };

    render(<PollWidget widget={mockWidget} />);

    expect(screen.getByText('Favorite Color?')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();

    const redButton = screen.getByRole('button', { name: /Red/i });
    fireEvent.click(redButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: {
        question: 'Favorite Color?',
        options: [
          { id: 'opt-1', label: 'Red', votes: 3 },
          { id: 'opt-2', label: 'Blue', votes: 3 },
        ],
      },
    });
  });

  it('resets the poll when Reset Poll is clicked', async () => {
    const mockWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Test',
        options: [
          { id: 'opt-1', label: 'A', votes: 5 },
          { id: 'opt-2', label: 'B', votes: 10 },
        ],
      },
    };

    render(<PollWidget widget={mockWidget} />);

    const resetBtn = screen.getByRole('button', { name: /Reset Poll/i });
    fireEvent.click(resetBtn);

    await waitFor(() =>
      expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
        config: {
          question: 'Test',
          options: [
            { id: 'opt-1', label: 'A', votes: 0 },
            { id: 'opt-2', label: 'B', votes: 0 },
          ],
        },
      })
    );
  });

  it('shows live aggregated tallies from the session when voting is live', () => {
    pollSnapshotDocs = [
      { optionIndex: 0 },
      { optionIndex: 0 },
      { optionIndex: 1 },
    ];
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [
          { id: 'opt-1', label: 'Red', votes: 99 },
          { id: 'opt-2', label: 'Blue', votes: 99 },
        ],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollWidget widget={widget} />);

    // Live counts (2 / 1) replace the stale local config votes (99 / 99).
    expect(screen.getByText(/2 \(67%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 \(33%\)/)).toBeInTheDocument();
  });

  it('renders an on-board join QR + link when voting is live and anonymous-join is allowed', () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'Red', votes: 0 }],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollWidget widget={widget} />);

    const link = screen.getByTestId('poll-join-url');
    expect(link.textContent ?? '').toContain('/poll/sess-1');
    const qr = screen.getByAltText(/join qr/i);
    expect(qr.getAttribute('src') ?? '').toContain(
      'https://api.qrserver.com/v1/create-qr-code/'
    );
  });

  it('does not increment local votes when clicking an option while live', () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'Red', votes: 0 }],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollWidget widget={widget} />);
    fireEvent.click(screen.getByRole('button', { name: /Red/i }));
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('shows the "Voting open" indicator but no QR/link when anonymous-join is denied', () => {
    (useAuth as Mock).mockReturnValue({
      user: { uid: 'teacher-1' },
      canAccessFeature: vi.fn(() => false),
    });
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'Red', votes: 0 }],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollWidget widget={widget} />);

    // Live session is active, so the board still signals voting is open...
    expect(screen.getByText(/voting open/i)).toBeInTheDocument();
    // ...but the join QR + link are gated off without anonymous-join.
    expect(screen.queryByTestId('poll-join-url')).not.toBeInTheDocument();
    expect(screen.queryByAltText(/join qr/i)).not.toBeInTheDocument();
  });
});

describe('PollSettings', () => {
  const mockUpdateWidget = vi.fn();
  const mockAddToast = vi.fn();
  const mockCanAccessFeature = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
      rosters: [],
      activeRosterId: null,
    });
    (useAuth as Mock).mockReturnValue({
      user: { uid: 'teacher-1' },
      canAccessFeature: mockCanAccessFeature,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('updates widget config when magic poll is generated', () => {
    const mockWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Original Question',
        options: [],
      },
    };

    render(<PollSettings widget={mockWidget} />);

    // Find the magic button (from our mock)
    const magicBtn = screen.getByTestId('magic-btn');
    expect(magicBtn).toBeInTheDocument();

    // Click it to trigger onSuccess
    fireEvent.click(magicBtn);

    // Verify updateWidget was called with new config
    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: {
        question: 'Magic Question?',
        options: [
          expect.objectContaining({ label: 'Opt1', votes: 0 }),
          expect.objectContaining({ label: 'Opt2', votes: 0 }),
          expect.objectContaining({ label: 'Opt3', votes: 0 }),
          expect.objectContaining({ label: 'Opt4', votes: 0 }),
        ],
      },
    });

    // Verify toast
    expect(mockAddToast).toHaveBeenCalledWith('Poll generated.', 'success');
  });

  it('updates the question on blur', () => {
    const mockWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Old Question',
        options: [],
      },
    };

    render(<PollSettings widget={mockWidget} />);

    const input = screen.getByPlaceholderText('Enter your question...');
    fireEvent.change(input, { target: { value: 'New Question' } });
    fireEvent.blur(input);

    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: {
        question: 'New Question',
        options: [],
      },
    });
  });

  it('adds and removes options', () => {
    const mockWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Test',
        options: [{ id: 'opt-1', label: 'Opt 1', votes: 0 }],
      },
    };

    render(<PollSettings widget={mockWidget} />);

    // Add option
    const addBtn = screen.getByRole('button', { name: /Add Option/i });
    fireEvent.click(addBtn);

    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: {
        question: 'Test',
        options: [
          expect.objectContaining({ label: 'Opt 1', votes: 0 }),
          expect.objectContaining({ label: 'Option 2', votes: 0 }),
        ],
      },
    });

    // Remove option
    const removeBtns = screen.getAllByTitle('Remove Option');
    expect(removeBtns).toHaveLength(1);
    fireEvent.click(removeBtns[0]);

    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: {
        question: 'Test',
        options: [],
      },
    });
  });

  it('imports options from active class roster', () => {
    (useDashboard as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
      activeRosterId: 'roster-1',
      rosters: [
        {
          id: 'roster-1',
          name: 'Class A',
          students: [
            { id: '1', firstName: 'John', lastName: 'Doe', pin: '123' },
            { id: '2', firstName: 'Jane', lastName: 'Smith', pin: '456' },
          ],
        },
      ],
    });

    const mockWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Who is your favorite?',
        options: [],
      },
    };

    render(<PollSettings widget={mockWidget} />);

    const importBtn = screen.getByRole('button', { name: /Import Class/i });
    fireEvent.click(importBtn);

    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: {
        question: 'Who is your favorite?',
        options: [
          expect.objectContaining({ label: 'John Doe', votes: 0 }),
          expect.objectContaining({ label: 'Jane Smith', votes: 0 }),
        ],
      },
    });
    expect(mockAddToast).toHaveBeenCalledWith(
      'Imported 2 students!',
      'success'
    );
  });

  it('exports results to CSV', () => {
    const mockWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Test',
        options: [{ id: 'opt-1', label: 'Option 1', votes: 5 }],
      },
    };

    const originalCreateElement = document.createElement.bind(document);
    const mockCreateElement = vi.spyOn(document, 'createElement');
    const mockCreateObjectURL = vi.fn(() => 'blob:test-url');
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...global.URL,
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    let mockAnchor: HTMLAnchorElement | null = null;

    mockCreateElement.mockImplementation((tagName) => {
      if (tagName === 'a') {
        const a = originalCreateElement('a');
        a.click = vi.fn();
        a.setAttribute = vi.fn();
        mockAnchor = a;
        return a;
      }
      return originalCreateElement(tagName);
    });

    render(<PollSettings widget={mockWidget} />);

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    fireEvent.click(exportBtn);

    expect(mockCreateObjectURL).toHaveBeenCalled();
    // Ensure anchor was assigned
    expect(mockAnchor).not.toBeNull();
    // Use type assertion since we mocked it manually
    type MockedAnchor = { setAttribute: Mock; click: Mock };
    const anchor = mockAnchor as unknown as MockedAnchor;

    expect(anchor.setAttribute).toHaveBeenCalledWith('href', 'blob:test-url');
    expect(anchor.setAttribute).toHaveBeenCalledWith(
      'download',
      expect.stringContaining('Poll_Results_')
    );
    expect(anchor.click).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    expect(mockAddToast).toHaveBeenCalledWith(
      'Results exported to CSV',
      'success'
    );
  });

  it('starts a fresh device-voting session when there is no prior session', async () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [
          { id: 'opt-1', label: 'A', votes: 0 },
          { id: 'opt-2', label: 'B', votes: 0 },
        ],
      },
    };

    render(<PollSettings widget={widget} />);

    fireEvent.click(
      screen.getByRole('button', { name: /start device voting/i })
    );

    // Session doc is written active, then config gains an activePollSessionId.
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    await waitFor(() => {
      const lastCall = mockUpdateWidget.mock.calls[
        mockUpdateWidget.mock.calls.length - 1
      ] as [string, { config: { activePollSessionId?: string | null } }];
      expect(lastCall[0]).toBe('poll-1');
      expect(typeof lastCall[1].config.activePollSessionId).toBe('string');
      expect(lastCall[1].config.activePollSessionId).toBeTruthy();
    });
  });

  it('offers Resume / Restart when a prior session exists', () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'A', votes: 0 }],
        lastPollSessionId: 'prev-1',
      },
    };

    render(<PollSettings widget={widget} />);

    fireEvent.click(
      screen.getByRole('button', { name: /start device voting/i })
    );

    expect(
      screen.getByRole('button', { name: /resume previous/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start fresh/i })
    ).toBeInTheDocument();
  });

  it('stops a live session', async () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'A', votes: 0 }],
        activePollSessionId: 'sess-9',
      },
    };

    render(<PollSettings widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: /stop voting/i }));

    await waitFor(() => {
      const lastCall = mockUpdateWidget.mock.calls[
        mockUpdateWidget.mock.calls.length - 1
      ] as [
        string,
        {
          config: {
            activePollSessionId?: string | null;
            lastPollSessionId?: string | null;
          };
        },
      ];
      expect(lastCall[1].config.activePollSessionId).toBeNull();
      expect(lastCall[1].config.lastPollSessionId).toBe('sess-9');
    });
  });

  it('locks option editing while a session is live', () => {
    const widget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: {
        question: 'Pick one',
        options: [{ id: 'opt-1', label: 'A', votes: 0 }],
        activePollSessionId: 'sess-1',
      },
    };

    render(<PollSettings widget={widget} />);

    // Editing options mid-vote would desync the rules' fixed optionCount and
    // remap index-keyed votes, so the controls are disabled (fieldset) + a
    // notice is shown while a session is live.
    expect(screen.getByRole('button', { name: /add option/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /import class/i })
    ).toBeDisabled();
    expect(screen.getByText(/stop voting to add/i)).toBeInTheDocument();
  });
});
