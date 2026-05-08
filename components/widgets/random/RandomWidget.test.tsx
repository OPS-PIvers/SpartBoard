import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RandomWidget } from './RandomWidget';
import { useDashboard } from '@/context/useDashboard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WidgetData, RandomConfig } from '@/types';

vi.mock('@/context/useDashboard');

// Mock subcomponents
vi.mock('./RandomWheel', () => ({
  RandomWheel: () => <div data-testid="random-wheel" />,
}));
vi.mock('./RandomSlots', () => ({
  RandomSlots: () => <div data-testid="random-slots" />,
}));
vi.mock('./RandomFlash', () => ({
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
});
