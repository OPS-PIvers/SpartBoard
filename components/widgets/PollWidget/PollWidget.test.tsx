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

const { mockOnSnapshot, mockCollection, mockDoc, mockSetDoc, mockGetDocs } =
  vi.hoisted(() => ({
    mockOnSnapshot: vi.fn(),
    mockCollection: vi.fn(() => 'col'),
    mockDoc: vi.fn((..._args: unknown[]) => ({
      __path: _args.slice(1).join('/'),
    })),
    mockSetDoc: vi.fn(),
    mockGetDocs: vi.fn(),
  }));

let pollSnapshotDocs: { id: string; data: Record<string, unknown> }[] = [];

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  getDocs: mockGetDocs,
  limit: vi.fn((n: number) => ({ __limit: n })),
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn((field: string, _op: string, value: unknown) => ({
    __where: [field, value],
  })),
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
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        cb: (snap: {
          docs: { id: string; data: () => Record<string, unknown> }[];
          forEach: (fn: (d: unknown) => void) => void;
        }) => void
      ) => {
        const docs = pollSnapshotDocs.map((d) => ({
          id: d.id,
          data: () => d.data,
        }));
        // The announcement listener iterates with forEach; the session
        // listener maps over `docs`. Supply both shapes.
        cb({ docs, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) });
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
        questions: [
          {
            id: 'q-1',
            question: 'Favorite Color?',
            options: [
              { id: 'opt-1', label: 'Red', votes: 3 },
              { id: 'opt-2', label: 'Blue', votes: 3 },
            ],
          },
        ],
        currentQuestionIndex: 0,
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
          questions: [
            {
              id: 'q-1',
              question: 'Test',
              options: [
                { id: 'opt-1', label: 'A', votes: 0 },
                { id: 'opt-2', label: 'B', votes: 0 },
              ],
            },
          ],
          currentQuestionIndex: 0,
        },
      })
    );
  });

  it('shows live aggregated tallies from the session when voting is live', () => {
    pollSnapshotDocs = [
      { id: '0_a', data: { questionIndex: 0, optionIndex: 0 } },
      { id: '0_b', data: { questionIndex: 0, optionIndex: 0 } },
      { id: '0_c', data: { questionIndex: 0, optionIndex: 1 } },
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
        activePollSessionId: 'K3F9Q',
        joinCode: 'K3F9Q',
      },
    };

    render(<PollWidget widget={widget} />);

    const link = screen.getByTestId('poll-join-url');
    expect(link.textContent ?? '').toBe('K3F9Q');
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

  const multiQuestionWidget = (
    overrides: Record<string, unknown> = {}
  ): WidgetData => ({
    id: 'poll-1',
    type: 'poll',
    w: 2,
    h: 2,
    x: 0,
    y: 0,
    z: 1,
    flipped: false,
    config: {
      questions: [
        {
          id: 'q1',
          question: 'First question?',
          options: [{ id: 'o1', label: 'Red', votes: 0 }],
        },
        {
          id: 'q2',
          question: 'Second question?',
          options: [{ id: 'o2', label: 'Blue', votes: 0 }],
        },
      ],
      currentQuestionIndex: 0,
      ...overrides,
    },
  });

  it('hides the navigation entirely for a single-question poll', () => {
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
        question: 'Only one',
        options: [{ id: 'opt-1', label: 'Red', votes: 0 }],
      },
    };

    render(<PollWidget widget={widget} />);

    expect(
      screen.queryByRole('button', { name: /next question/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /previous question/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('poll-question-indicator')
    ).not.toBeInTheDocument();
  });

  it('shows arrows and a counter for a multi-question poll', () => {
    render(<PollWidget widget={multiQuestionWidget()} />);

    expect(screen.getByText('First question?')).toBeInTheDocument();
    expect(screen.getByTestId('poll-question-indicator')).toHaveTextContent(
      '1 / 2'
    );
    expect(
      screen.getByRole('button', { name: /previous question/i })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /next question/i })
    ).toBeEnabled();
  });

  it('advances the presentation cursor with the next arrow', () => {
    render(<PollWidget widget={multiQuestionWidget()} />);

    fireEvent.click(screen.getByRole('button', { name: /next question/i }));

    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: expect.objectContaining({ currentQuestionIndex: 1 }) as unknown,
    });
  });

  it('disables the next arrow on the last question', () => {
    render(
      <PollWidget widget={multiQuestionWidget({ currentQuestionIndex: 1 })} />
    );

    expect(screen.getByText('Second question?')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /next question/i })
    ).toBeDisabled();
  });

  it('pushes the cursor to the session doc so phones follow in lockstep', async () => {
    render(
      <PollWidget
        widget={multiQuestionWidget({
          activePollSessionId: 'K3F9Q',
          joinCode: 'K3F9Q',
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /next question/i }));

    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ currentQuestionIndex: 1 }),
        { merge: true }
      )
    );
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_K3F9Q'
    );
  });

  it('tallies only the current question when a session is live', () => {
    pollSnapshotDocs = [
      { id: '0_a', data: { questionIndex: 0, optionIndex: 0 } },
      { id: '1_b', data: { questionIndex: 1, optionIndex: 0 } },
      { id: '1_c', data: { questionIndex: 1, optionIndex: 0 } },
    ];

    render(
      <PollWidget
        widget={multiQuestionWidget({
          currentQuestionIndex: 1,
          activePollSessionId: 'K3F9Q',
          joinCode: 'K3F9Q',
        })}
      />
    );

    // Question 2 has two votes; question 1's single vote must not leak in.
    expect(screen.getByText(/2 \(100%\)/)).toBeInTheDocument();
  });

  it('renders only the first question with no arrows inside an announcement', () => {
    render(
      <PollWidget
        widget={multiQuestionWidget({
          _announcementId: 'ann-1',
          currentQuestionIndex: 1,
        })}
      />
    );

    expect(screen.getByText('First question?')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /next question/i })
    ).not.toBeInTheDocument();
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
        questions: [
          expect.objectContaining({ question: 'Original Question' }),
          expect.objectContaining({
            question: 'Magic Question?',
            options: [
              expect.objectContaining({ label: 'Opt1', votes: 0 }),
              expect.objectContaining({ label: 'Opt2', votes: 0 }),
              expect.objectContaining({ label: 'Opt3', votes: 0 }),
              expect.objectContaining({ label: 'Opt4', votes: 0 }),
            ],
          }),
        ],
        currentQuestionIndex: 0,
      },
    });

    // Verify toast
    expect(mockAddToast).toHaveBeenCalledWith('Question added.', 'success');
  });

  it('associates the "Draft with AI" heading with its fieldset via aria-labelledby', () => {
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

    expect(
      screen.getByRole('group', { name: 'Draft with AI' })
    ).toBeInTheDocument();
  });

  it('REGRESSION: a join-code mint does not revert an edit made while it was in flight', async () => {
    // The mint is a getDocs + setDoc round-trip. It used to resolve with the
    // config snapshot captured at mount and spread the whole thing back, so an
    // edit landing mid-flight was silently reverted.
    let releaseMint: (value: { empty: boolean; docs: never[] }) => void = () =>
      undefined;
    mockGetDocs.mockReturnValue(
      new Promise<{ empty: boolean; docs: never[] }>((resolve) => {
        releaseMint = resolve;
      })
    );

    const staleWidget: WidgetData = {
      id: 'poll-1',
      type: 'poll',
      w: 2,
      h: 2,
      x: 0,
      y: 0,
      z: 1,
      flipped: false,
      config: { question: 'Before edit', options: [] },
    };

    const { rerender } = render(<PollSettings widget={staleWidget} />);

    // The teacher edits while the mint is still in flight.
    const editedWidget: WidgetData = {
      ...staleWidget,
      config: { question: 'After edit', options: [] },
    };
    rerender(<PollSettings widget={editedWidget} />);

    releaseMint({ empty: true, docs: [] });

    await waitFor(() => {
      const withCode = mockUpdateWidget.mock.calls.find(
        ([, update]) =>
          (update as { config: { joinCode?: string } }).config.joinCode
      );
      expect(withCode).toBeDefined();
      // The mint patches ONLY joinCode, so it carries no stale question to
      // write back over the edit that landed while it was in flight.
      const patched = (
        withCode as [string, { config: Record<string, unknown> }]
      )[1].config;
      expect(patched.question).toBeUndefined();
      expect(Object.keys(patched)).toEqual(['joinCode']);
    });
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
        questions: [{ id: 'q-1', question: 'New Question', options: [] }],
        currentQuestionIndex: 0,
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
        questions: [
          expect.objectContaining({
            question: 'Test',
            options: [
              expect.objectContaining({ label: 'Opt 1', votes: 0 }),
              expect.objectContaining({ label: 'Option 2', votes: 0 }),
            ],
          }),
        ],
        currentQuestionIndex: 0,
      },
    });

    // Remove option
    const removeBtns = screen.getAllByTitle('Remove Option');
    expect(removeBtns).toHaveLength(1);
    fireEvent.click(removeBtns[0]);

    expect(mockUpdateWidget).toHaveBeenCalledWith('poll-1', {
      config: {
        questions: [expect.objectContaining({ question: 'Test', options: [] })],
        currentQuestionIndex: 0,
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
        questions: [
          expect.objectContaining({
            question: 'Who is your favorite?',
            options: [
              expect.objectContaining({ label: 'John Doe', votes: 0 }),
              expect.objectContaining({ label: 'Jane Smith', votes: 0 }),
            ],
          }),
        ],
        currentQuestionIndex: 0,
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

  it('REGRESSION: exported CSV filename uses the local date, not the UTC date', () => {
    // UTC+12 admin at local midnight 2026-06-15 (= 2026-06-14T12:00:00Z).
    // Old code: toISOString() -> "2026-06-14T12:00:00.000Z" -> "2026-06-14".
    // Fixed code: local getters -> "2026-06-15" via getLocalIsoDate().
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(5);
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(15);

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
    vi.stubGlobal('URL', {
      ...global.URL,
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn(),
    });

    let mockAnchor: HTMLAnchorElement | undefined;
    mockCreateElement.mockImplementation((tagName) => {
      if (tagName === 'a') {
        const a = originalCreateElement('a');
        mockAnchor = a;
        return a;
      }
      return originalCreateElement(tagName);
    });

    render(<PollSettings widget={mockWidget} />);
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));

    // BUG: toISOString-based code names the file after today's UTC date
    // ("Poll_Results_2026-06-14.csv") — this assertion fails on the pre-fix
    // implementation and passes once getLocalIsoDate() is used.
    expect(mockAnchor?.getAttribute('download')).toBe(
      'Poll_Results_2026-06-15.csv'
    );

    vi.useRealTimers();
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
      const calls = mockUpdateWidget.mock.calls as [
        string,
        { config: { activePollSessionId?: string | null } },
      ][];
      const started = calls.find(
        ([id, update]) =>
          id === 'poll-1' &&
          typeof update.config.activePollSessionId === 'string' &&
          update.config.activePollSessionId.length > 0
      );
      expect(started).toBeDefined();
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
      const calls = mockUpdateWidget.mock.calls as [
        string,
        {
          config: {
            activePollSessionId?: string | null;
            lastPollSessionId?: string | null;
          };
        },
      ][];
      const stopped = calls.find(
        ([, update]) =>
          update.config.activePollSessionId === null &&
          update.config.lastPollSessionId === 'sess-9'
      );
      expect(stopped).toBeDefined();
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
