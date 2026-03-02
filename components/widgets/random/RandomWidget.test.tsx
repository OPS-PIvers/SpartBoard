import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RandomWidget } from './RandomWidget';
import { useDashboard } from '../../../context/useDashboard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WidgetData, RandomConfig } from '../../../types';

vi.mock('../../../context/useDashboard');

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

// Mock WidgetLayout to render content and footer
vi.mock('../WidgetLayout', () => ({
  WidgetLayout: ({
    content,
    footer,
  }: {
    content: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <div data-testid="widget-layout">
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
