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
  save: Mock;
  restore: Mock;
  fill: Mock;
  closePath: Mock;
  strokeRect: Mock;
  fillRect: Mock;
  ellipse: Mock;
  fillText: Mock;
  // Selection chrome (Phase 2 PR 2.1c) uses setLineDash for the bbox dashes
  // and arc for the rotation handle. Without these stubs the canvas mock
  // throws as soon as a selection lands.
  setLineDash: Mock;
  arc: Mock;
  globalAlpha: number;
  canvas: { width: number; height: number };
  lineCap: string;
  lineJoin: string;
  globalCompositeOperation: string;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  font: string;
  textBaseline: string;
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
      save: vi.fn(),
      restore: vi.fn(),
      fill: vi.fn(),
      closePath: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      ellipse: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      arc: vi.fn(),
      globalAlpha: 1,
      canvas: { width: 800, height: 600 },
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation: 'source-over',
      strokeStyle: '#000000',
      fillStyle: '#000000',
      lineWidth: 1,
      font: '10px sans-serif',
      textBaseline: 'alphabetic',
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

  it('clicking the rect tool persists config.activeTool = "rect"', () => {
    const { getByLabelText } = render(<DrawingWidget widget={widget} />);
    fireEvent.click(getByLabelText('Rectangle'));
    expect(mockUpdateWidget).toHaveBeenCalled();
    const lastCall =
      mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
    const cfg = (lastCall[1] as Partial<WidgetData>).config as DrawingConfig;
    expect(cfg.activeTool).toBe('rect');
  });

  it('clicking a color swatch updates color without changing activeTool', () => {
    const widgetWithTool: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        activeTool: 'arrow',
      } as DrawingConfig,
    };
    const { getByLabelText } = render(
      <DrawingWidget widget={widgetWithTool} />
    );
    fireEvent.click(getByLabelText('Color #ff0000'));
    const lastCall =
      mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
    const cfg = (lastCall[1] as Partial<WidgetData>).config as DrawingConfig;
    expect(cfg.color).toBe('#ff0000');
    // activeTool stays as it was — the color click did not flip it back to pen.
    expect(cfg.activeTool).toBe('arrow');
  });

  it('clicking the text tool persists config.activeTool = "text"', () => {
    const { getByLabelText } = render(<DrawingWidget widget={widget} />);
    fireEvent.click(getByLabelText('Text'));
    expect(mockUpdateWidget).toHaveBeenCalled();
    const lastCall =
      mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
    const cfg = (lastCall[1] as Partial<WidgetData>).config as DrawingConfig;
    expect(cfg.activeTool).toBe('text');
  });

  it('text tool: pointer-down on canvas mounts the editor (without persisting an empty object)', () => {
    const widgetTextTool: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        activeTool: 'text',
      } as DrawingConfig,
    };
    const { container } = render(<DrawingWidget widget={widgetTextTool} />);
    expect(container.querySelector('[role="textbox"]')).toBeNull();
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Calls so far are from the initial render (no spawn).
    const callsBefore = mockUpdateWidget.mock.calls.length;
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 25,
        clientY: 35,
      })
    );
    // Editor mounts immediately, but the (empty) object is not persisted —
    // it's held in local state until commit.
    expect(container.querySelector('[role="textbox"]')).not.toBeNull();
    expect(mockUpdateWidget.mock.calls.length).toBe(callsBefore);
  });

  it('text tool: typing + Cmd+Enter persists the text via updateWidget', () => {
    const widgetTextTool: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        activeTool: 'text',
      } as DrawingConfig,
    };
    const { container } = render(<DrawingWidget widget={widgetTextTool} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 25,
        clientY: 35,
      })
    );
    const editor = container.querySelector('[role="textbox"]');
    if (!editor) throw new Error('Editor not found');
    (editor as HTMLElement).innerText = 'classroom';
    mockUpdateWidget.mockClear();
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });

    expect(mockUpdateWidget).toHaveBeenCalled();
    const lastCall =
      mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
    const cfg = (lastCall[1] as Partial<WidgetData>).config as DrawingConfig;
    const objs = cfg.objects ?? [];
    expect(objs).toHaveLength(1);
    expect(objs[0].kind).toBe('text');
    if (objs[0].kind === 'text') {
      expect(objs[0].content).toBe('classroom');
    }
  });

  it('double-click on an existing text object re-opens the editor', () => {
    const textObj = {
      id: 't-1',
      kind: 'text' as const,
      z: 0,
      x: 30,
      y: 40,
      w: 200,
      h: 48,
      content: 'Existing',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    const widgetWithText: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        objects: [textObj],
      } as DrawingConfig,
    };
    const { container } = render(<DrawingWidget widget={widgetWithText} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');
    expect(container.querySelector('[role="textbox"]')).toBeNull();

    // Double-click inside the text bbox
    fireEvent.doubleClick(canvas, { clientX: 50, clientY: 50 });
    const editor = container.querySelector('[role="textbox"]');
    expect(editor).not.toBeNull();
    expect((editor as HTMLElement).innerText).toBe('Existing');
  });

  it('renders an Image button that opens the hidden file picker', () => {
    const { getByLabelText, container } = render(
      <DrawingWidget widget={widget} />
    );
    const button = getByLabelText('Insert image');
    expect(button).not.toBeNull();
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {
        /* noop spy */
      });
    fireEvent.click(button);
    expect(clickSpy).toHaveBeenCalled();
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

  it('clicking the select tool persists config.activeTool = "select"', () => {
    const { getByLabelText } = render(<DrawingWidget widget={widget} />);
    fireEvent.click(getByLabelText('Select'));
    expect(mockUpdateWidget).toHaveBeenCalled();
    const lastCall =
      mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
    const cfg = (lastCall[1] as Partial<WidgetData>).config as DrawingConfig;
    expect(cfg.activeTool).toBe('select');
  });

  it('select tool: clicking an existing rect sets data-selected-id', () => {
    const rectObj = {
      id: 'rect-1',
      kind: 'rect' as const,
      z: 0,
      x: 30,
      y: 30,
      w: 80,
      h: 60,
      stroke: '#000',
      strokeWidth: 2,
    };
    const widgetSelect: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        activeTool: 'select',
        objects: [rectObj],
      } as DrawingConfig,
    };
    const { container } = render(<DrawingWidget widget={widgetSelect} />);
    const canvas = container.querySelector('canvas');
    const wrapper = container.querySelector('[data-selected-id]');
    if (!canvas || !wrapper) throw new Error('Canvas/wrapper not found');
    expect(wrapper.getAttribute('data-selected-id')).toBe('');

    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 50,
      })
    );
    expect(wrapper.getAttribute('data-selected-id')).toBe('rect-1');
  });

  it('select tool: 60 pointermove events between down/up produce EXACTLY ONE updateWidget call (no-flood)', () => {
    const rectObj = {
      id: 'rect-2',
      kind: 'rect' as const,
      z: 0,
      x: 30,
      y: 30,
      w: 80,
      h: 60,
      stroke: '#000',
      strokeWidth: 2,
    };
    const widgetSelect: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        activeTool: 'select',
        objects: [rectObj],
      } as DrawingConfig,
    };
    const { container } = render(<DrawingWidget widget={widgetSelect} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    mockUpdateWidget.mockClear();
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 50,
      })
    );
    for (let i = 0; i < 60; i++) {
      fireEvent(
        canvas,
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: 60 + i,
          clientY: 50 + i,
        })
      );
    }
    fireEvent(
      canvas,
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 60 + 60,
        clientY: 50 + 60,
      })
    );

    // The Widget commits exactly once at pointer-up. All 60 pointer-moves
    // are routed through the local preview state, never updateWidget.
    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const call = mockUpdateWidget.mock.calls[0] as [
      string,
      Partial<WidgetData>,
    ];
    expect(call[0]).toBe(widget.id);
    const cfg = call[1].config as DrawingConfig;
    const objs = cfg.objects ?? [];
    expect(objs).toHaveLength(1);
    expect(objs[0].kind).toBe('rect');
    if (objs[0].kind === 'rect') {
      // Dragged the body by ~60px in each axis.
      expect(objs[0].x).toBeGreaterThan(rectObj.x);
      expect(objs[0].y).toBeGreaterThan(rectObj.y);
    }
  });

  it('Undo button is disabled until a command is pushed; Redo flips after undo', () => {
    const { container } = render(<DrawingWidget widget={widget} />);
    const canvas = container.querySelector('canvas');
    const undoBtn = container.querySelector<HTMLButtonElement>(
      '[aria-label="Undo"]'
    );
    const redoBtn = container.querySelector<HTMLButtonElement>(
      '[aria-label="Redo"]'
    );
    if (!canvas || !undoBtn || !redoBtn) {
      throw new Error('Canvas / Undo / Redo button not found');
    }
    // Fresh widget — both stacks empty.
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
    // Draw a stroke (a single path command).
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      })
    );
    fireEvent(
      canvas,
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      })
    );
    fireEvent(
      canvas,
      new PointerEvent('pointerup', { bubbles: true, cancelable: true })
    );
    // canUndo is reactive — Undo button must enable on the same render.
    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(true);
    // Undo via button click → Redo button enables.
    fireEvent.click(undoBtn);
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(false);
  });

  it('Ctrl+Z and Ctrl+Shift+Z roundtrip: draw → undo → redo', () => {
    const { container } = render(<DrawingWidget widget={widget} />);
    const canvas = container.querySelector('canvas');
    const wrapper = container.querySelector('[data-selected-id]');
    if (!canvas || !wrapper) throw new Error('Canvas/wrapper not found');
    // Draw.
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      })
    );
    fireEvent(
      canvas,
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: 30,
        clientY: 30,
      })
    );
    fireEvent(
      canvas,
      new PointerEvent('pointerup', { bubbles: true, cancelable: true })
    );
    // The first updateWidget call is the add; capture its call count.
    const callsAfterDraw = mockUpdateWidget.mock.calls.length;
    expect(callsAfterDraw).toBeGreaterThan(0);
    // Ctrl+Z → applyCommand reverses the add → updateWidget receives an
    // empty objects array.
    fireEvent.keyDown(wrapper, { key: 'z', ctrlKey: true });
    expect(mockUpdateWidget.mock.calls.length).toBe(callsAfterDraw + 1);
    const undoCfg = (
      mockUpdateWidget.mock.calls[callsAfterDraw][1] as Partial<WidgetData>
    ).config as DrawingConfig;
    expect(undoCfg.objects ?? []).toHaveLength(0);
    // Ctrl+Shift+Z → applyCommand re-applies forward → object back in payload.
    fireEvent.keyDown(wrapper, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockUpdateWidget.mock.calls.length).toBe(callsAfterDraw + 2);
    const redoCfg = (
      mockUpdateWidget.mock.calls[callsAfterDraw + 1][1] as Partial<WidgetData>
    ).config as DrawingConfig;
    expect(redoCfg.objects ?? []).toHaveLength(1);
    expect(redoCfg.objects?.[0].kind).toBe('path');
  });

  it('Clear All is a single bulk command — one undo restores everything', () => {
    const seed = [
      {
        id: 'p-1',
        kind: 'path' as const,
        z: 0,
        color: '#000',
        width: 4,
        points: [
          { x: 5, y: 5 },
          { x: 10, y: 10 },
        ],
      },
      {
        id: 'p-2',
        kind: 'path' as const,
        z: 1,
        color: '#000',
        width: 4,
        points: [
          { x: 20, y: 20 },
          { x: 30, y: 30 },
        ],
      },
    ];
    const widgetWithObjs: WidgetData = {
      ...widget,
      config: { ...widget.config, objects: seed } as DrawingConfig,
    };
    const { container, getByTitle } = render(
      <DrawingWidget widget={widgetWithObjs} />
    );
    mockUpdateWidget.mockClear();
    fireEvent.click(getByTitle('Clear All'));
    // Clear is one push → one updateWidget call → empty objects.
    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const clearCfg = (mockUpdateWidget.mock.calls[0][1] as Partial<WidgetData>)
      .config as DrawingConfig;
    expect(clearCfg.objects).toEqual([]);
    // Undo brings BOTH objects back in a single command — not two undo presses.
    const wrapper = container.querySelector('[data-selected-id]');
    if (!wrapper) throw new Error('wrapper not found');
    fireEvent.keyDown(wrapper, { key: 'z', ctrlKey: true });
    expect(mockUpdateWidget).toHaveBeenCalledTimes(2);
    const undoCfg = (mockUpdateWidget.mock.calls[1][1] as Partial<WidgetData>)
      .config as DrawingConfig;
    expect(undoCfg.objects).toHaveLength(2);
  });

  it('select tool: Backspace removes the selected object', () => {
    const rectObj = {
      id: 'rect-3',
      kind: 'rect' as const,
      z: 0,
      x: 30,
      y: 30,
      w: 80,
      h: 60,
      stroke: '#000',
      strokeWidth: 2,
    };
    const widgetSelect: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        activeTool: 'select',
        objects: [rectObj],
      } as DrawingConfig,
    };
    const { container } = render(<DrawingWidget widget={widgetSelect} />);
    const canvas = container.querySelector('canvas');
    const wrapper = container.querySelector('[data-selected-id]');
    if (!canvas || !wrapper) throw new Error('Canvas/wrapper not found');
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 50,
      })
    );
    // Release immediately so the translate doesn't commit.
    fireEvent(
      canvas,
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 50,
      })
    );
    mockUpdateWidget.mockClear();
    fireEvent.keyDown(wrapper, { key: 'Backspace' });
    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const cfg = (mockUpdateWidget.mock.calls[0][1] as Partial<WidgetData>)
      .config as DrawingConfig;
    expect(cfg.objects).toEqual([]);
  });
});
