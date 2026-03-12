import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { WidgetData, GlobalStyle } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useWindowSize } from '@/hooks/useWindowSize';

// Mock dependencies
vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useWindowSize');

// Mock child components
vi.mock('@/components/widgets/stickers/StickerItemWidget', () => ({
  StickerItemWidget: () => <div data-testid="sticker-widget">Sticker</div>,
}));

const mockDraggableWindow = vi.fn();
vi.mock('@/components/common/DraggableWindow', () => ({
  DraggableWindow: (props: {
    children: React.ReactNode;
    isSpotlighted?: boolean;
  }) => {
    mockDraggableWindow(props);
    return <div data-testid="draggable-window">{props.children}</div>;
  },
}));

// Capture ScalableWidget props to verify optimization
// IMPORTANT: We mock the component but NOT memoize it here, so we can detect if it re-renders
const mockScalableWidget = vi.fn();

interface ScalableWidgetProps {
  children:
    | React.ReactNode
    | ((props: {
        internalW: number;
        internalH: number;
        scale: number;
      }) => React.ReactNode);
  [key: string]: unknown;
}

vi.mock('@/components/common/ScalableWidget', () => ({
  ScalableWidget: (props: ScalableWidgetProps) => {
    mockScalableWidget(props);
    // Execute children render prop to ensure it works
    if (typeof props.children === 'function') {
      return (
        <div>
          {props.children({ internalW: 100, internalH: 100, scale: 1 })}
        </div>
      );
    }
    return <div>{props.children}</div>;
  },
}));

// We use 'text' as a valid WidgetType to pass type checking
vi.mock('@/components/widgets/WidgetRegistry', () => ({
  WIDGET_SETTINGS_COMPONENTS: {},
  WIDGET_SCALING_CONFIG: {
    text: { baseWidth: 200, baseHeight: 200, canSpread: true },
  },
  DEFAULT_SCALING_CONFIG: { baseWidth: 200, baseHeight: 200 },
}));

vi.mock('@/components/widgets/WidgetLayoutWrapper', () => ({
  WidgetLayoutWrapper: () => (
    <div data-testid="widget-content">Widget Content</div>
  ),
}));

describe('WidgetRenderer', () => {
  const mockWidget: WidgetData = {
    id: 'w1',
    type: 'text',
    x: 0,
    y: 0,
    w: 400,
    h: 400,
    z: 1,
    flipped: false,
    minimized: false,
    maximized: false,
    transparency: 1,
    config: {},
  };

  const mockProps = {
    widget: mockWidget,
    isLive: false,
    students: [],
    updateSessionConfig: vi.fn(),
    updateSessionBackground: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn(),
    removeStudent: vi.fn(),
    toggleFreezeStudent: vi.fn(),
    toggleGlobalFreeze: vi.fn(),
    updateWidget: vi.fn(),
    removeWidget: vi.fn(),
    duplicateWidget: vi.fn(),
    bringToFront: vi.fn(),
    addToast: vi.fn(),
    globalStyle: {
      windowTransparency: 1,
      fontFamily: 'sans',
      windowBorderRadius: 'md',
    } as unknown as GlobalStyle,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as Mock).mockReturnValue({
      user: { uid: 'u1' },
      canAccessFeature: vi.fn(),
      featurePermissions: [],
    });
    (useDashboard as unknown as Mock).mockReturnValue({});
    (useWindowSize as unknown as Mock).mockReturnValue({
      width: 1024,
      height: 768,
    });
  });

  it('renders content correctly', () => {
    render(<WidgetRenderer {...mockProps} />);
    expect(screen.getByTestId('draggable-window')).toBeInTheDocument();
    expect(screen.getByTestId('widget-content')).toBeInTheDocument();
  });

  it('passes stable children callback to ScalableWidget across re-renders', () => {
    const { rerender } = render(<WidgetRenderer {...mockProps} />);

    expect(mockScalableWidget).toHaveBeenCalledTimes(1);
    const firstRenderProps = mockScalableWidget.mock
      .calls[0][0] as ScalableWidgetProps;

    // Rerender with CHANGED prop that forces WidgetRenderer to update
    // but should NOT change the ScalableWidget children callback
    rerender(<WidgetRenderer {...mockProps} isLive={true} />);

    expect(mockScalableWidget).toHaveBeenCalledTimes(2);
    const secondRenderProps = mockScalableWidget.mock
      .calls[1][0] as ScalableWidgetProps;

    // The children prop (render callback) should be referentially equal
    expect(firstRenderProps.children).toBe(secondRenderProps.children);
  });

  it('passes isSpotlighted correctly to DraggableWindow', () => {
    const spotlightProps = {
      ...mockProps,
      dashboardSettings: { spotlightWidgetId: 'w1' },
    };
    render(<WidgetRenderer {...spotlightProps} />);

    expect(mockDraggableWindow).toHaveBeenCalled();
    const props = mockDraggableWindow.mock.calls[0][0] as {
      isSpotlighted: boolean;
    };
    expect(props.isSpotlighted).toBe(true);
  });
});
