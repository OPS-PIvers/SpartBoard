import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WidgetData } from '@/types';
import { RandomWidget } from '@/components/widgets/random/RandomWidget';

const mockUpdateWidget = vi.fn();
const mockUpdateDashboard = vi.fn();

// Mutable reference so individual tests can swap in a different activeDashboard
// between the pick click and the deferred performUpdate call (stale-closure test).
let mockActiveDashboard: {
  widgets: { id: string; type: string; config: Record<string, unknown> }[];
} = {
  widgets: [],
};

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    updateDashboard: mockUpdateDashboard,
    rosters: [],
    activeRosterId: null,
    activeDashboard: mockActiveDashboard,
    addToast: vi.fn(),
    addWidget: vi.fn(),
  }),
}));

// Mock audioUtils to avoid errors during tests
vi.mock('@/components/widgets/random/audioUtils', () => ({
  getAudioCtx: vi.fn(),
  playTick: vi.fn(),
  playWinner: vi.fn(),
}));

// Mock RandomFlash to capture the fontSize prop via a data attribute.
// jsdom does not support CSS min() so we cannot reliably check computed styles;
// capturing the prop string directly is the most reliable alternative.
vi.mock('@/components/widgets/random/RandomFlash', () => ({
  RANDOM_FLASH_PLACEHOLDER: 'Ready?',
  RandomFlash: ({
    fontSize,
    displayResult,
  }: {
    fontSize?: string;
    displayResult?: string | string[] | string[][] | null;
  }) => (
    <div data-testid="random-flash" data-font-size={fontSize ?? ''}>
      {(displayResult as string) ?? 'Ready?'}
    </div>
  ),
}));

// Helper to render widget
const renderWidget = (widget: WidgetData) => {
  return render(<RandomWidget widget={widget} />);
};

describe('RandomWidget', () => {
  const mockWidget: WidgetData = {
    id: 'random-1',
    type: 'random',
    x: 0,
    y: 0,
    w: 400,
    h: 400,
    z: 1,
    flipped: false,
    config: {
      mode: 'single',
      firstNames: 'Alice\nBob\nCharlie',
      lastNames: '',
      remainingStudents: ['Alice', 'Bob'],
      lastResult: 'Charlie',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveDashboard = { widgets: [] };
  });

  afterEach(() => {
    // Restore real timers if a test installed fake ones
    vi.useRealTimers();
  });

  it('renders the remaining count when in single mode', () => {
    renderWidget(mockWidget);
    expect(screen.getByText('2 Left')).toBeInTheDocument();
  });

  it('renders the reset button when in single mode and there are remaining students or a last result', () => {
    renderWidget(mockWidget);
    const resetButton = screen.getByTitle('Reset student pool');
    expect(resetButton).toBeInTheDocument();
    expect(resetButton).not.toBeDisabled();
  });

  it('calls updateWidget and resets local state when reset button is clicked', () => {
    renderWidget(mockWidget);
    // Verify initial result is visible
    expect(screen.getByText('Charlie')).toBeInTheDocument();

    const resetButton = screen.getByTitle('Reset student pool');
    fireEvent.click(resetButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('random-1', {
      config: expect.objectContaining({
        remainingStudents: [],
        lastResult: null,
      }),
    });

    // Verify result is cleared in UI
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('does not render remaining count when in groups mode', () => {
    const groupWidget = {
      ...mockWidget,
      config: { ...mockWidget.config, mode: 'groups' },
    } as unknown as WidgetData;
    renderWidget(groupWidget);
    expect(screen.queryByText(/Left/)).not.toBeInTheDocument();
  });

  it('disables reset button when no students are remaining and no last result', () => {
    const emptyWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        remainingStudents: [],
        lastResult: null,
      },
    } as unknown as WidgetData;
    renderWidget(emptyWidget);
    const resetButton = screen.getByTitle('Reset student pool');
    expect(resetButton).toBeDisabled();
  });

  describe('text scaling', () => {
    // Shorter words get a larger cqw value; longer words get a smaller one.
    // When lastResult is set (settled winner), formula sizes based on the
    // displayed string's longest word: round(75 / wordLength) cqw, capped at
    // [4, 80], with a 60cqh vertical cap.
    // 'Alice'       →  5 chars → round(75/5)  = 15 → 'min(15cqw, 60cqh)'
    // 'Christopher' → 11 chars → round(75/11) =  7 → 'min(7cqw, 60cqh)'

    it('assigns a smaller font size for longer words than for shorter ones', () => {
      const shortWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Alice',
          lastNames: '',
          mode: 'single',
          remainingStudents: [],
          lastResult: 'Alice',
        },
      } as unknown as WidgetData;

      const longWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Christopher',
          lastNames: '',
          mode: 'single',
          remainingStudents: [],
          lastResult: 'Christopher',
        },
      } as unknown as WidgetData;

      const { unmount } = renderWidget(shortWidget);
      const shortFontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');
      unmount();

      renderWidget(longWidget);
      const longFontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');

      expect(shortFontSize).toBe('min(15cqw, 60cqh)');
      expect(longFontSize).toBe('min(7cqw, 60cqh)');
    });

    it('sizes font by the longest WORD, not the full name length', () => {
      // "Christopher Robertson" has a full-name length of 22 but its longest
      // individual word is "Christopher" (11 chars).  A roster containing only
      // "Christopher" produces the same maxWordLength and therefore the same
      // font size — confirming we measure words, not full names.
      const multiWordWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Christopher',
          lastNames: 'Robertson',
          mode: 'single',
          remainingStudents: [],
          lastResult: 'Christopher Robertson',
        },
      } as unknown as WidgetData;

      const singleWordWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Christopher',
          lastNames: '',
          mode: 'single',
          remainingStudents: [],
          lastResult: 'Christopher',
        },
      } as unknown as WidgetData;

      const { unmount } = renderWidget(multiWordWidget);
      const multiFontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');
      unmount();

      renderWidget(singleWordWidget);
      const singleFontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');

      // Both rosters have a max word length of 11 → same font size
      expect(multiFontSize).toBe('min(7cqw, 60cqh)');
      expect(singleFontSize).toBe('min(7cqw, 60cqh)');
    });

    it('produces a valid font size for words longer than 18 characters', () => {
      // 34-char word → round(75/34) = 2 → clamped to the [4, 80] floor →
      // 'min(4cqw, 60cqh)'
      const longWordWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Supercalifragilisticexpialidocious',
          lastNames: '',
          mode: 'single',
          remainingStudents: [],
          lastResult: 'Supercalifragilisticexpialidocious',
        },
      } as unknown as WidgetData;

      renderWidget(longWordWidget);
      const fontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');

      expect(fontSize).toBe('min(4cqw, 60cqh)');
    });

    it('uses the 6-char placeholder length when lastResult is empty, regardless of roster word length', () => {
      // A roster with a 1-letter name has maxWordLength=1, but with no
      // lastResult the formula must size the placeholder ("Ready?", 6 chars)
      // based on PLACEHOLDER_LENGTH — NOT the roster max — otherwise a
      // 1-letter roster would oversize the placeholder and overflow.
      // round(75/6) = 13 → 'min(13cqw, 60cqh)'.
      const placeholderWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Q', // maxWordLength = 1
          lastNames: '',
          mode: 'single',
          remainingStudents: [],
          lastResult: null,
        },
      } as unknown as WidgetData;

      renderWidget(placeholderWidget);
      const fontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');

      expect(fontSize).toBe('min(13cqw, 60cqh)');
    });

    it('splits multi-word display strings on ASCII whitespace only — NBSP-joined names stay one word so the font sizes for the unbreakable rendered width', () => {
      // CSS `white-space: normal` does not wrap at U+00A0 NBSP, so the
      // formula must NOT split there either — otherwise the font is sized
      // for 5 chars ("Smith") but rendered as one unbreakable 10-char unit
      // and overflows. NBSP-joined name = treat as a single 10-char word.
      // round(75/10) = 8 → 'min(8cqw, 60cqh)'.
      const nbspWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Mary Smith',
          lastNames: '',
          mode: 'single',
          remainingStudents: [],
          lastResult: 'Mary Smith',
        },
      } as unknown as WidgetData;

      renderWidget(nbspWidget);
      const fontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');

      expect(fontSize).toBe('min(8cqw, 60cqh)');
    });

    it('sizes regular-space multi-word names to the longest single word (wraps at the space)', () => {
      // Sanity counterpart to the NBSP test: 'Mary Smith' with an ASCII
      // space splits into ['Mary','Smith'], sizes for the longest word
      // (5 chars). round(75/5) = 15 -> 'min(15cqw, 60cqh)'. Names wrap
      // at the ASCII space so each line fits horizontally.
      const multiWordWidget = {
        ...mockWidget,
        config: {
          firstNames: 'Mary',
          lastNames: 'Smith',
          mode: 'single',
          remainingStudents: [],
          lastResult: 'Mary Smith',
        },
      } as unknown as WidgetData;

      renderWidget(multiWordWidget);
      const fontSize = screen
        .getByTestId('random-flash')
        .getAttribute('data-font-size');

      expect(fontSize).toBe('min(15cqw, 60cqh)');
    });
  });

  describe('autoStartTimer stale-closure fix', () => {
    // Regression test for the stale-closure bug in handlePick's performUpdate.
    //
    // PROBLEM: performUpdate is defined inside handlePick and closes over
    // `activeDashboard` at the moment the teacher clicks Pick. For the flash
    // animation the callback fires ~1.7 s later (21 × 80 ms). If the dashboard
    // mutates in the interim — e.g. a time-tool widget is added, removed, or
    // replaced — the stale snapshot is used to locate the time-tool widget,
    // so autoStartTimer silently targets the wrong (or non-existent) widget.
    //
    // FIX: an `activeDashboardRef` is kept in sync with the latest value on
    // every render (same pattern as `soundEnabledRef` / `studentsRef`).
    // performUpdate reads `activeDashboardRef.current` instead of the
    // closure-captured `activeDashboard`.
    //
    // TEST SCENARIO:
    //  1. Dashboard starts with time-tool widget id "timer-old".
    //  2. Teacher clicks Pick (animation starts, flash runs for 21 ticks).
    //  3. BEFORE the animation ends, the dashboard is replaced with a new
    //     object containing time-tool widget id "timer-new" (simulating a
    //     real-time Firestore update / another widget being removed + re-added).
    //  4. Animation finishes → performUpdate fires.
    //  STALE (broken): updateWidget called with "timer-old"   ← test FAILS
    //  FIXED (correct): updateWidget called with "timer-new"  ← test PASSES
    it('reads the live activeDashboard when autoStartTimer fires after a flash animation', () => {
      vi.useFakeTimers();

      // Step 1 – dashboard has timer-old at click time.
      const oldTimerWidget = {
        id: 'timer-old',
        type: 'time-tool',
        config: { isRunning: false },
      };
      mockActiveDashboard = { widgets: [oldTimerWidget] };

      const autoTimerWidget: WidgetData = {
        id: 'random-1',
        type: 'random',
        x: 0,
        y: 0,
        w: 400,
        h: 400,
        z: 1,
        flipped: false,
        config: {
          mode: 'single',
          firstNames: 'Alice\nBob',
          lastNames: '',
          remainingStudents: [],
          lastResult: null,
          autoStartTimer: true,
          visualStyle: 'flash',
          soundEnabled: false,
        },
      };

      const { rerender } = render(<RandomWidget widget={autoTimerWidget} />);

      // Step 2 – click Pick to start the flash animation.
      const pickButton = screen.getByTitle('Randomize');
      fireEvent.click(pickButton);

      // Step 3 – dashboard mutates before the animation ends:
      // Firestore delivers an update that replaces timer-old with timer-new.
      const newTimerWidget = {
        id: 'timer-new',
        type: 'time-tool',
        config: { isRunning: false },
      };
      mockActiveDashboard = { widgets: [newTimerWidget] };
      // Re-render so the component receives the updated activeDashboard and
      // can update its ref before performUpdate fires.
      act(() => {
        rerender(<RandomWidget widget={autoTimerWidget} />);
      });

      // Step 4 – advance fake timers past the 21-tick flash animation
      // (21 ticks × 80 ms = 1 680 ms; use 2 000 ms to be safe).
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // The autoStartTimer branch should have called updateWidget with the
      // CURRENT time-tool widget id ("timer-new"), not the stale one.
      const timerCalls = mockUpdateWidget.mock.calls.filter(
        (args: unknown[]) => args[0] === 'timer-new' || args[0] === 'timer-old'
      );
      expect(timerCalls.length).toBeGreaterThan(0);
      // Every timer call must target the live widget ("timer-new").
      for (const args of timerCalls) {
        expect(args[0]).toBe('timer-new');
      }
    });
  });
});
