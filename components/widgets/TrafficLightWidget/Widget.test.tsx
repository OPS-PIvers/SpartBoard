import { render, screen, fireEvent } from '@testing-library/react';
import { useDashboard } from '@/context/useDashboard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WidgetData, TrafficConfig } from '@/types';
import { TrafficLightWidget } from './Widget';

vi.mock('@/context/useDashboard');

const mockUpdateWidget = vi.fn();

const mockDashboardContext = {
  updateWidget: mockUpdateWidget,
};

// Helper to render widget
const renderWidget = (widget: WidgetData) => {
  return render(<TrafficLightWidget widget={widget} />);
};

describe('TrafficLightWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
  });

  const createWidget = (active?: string): WidgetData => ({
    id: 'test-traffic-id',
    type: 'traffic',
    config: {
      active,
    } as TrafficConfig,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    flipped: false,
  });

  it('renders correctly with no active light', () => {
    const widget = createWidget();
    renderWidget(widget);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

    // Check that none of them have the "active" state/class
    buttons.forEach((button) => {
      expect(button.className).not.toContain('bg-red-500');
      expect(button.className).not.toContain('bg-yellow-400');
      expect(button.className).not.toContain('bg-green-500');
    });
  });

  it('renders correctly with red light active', () => {
    const widget = createWidget('red');
    renderWidget(widget);

    const buttons = screen.getAllByRole('button');
    const redButton = buttons[0]; // Order: Red, Yellow, Green

    expect(redButton.className).toContain('bg-red-500');
    expect(redButton.className).toContain('active');
  });

  it('toggles red light on when clicked', () => {
    const widget = createWidget();
    renderWidget(widget);

    const buttons = screen.getAllByRole('button');
    const redButton = buttons[0];

    fireEvent.click(redButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-traffic-id', {
      config: {
        active: 'red',
      },
    });
  });

  it('toggles red light off when clicked again', () => {
    const widget = createWidget('red');
    renderWidget(widget);

    const buttons = screen.getAllByRole('button');
    const redButton = buttons[0];

    fireEvent.click(redButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-traffic-id', {
      config: {
        active: 'none',
      },
    });
  });

  it('switches from red to yellow', () => {
    const widget = createWidget('red');
    renderWidget(widget);

    const buttons = screen.getAllByRole('button');
    const yellowButton = buttons[1];

    fireEvent.click(yellowButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-traffic-id', {
      config: {
        active: 'yellow',
      },
    });
  });

  it('switches from yellow to green', () => {
    const widget = createWidget('yellow');
    renderWidget(widget);

    const buttons = screen.getAllByRole('button');
    const greenButton = buttons[2];

    fireEvent.click(greenButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-traffic-id', {
      config: {
        active: 'green',
      },
    });
  });
});
