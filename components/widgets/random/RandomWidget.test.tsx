import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RandomWidget } from './RandomWidget';
import { useDashboard } from '@/context/useDashboard';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WidgetData, RandomConfig } from '@/types';
import * as audioUtils from './audioUtils';

vi.mock('@/context/useDashboard');

// Mock subcomponents
vi.mock('./RandomWheel', () => ({
  RandomWheel: () => <div data-testid="random-wheel" />,
}));
vi.mock('./RandomSlots', () => ({
  RandomSlots: () => <div data-testid="random-slots" />,
}));
vi.mock('./RandomFlash', () => ({
  RANDOM_FLASH_PLACEHOLDER: 'Ready?',
  RandomFlash: () => <div data-testid="random-flash" />,
}));
vi.mock('./audioUtils', () => ({
  getAudioCtx: vi.fn(),
  playTick: vi.fn(),
  playWinner: vi.fn(),
}));

// Mock WidgetLayout to render header, content, and footer
vi.mock('../WidgetLayout', () => ({
  WidgetLayout: ({
    header,
    content,
    footer,
  }: {
    header?: React.ReactNode;
    content: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <div data-testid="widget-layout">
      {header && <div data-testid="header">{header}</div>}
      <div data-testid="content">{content}</div>
      <div data-testid="footer">{footer}</div>
    </div>
  ),
}));

const mockUpdateWidget = vi.fn();
const mockAddWidget = vi.fn();
const mockAddToast = vi.fn();
const mockUpdateDashboard = vi.fn();

const mockDashboardContext = {
  updateWidget: mockUpdateWidget,
  addWidget: mockAddWidget,
  updateDashboard: mockUpdateDashboard,
  addToast: mockAddToast,
  activeDashboard: {
    widgets: [],
    sharedGroups: [],
  },
  rosters: [],
  activeRosterId: null,
};

describe('RandomWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
  });

  it('renders correctly in empty state', () => {
    const widget: WidgetData = {
      id: 'test-id',
      type: 'random',
      config: {
        firstNames: '',
        lastNames: '',
        mode: 'single',
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    render(<RandomWidget widget={widget} />);
    expect(screen.getByText('No Names Provided')).toBeInTheDocument();
  });

  it('renders groups when in groups mode with result', () => {
    const widget: WidgetData = {
      id: 'test-id',
      type: 'random',
      config: {
        firstNames: 'Alice\nBob',
        mode: 'groups',
        lastResult: [
          { id: 'g1', names: ['Alice', 'Bob'] },
          { id: 'g2', names: ['Charlie', 'Dave'] },
        ],
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    render(<RandomWidget widget={widget} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    // Default group names
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Group 2')).toBeInTheDocument();
  });

  describe('Jigsaw mode', () => {
    const jigsawWidget = (
      override: Partial<RandomConfig> = {}
    ): WidgetData => ({
      id: 'test-id',
      type: 'random',
      config: {
        firstNames: 'A\nB\nC\nD\nE\nF',
        mode: 'jigsaw',
        rosterMode: 'custom',
        groupSize: 2,
        jigsawHomeGroups: [
          { id: 'h1', names: ['A', 'B'] },
          { id: 'h2', names: ['C', 'D'] },
          { id: 'h3', names: ['E', 'F'] },
        ],
        jigsawExpertGroups: [
          { id: 'e1', names: ['A', 'C', 'E'] },
          { id: 'e2', names: ['B', 'D', 'F'] },
        ],
        jigsawView: 'home',
        ...override,
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    });

    it('renders home groups when jigsawView is "home"', () => {
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'home' })} />);
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('Home Group 1')).toBeInTheDocument();
      // Footer launch buttons present (active one is disabled)
      expect(
        screen.getByRole('button', { name: /Launch Jigsaw/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Launch Home Group/i })
      ).toBeInTheDocument();
    });

    it('renders all expert groups when jigsawView is "expert"', () => {
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'expert' })} />);
      // Expert group 1 has [A, C, E] (position 0 from each home group);
      // expert group 2 has [B, D, F] (position 1). Asserting on both rules
      // out a regression where only the first expert group renders.
      expect(screen.getByText('Expert Group 1')).toBeInTheDocument();
      expect(screen.getByText('Expert Group 2')).toBeInTheDocument();
      for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    });

    it('disables the active jigsaw view button (clear current state)', () => {
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'home' })} />);
      // jigsawView === 'home' → Launch Home Group is the current view, so it
      // should be disabled to make the active state visually unambiguous.
      expect(
        screen.getByRole('button', { name: /Launch Home Group/i })
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: /Launch Jigsaw/i })
      ).not.toBeDisabled();
    });

    it('toggles jigsawView when Launch Jigsaw is clicked', () => {
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'home' })} />);
      fireEvent.click(screen.getByRole('button', { name: /Launch Jigsaw/i }));

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          config: expect.objectContaining({
            jigsawView: 'expert',
          }) as unknown,
        })
      );
    });

    it('toggles jigsawView when Launch Home Group is clicked', () => {
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'expert' })} />);
      fireEvent.click(
        screen.getByRole('button', { name: /Launch Home Group/i })
      );

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          config: expect.objectContaining({
            jigsawView: 'home',
          }) as unknown,
        })
      );
    });

    it('HOME stepper increments numHomeGroups (not groupSize or numExpertGroups)', () => {
      // HOME stepper drives a target count of home groups, parallel to the
      // EXPERT stepper's count. It must NOT write `groupSize` (members per
      // group) — that asymmetry was the original UX bug.
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'home' })} />);
      const homeStepper = screen.getByRole('group', {
        name: /Number of Home Groups/i,
      });
      const plus = homeStepper.querySelector(
        'button[aria-label*="Increase"]'
      ) as HTMLButtonElement;
      fireEvent.click(plus);
      const calls = mockUpdateWidget.mock.calls;
      const lastConfig = (
        calls[calls.length - 1][1] as { config: Record<string, unknown> }
      ).config;
      expect(lastConfig).toHaveProperty('numHomeGroups');
      expect(lastConfig).not.toHaveProperty('groupSize');
      expect(lastConfig).not.toHaveProperty('numExpertGroups');
    });

    it('EXPERT stepper increments numExpertGroups (not numHomeGroups or groupSize)', () => {
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'home' })} />);
      const expertStepper = screen.getByRole('group', {
        name: /Number of Expert Groups/i,
      });
      const plus = expertStepper.querySelector(
        'button[aria-label*="Increase"]'
      ) as HTMLButtonElement;
      fireEvent.click(plus);
      const calls = mockUpdateWidget.mock.calls;
      const lastConfig = (
        calls[calls.length - 1][1] as { config: Record<string, unknown> }
      ).config;
      expect(lastConfig).toHaveProperty('numExpertGroups');
      expect(lastConfig).not.toHaveProperty('numHomeGroups');
      expect(lastConfig).not.toHaveProperty('groupSize');
    });

    it('does not show Launch buttons before any pick has happened', () => {
      render(
        <RandomWidget
          widget={jigsawWidget({
            jigsawHomeGroups: null,
            jigsawExpertGroups: null,
          })}
        />
      );
      expect(
        screen.queryByRole('button', { name: /Launch Jigsaw/i })
      ).not.toBeInTheDocument();
    });

    it('renders the post-pick footer as a single row with all 5 controls visible', () => {
      // The footer was consolidated from a two-row stack into a single
      // horizontal row to reclaim vertical space — Launch Jigsaw and Launch
      // Home Group lost their long "Launch …" labels and now sit between
      // their respective steppers. Every control must remain reachable on
      // one line.
      render(<RandomWidget widget={jigsawWidget({ jigsawView: 'home' })} />);

      // Both Launch buttons (accessible names preserved via aria-label).
      expect(
        screen.getByRole('button', { name: /Launch Jigsaw/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Launch Home Group/i })
      ).toBeInTheDocument();

      // Both steppers.
      expect(
        screen.getByRole('group', { name: /Number of Expert Groups/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('group', { name: /Number of Home Groups/i })
      ).toBeInTheDocument();

      // Randomize button still reachable.
      expect(
        screen.getByRole('button', { name: /Randomize|Picking/i })
      ).toBeInTheDocument();

      // Footer is a single flex row containing all five controls plus the
      // associated stepper labels — no nested stack of two rows.
      const footer = screen.getByTestId('footer');
      const row = footer.firstElementChild as HTMLElement | null;
      expect(row).not.toBeNull();
      expect(row?.className).not.toMatch(/\bflex-col\b/);

      const expertStepper = screen.getByRole('group', {
        name: /Number of Expert Groups/i,
      });
      const homeStepper = screen.getByRole('group', {
        name: /Number of Home Groups/i,
      });
      const launchJigsaw = screen.getByRole('button', {
        name: /Launch Jigsaw/i,
      });
      const launchHome = screen.getByRole('button', {
        name: /Launch Home Group/i,
      });
      const randomize = screen.getByRole('button', {
        name: /^Randomize$|^Picking$/,
      });
      expect(row?.contains(expertStepper)).toBe(true);
      expect(row?.contains(launchJigsaw)).toBe(true);
      expect(row?.contains(homeStepper)).toBe(true);
      expect(row?.contains(launchHome)).toBe(true);
      expect(row?.contains(randomize)).toBe(true);
    });
  });

  describe('Mode-cycle chip', () => {
    const widgetWithMode = (mode: string): WidgetData => ({
      id: 'test-id',
      type: 'random',
      config: {
        firstNames: 'Alice\nBob',
        mode,
        rosterMode: 'custom',
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    });

    it('cycles single → shuffle when tapped', () => {
      render(<RandomWidget widget={widgetWithMode('single')} />);
      fireEvent.click(
        screen.getByRole('button', { name: /Operation mode: Pick One/i })
      );
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          config: expect.objectContaining({ mode: 'shuffle' }) as unknown,
        })
      );
    });

    it('wraps from jigsaw back to single', () => {
      render(<RandomWidget widget={widgetWithMode('jigsaw')} />);
      fireEvent.click(
        screen.getByRole('button', { name: /Operation mode: Jigsaw/i })
      );
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          config: expect.objectContaining({ mode: 'single' }) as unknown,
        })
      );
    });

    it('renders the remaining-students counter alongside the mode chip in single mode', () => {
      // Counter used to live in a separate badge after the reset button.
      // It now sits inside the mode chip's visual shell but as a SIBLING
      // of the cycle <button>, so tapping the counter text does not cycle
      // the mode. The aria-label on the button still includes the count
      // for screen readers.
      const widget = widgetWithMode('single');
      (widget.config as RandomConfig).remainingStudents = ['Alice', 'Bob'];
      render(<RandomWidget widget={widget} />);
      const modeButton = screen.getByRole('button', {
        name: /Operation mode: Pick One\. 2 students left/i,
      });
      expect(modeButton.textContent).toMatch(/PICK ONE/i);
      // Counter is a sibling element within the chip shell — assert it
      // exists in the header and not inside the cycle button.
      expect(screen.getByText(/2 Left/i)).toBeInTheDocument();
      expect(modeButton.textContent).not.toMatch(/Left/i);
    });

    it('hides the inline counter in non-single modes', () => {
      render(<RandomWidget widget={widgetWithMode('shuffle')} />);
      const modeButton = screen.getByRole('button', {
        name: /Operation mode: Shuffle/i,
      });
      expect(modeButton.textContent).not.toMatch(/Left/i);
      expect(screen.queryByText(/Left/i)).not.toBeInTheDocument();
    });
  });

  it('sends groups to scoreboard when button is clicked (New Connection)', () => {
    const widget: WidgetData = {
      id: 'test-id',
      type: 'random',
      config: {
        firstNames: 'Alice\nBob',
        mode: 'groups',
        lastResult: [
          { id: 'g1', names: ['Alice', 'Bob'] },
          { id: 'g2', names: ['Charlie', 'Dave'] },
        ],
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    render(<RandomWidget widget={widget} />);

    // Find the "Send to Scoreboard" button that should send the current groups to a new scoreboard
    const sendButton = screen.getByRole('button', {
      name: /Send to Scoreboard/i,
    });

    fireEvent.click(sendButton);

    // Check if addWidget was called (creating new scoreboard)
    expect(mockAddWidget).toHaveBeenCalledWith(
      'scoreboard',
      expect.objectContaining({
        config: expect.objectContaining({
          teams: expect.arrayContaining([
            expect.objectContaining({ name: 'Group 1', linkedGroupId: 'g1' }),
            expect.objectContaining({ name: 'Group 2', linkedGroupId: 'g2' }),
          ]) as unknown,
        }) as unknown,
      })
    );

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/scoreboard/i),
      'success'
    );
  });

  describe('Randomize with locks (no sit-out tray)', () => {
    const groupsWidget = (
      override: Partial<RandomConfig> = {}
    ): WidgetData => ({
      id: 'test-id',
      type: 'random',
      config: {
        firstNames: 'Alice\nBob\nCharlie\nDave',
        mode: 'groups',
        rosterMode: 'custom',
        groupSize: 2,
        lastResult: [
          { id: 'g1', names: ['Alice', 'Bob'] },
          { id: 'g2', names: ['Charlie', 'Dave'] },
        ],
        ...override,
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    });

    it('keeps locked students in their group after Randomize', () => {
      vi.useFakeTimers();
      try {
        render(
          <RandomWidget
            widget={groupsWidget({
              lockedNames: ['Alice'],
            })}
          />
        );
        act(() => {
          fireEvent.click(
            screen.getByRole('button', { name: /^Randomize$|^Picking$/ })
          );
        });
        act(() => {
          vi.advanceTimersByTime(600);
        });

        const calls = mockUpdateWidget.mock.calls;
        const last = calls[calls.length - 1][1] as {
          config: Record<string, unknown>;
        };
        const result = last.config.lastResult as {
          id: string;
          names: string[];
        }[];
        const g1 = result.find((g) => g.id === 'g1');
        expect(g1?.names).toContain('Alice');
        // Randomize always clears the legacy unassigned bucket.
        expect(last.config.unassignedNames).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears any legacy unassignedNames on randomize', () => {
      vi.useFakeTimers();
      try {
        render(
          <RandomWidget
            widget={groupsWidget({
              unassignedNames: ['Eve'],
              lockedNames: [],
            })}
          />
        );
        act(() => {
          fireEvent.click(
            screen.getByRole('button', { name: /^Randomize$|^Picking$/ })
          );
        });
        act(() => {
          vi.advanceTimersByTime(600);
        });

        const calls = mockUpdateWidget.mock.calls;
        const last = calls[calls.length - 1][1] as {
          config: Record<string, unknown>;
        };
        expect(last.config.unassignedNames).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── Regression: stale-closure in flash/slots setInterval (PR #1749 parity)
  //
  // Before the fix, the setInterval callback in the 'flash' and 'slots' visual
  // styles captured `soundEnabled` by value at creation time. If the widget
  // re-rendered with soundEnabled=false mid-spin, the interval still called
  // playTick on every subsequent tick (stale closure).
  //
  // After the fix, the callback reads from soundEnabledRef.current, which is
  // updated synchronously on every render, so toggling soundEnabled off mid-
  // spin silences all remaining ticks immediately.
  describe('stale-closure regression — flash interval reads latest soundEnabled via ref', () => {
    const makeWidget = (soundEnabled: boolean): WidgetData => ({
      id: 'sc-test-id',
      type: 'random',
      config: {
        firstNames: 'Alice\nBob\nCharlie',
        lastNames: '',
        mode: 'single',
        visualStyle: 'flash',
        soundEnabled,
        rosterMode: 'custom',
        remainingStudents: [],
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      z: 1,
      flipped: false,
    });

    afterEach(() => {
      vi.useRealTimers();
      // Restore the vi.spyOn(audioUtils, 'playTick') created inside the test so
      // the spy wrapper doesn't persist on the module namespace and stack with
      // spies in other tests (which would inflate recorded call counts).
      vi.restoreAllMocks();
    });

    it('stops calling playTick after soundEnabled is toggled off mid-spin', () => {
      vi.useFakeTimers();
      const playTickSpy = vi.spyOn(audioUtils, 'playTick');

      const { rerender } = render(<RandomWidget widget={makeWidget(true)} />);

      // Start a spin (flash mode, soundEnabled=true)
      act(() => {
        fireEvent.click(
          screen.getByRole('button', { name: /^Randomize$|^Picking$/ })
        );
      });

      // Advance 3 ticks (3 × 80 ms = 240 ms). Each tick should play a sound
      // because soundEnabled is still true.
      act(() => {
        vi.advanceTimersByTime(240);
      });
      const ticksWithSoundOn = playTickSpy.mock.calls.length;
      expect(ticksWithSoundOn).toBeGreaterThan(0);

      // Now toggle soundEnabled off by re-rendering with the updated widget.
      // The stale-closure bug would have ignored this change and continued
      // calling playTick for all remaining ticks.
      playTickSpy.mockClear();
      rerender(<RandomWidget widget={makeWidget(false)} />);

      // Advance enough time for the remaining ticks (the flash interval fires
      // for >20 ticks × 80ms = 1680ms total; we are at 240ms, so ~1500ms remain).
      act(() => {
        vi.advanceTimersByTime(1600);
      });

      // With the ref fix: soundEnabledRef.current is false, so playTick must
      // NOT have been called after the re-render.
      // Without the fix: playTick would have been called for every remaining
      // tick because the closure captured soundEnabled=true at creation time.
      expect(playTickSpy.mock.calls.length).toBe(0);
    });
  });
});
