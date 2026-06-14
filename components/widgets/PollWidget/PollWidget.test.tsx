import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PollWidget, PollSettings } from '.';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { vi, describe, it, expect, Mock, beforeEach, afterEach } from 'vitest';
import { WidgetData } from '@/types';
import { GeneratedPoll } from '@/utils/ai';

// Mock useDashboard
vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

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
    (useDashboard as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      activeDashboard: { globalStyle: { fontFamily: 'sans' } },
    });
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
    vi.clearAllMocks();
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
});

describe('PollSettings', () => {
  const mockUpdateWidget = vi.fn();
  const mockAddToast = vi.fn();
  const mockCanAccessFeature = vi.fn(() => true);

  beforeEach(() => {
    (useDashboard as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
      rosters: [],
      activeRosterId: null,
    });
    (useAuth as Mock).mockReturnValue({
      canAccessFeature: mockCanAccessFeature,
    });
    vi.clearAllMocks();
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
});
