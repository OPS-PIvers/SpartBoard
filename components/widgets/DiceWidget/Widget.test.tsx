import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { useDashboard } from '@/context/useDashboard';
import { DashboardContextValue } from '@/context/DashboardContextValue';
import { WidgetData, DiceConfig } from '@/types';
import { DiceWidget } from './Widget';

// Mock dependencies
vi.mock('@/context/useDashboard');
vi.mock('lucide-react', () => ({
  Dices: () => <div data-testid="dices-icon" />,
  Hash: () => <div data-testid="hash-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
}));

// Helper to render widget
const renderWidget = (widget: WidgetData) => {
  return render(<DiceWidget widget={widget} />);
};

// Mock AudioContext
const mockAudioContext = {
  createOscillator: () => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: 'sine',
    frequency: { setValueAtTime: vi.fn() },
  }),
  createGain: () => ({
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  }),
  currentTime: 0,
  state: 'running',
  resume: vi.fn().mockResolvedValue(undefined),
  destination: {},
};

// @ts-expect-error - Partial mock for AudioContext
window.AudioContext = class {
  constructor() {
    return mockAudioContext;
  }
};

const mockUpdateWidget = vi.fn();

const mockWidget: WidgetData = {
  id: 'dice-1',
  type: 'dice',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  flipped: false,
  config: {
    count: 1,
  } as DiceConfig,
};

const defaultContext: Partial<DashboardContextValue> = {
  updateWidget: mockUpdateWidget,
  zoom: 1,
  activeDashboard: {
    id: 'dashboard-1',
    name: 'Test Dashboard',
    background: 'bg-slate-100',
    widgets: [mockWidget],
    globalStyle: {
      fontFamily: 'sans',
      windowTransparency: 0,
      windowBorderRadius: 'md',
      dockTransparency: 0,
      dockBorderRadius: 'md',
      dockTextColor: '#000000',
      dockTextShadow: false,
    },
    createdAt: Date.now(),
  },
};

describe('DiceWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (useDashboard as unknown as Mock).mockReturnValue(defaultContext);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not apply blur class while rolling', () => {
    const { container } = renderWidget(mockWidget);
    const rollButton = screen.getByText('Roll Dice');

    fireEvent.click(rollButton);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Check for the blur class on the DiceFace element
    const diceFace = container.querySelector('.grid-cols-3')?.parentElement;
    expect(diceFace).not.toHaveClass('blur-[1px]');
  });
});
