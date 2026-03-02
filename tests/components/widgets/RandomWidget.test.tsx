/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WidgetData } from '../../../types';
import { RandomWidget } from '../../../components/widgets/random/RandomWidget';

const mockUpdateWidget = vi.fn();

vi.mock('../../../context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    updateDashboard: vi.fn(),
    rosters: [],
    activeRosterId: null,
    activeDashboard: {
      widgets: [],
    },
  }),
}));

// Mock audioUtils to avoid errors during tests
vi.mock('../../../components/widgets/random/audioUtils', () => ({
  getAudioCtx: vi.fn(),
  playTick: vi.fn(),
  playWinner: vi.fn(),
}));

// Mock RandomFlash to capture the fontSize prop via a data attribute.
// jsdom does not support CSS min() so we cannot reliably check computed styles;
// capturing the prop string directly is the most reliable alternative.
vi.mock('../../../components/widgets/random/RandomFlash', () => ({
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
    // Formula: round(130 / maxWordLength) cqw, capped at [4, 40].
    // 'Alice'       →  5 chars → round(130/5)  = 26 → 'min(26cqw, 20cqh)'
    // 'Christopher' → 11 chars → round(130/11) = 12 → 'min(12cqw, 20cqh)'

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

      expect(shortFontSize).toBe('min(26cqw, 20cqh)');
      expect(longFontSize).toBe('min(12cqw, 20cqh)');
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
      expect(multiFontSize).toBe('min(12cqw, 20cqh)');
      expect(singleFontSize).toBe('min(12cqw, 20cqh)');
    });

    it('produces a valid font size for words longer than 18 characters', () => {
      // 34-char word → round(130/34) = 4 (the minimum) → 'min(4cqw, 20cqh)'
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

      expect(fontSize).toBe('min(4cqw, 20cqh)');
    });
  });
});
