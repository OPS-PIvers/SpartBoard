import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DrawingWidget } from './Widget';
import { WidgetData, DrawingConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';

// Mock hooks
vi.mock('../../../context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));
vi.mock('../../../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

interface MockContext {
  clearRect: Mock;
  beginPath: Mock;
  moveTo: Mock;
  lineTo: Mock;
  stroke: Mock;
  canvas: { width: number; height: number };
  lineCap: string;
  lineJoin: string;
  globalCompositeOperation: string;
  strokeStyle: string;
  lineWidth: number;
}

describe('DrawingWidget', () => {
  let mockUpdateWidget: Mock;
  let mockContext: MockContext;

  beforeEach(() => {
    mockUpdateWidget = vi.fn();
    (useDashboard as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      activeDashboard: { background: 'bg-slate-900', widgets: [] },
      addToast: vi.fn(),
      addWidget: vi.fn(),
    });
    (useAuth as Mock).mockReturnValue({
      user: { uid: 'user1' },
      canAccessFeature: vi.fn(() => true),
    });

    // Mock Canvas
    mockContext = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      canvas: { width: 800, height: 600 },
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation: 'source-over',
      strokeStyle: '#000000',
      lineWidth: 1,
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockContext as unknown as CanvasRenderingContext2D
    );
    // The widget sets canvas internal resolution from canvasSize =
    // { w: widget.w, h: widget.h - 40 } → 400x260 for the test widget below.
    // Mock the rect to match so pointer coords translate 1:1 (no CSS scaling).
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 260,
      right: 400,
      bottom: 260,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const widget: WidgetData = {
    id: 'drawing-1',
    type: 'drawing',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    flipped: false,
    config: {
      color: '#000000',
      width: 4,
      objects: [],
      customColors: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'],
    } as DrawingConfig,
  };

  it('renders without crashing', () => {
    render(<DrawingWidget widget={widget} />);
    expect(mockContext.clearRect).toHaveBeenCalled();
  });

  it('no longer renders the Assign (Cast) or Save-to-Cloud buttons', () => {
    const { container } = render(<DrawingWidget widget={widget} />);
    // Previously the overlay-mode toolbar included buttons titled "Assign..."
    // and "Save to Cloud". Those were removed in the annotation overhaul.
    expect(container.querySelector('[title*="Assign"]')).toBeNull();
    expect(container.querySelector('[title*="Save to Cloud"]')).toBeNull();
  });

  it('no longer renders the ANNOTATE / EXIT mode toggle', () => {
    const { container } = render(<DrawingWidget widget={widget} />);
    // Mode toggle moved to dock-level popover
    expect(container.textContent).not.toMatch(/ANNOTATE|EXIT/);
  });

  it('draws existing path objects on mount', () => {
    const widgetWithObjects: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        objects: [
          {
            id: 'obj-1',
            kind: 'path',
            z: 0,
            color: '#ff0000',
            width: 5,
            points: [
              { x: 10, y: 10 },
              { x: 20, y: 20 },
            ],
          },
        ],
      } as DrawingConfig,
    };
    render(<DrawingWidget widget={widgetWithObjects} />);
    expect(mockContext.moveTo).toHaveBeenCalledWith(10, 10);
    expect(mockContext.lineTo).toHaveBeenCalledWith(20, 20);
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it('migrates legacy paths[] config forward and renders strokes', () => {
    const legacyWidget: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        // Legacy shape — objects omitted, paths present. The widget's
        // defensive migration should wrap these as PathObjects at render.
        paths: [
          {
            color: '#0000ff',
            width: 3,
            points: [
              { x: 5, y: 5 },
              { x: 15, y: 15 },
            ],
          },
        ],
      } as unknown as DrawingConfig,
    };
    render(<DrawingWidget widget={legacyWidget} />);
    expect(mockContext.moveTo).toHaveBeenCalledWith(5, 5);
    expect(mockContext.lineTo).toHaveBeenCalledWith(15, 15);
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it('handles drawing interaction', () => {
    const { container } = render(<DrawingWidget widget={widget} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Start
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      })
    );

    // Move
    fireEvent(
      canvas,
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      })
    );

    // End
    fireEvent(
      canvas,
      new PointerEvent('pointerup', { bubbles: true, cancelable: true })
    );

    // Should update widget with new object
    expect(mockUpdateWidget).toHaveBeenCalled();
    const args = mockUpdateWidget.mock.calls[0];
    expect(args[0]).toBe(widget.id);
    const newConfig = (args[1] as Partial<WidgetData>).config as DrawingConfig;
    const objects = newConfig.objects ?? [];
    expect(objects).toHaveLength(1);
    const created = objects[0];
    expect(created.kind).toBe('path');
    expect(typeof created.id).toBe('string');
    if (created.kind === 'path') {
      expect(created.points).toEqual([
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]);
    }
  });
});
