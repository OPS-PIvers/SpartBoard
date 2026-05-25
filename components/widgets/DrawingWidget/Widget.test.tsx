import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DrawingWidget } from './Widget';
import { WidgetData, DrawingConfig, DrawableObject } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';

/**
 * Phase 2 PR 2.3 helper — every updateWidget(...) payload now carries the
 * post-migration `pages[]` shape. Most existing assertions only care about
 * the objects on the active page (page 0 in most tests), so this thin
 * accessor reads page 0's objects (falling back to legacy `objects` for any
 * remaining tests that haven't been ported).
 */
const objectsFromConfig = (cfg: DrawingConfig): DrawableObject[] => {
  if (Array.isArray(cfg.pages) && cfg.pages.length > 0) {
    return cfg.pages[0].objects;
  }
  return cfg.objects ?? [];
};

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
  // Phase 2 PR 2.6 incremental render uses rect + clip to mask the dirty
  // region during partial redraws.
  rect: Mock;
  clip: Mock;
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
      rect: vi.fn(),
      clip: vi.fn(),
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

  it('tool buttons use aria-pressed reflecting activeTool (toggle-button group, not radiogroup)', () => {
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
    // The active tool's button is aria-pressed=true; all others are false.
    expect(getByLabelText('Arrow')).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Select')).toHaveAttribute('aria-pressed', 'false');
    expect(getByLabelText('Pen')).toHaveAttribute('aria-pressed', 'false');
    // Old role="radio" / aria-checked are GONE — assert it.
    expect(getByLabelText('Arrow')).not.toHaveAttribute('aria-checked');
    expect(getByLabelText('Arrow').getAttribute('role')).not.toBe('radio');
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
    const objs = objectsFromConfig(cfg);
    expect(objs).toHaveLength(1);
    expect(objs[0].kind).toBe('text');
    if (objs[0].kind === 'text') {
      expect(objs[0].content).toBe('classroom');
    }
  });

  it('re-edit existing TextObject + erase all + Cmd+Enter removes the object via a remove command', () => {
    const textObj = {
      id: 't-erase',
      kind: 'text' as const,
      z: 0,
      x: 30,
      y: 40,
      w: 200,
      h: 48,
      content: 'goodbye',
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
    // Re-open via double-click.
    fireEvent.doubleClick(canvas, { clientX: 50, clientY: 50 });
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    if (!editor) throw new Error('Editor not found');
    // Erase the content and commit.
    editor.innerText = '';
    mockUpdateWidget.mockClear();
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    // Empty re-edit commits the empty content through onCommit; the Widget
    // resolves that to a remove command, so the persisted objects[] is empty.
    expect(mockUpdateWidget).toHaveBeenCalled();
    const lastCall =
      mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
    const cfg = (lastCall[1] as Partial<WidgetData>).config as DrawingConfig;
    expect(objectsFromConfig(cfg)).toEqual([]);
  });

  it('export popover dismisses on outside pointerdown', () => {
    const widgetWithPage: WidgetData = {
      ...widget,
      config: {
        color: '#000',
        width: 4,
        pages: [{ id: 'p1', objects: [] }],
        currentPage: 0,
      } as DrawingConfig,
    };
    const { container, getByLabelText } = render(
      <DrawingWidget widget={widgetWithPage} />
    );
    // Open the export popover.
    fireEvent.click(getByLabelText('Export'));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    // Pointerdown on document.body (outside the menu) closes it.
    fireEvent.pointerDown(document.body);
    expect(container.querySelector('[role="menu"]')).toBeNull();
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
    const objects = objectsFromConfig(newConfig);
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
    const objs = objectsFromConfig(cfg);
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
    expect(objectsFromConfig(undoCfg)).toHaveLength(0);
    // Ctrl+Shift+Z → applyCommand re-applies forward → object back in payload.
    fireEvent.keyDown(wrapper, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockUpdateWidget.mock.calls.length).toBe(callsAfterDraw + 2);
    const redoCfg = (
      mockUpdateWidget.mock.calls[callsAfterDraw + 1][1] as Partial<WidgetData>
    ).config as DrawingConfig;
    const redoObjs = objectsFromConfig(redoCfg);
    expect(redoObjs).toHaveLength(1);
    expect(redoObjs[0].kind).toBe('path');
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
    expect(objectsFromConfig(clearCfg)).toEqual([]);
    // Undo brings BOTH objects back in a single command — not two undo presses.
    const wrapper = container.querySelector('[data-selected-id]');
    if (!wrapper) throw new Error('wrapper not found');
    fireEvent.keyDown(wrapper, { key: 'z', ctrlKey: true });
    expect(mockUpdateWidget).toHaveBeenCalledTimes(2);
    const undoCfg = (mockUpdateWidget.mock.calls[1][1] as Partial<WidgetData>)
      .config as DrawingConfig;
    expect(objectsFromConfig(undoCfg)).toHaveLength(2);
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
    expect(objectsFromConfig(cfg)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Phase 2 PR 2.3 — multi-page widgets
  // ---------------------------------------------------------------------------

  it('multi-page: renders a page strip with one page chip by default', () => {
    const { getByLabelText } = render(<DrawingWidget widget={widget} />);
    // The page strip exposes the page chip via its aria-label.
    expect(getByLabelText('Page 1')).not.toBeNull();
    // And an explicit "Add page" affordance.
    expect(getByLabelText('Add page')).not.toBeNull();
  });

  it('multi-page: clicking Add page persists a second page and navigates to it', () => {
    const { getByLabelText } = render(<DrawingWidget widget={widget} />);
    fireEvent.click(getByLabelText('Add page'));
    expect(mockUpdateWidget).toHaveBeenCalled();
    const lastCall =
      mockUpdateWidget.mock.calls[mockUpdateWidget.mock.calls.length - 1];
    const cfg = (lastCall[1] as Partial<WidgetData>).config as DrawingConfig;
    expect(cfg.pages).toHaveLength(2);
    expect(cfg.currentPage).toBe(1);
  });

  it('multi-page: pre-Wave-6 saved widget data auto-migrates and renders unchanged', () => {
    // Simulate a pre-2.3 widget — legacy `objects[]`, no `pages`/`currentPage`.
    const legacy: WidgetData = {
      ...widget,
      config: {
        color: '#000',
        width: 4,
        // Note: `objects` only — no `pages`. The widget's defensive
        // migration must wrap this into pages[0].objects on read.
        objects: [
          {
            id: 'legacy-rect',
            kind: 'rect' as const,
            z: 0,
            x: 10,
            y: 10,
            w: 50,
            h: 50,
            stroke: '#000',
            strokeWidth: 2,
          },
        ],
      } as DrawingConfig,
    };
    const { getByLabelText } = render(<DrawingWidget widget={legacy} />);
    // Single page is implied; the strip exposes Page 1.
    expect(getByLabelText('Page 1')).not.toBeNull();
    // The legacy rect is rendered exactly as it was — strokeRect was called.
    expect(mockContext.strokeRect).toHaveBeenCalled();
  });

  it('multi-page: deleting a page persists currentPage clamping (the test that locks in page-N+1 contents)', () => {
    // Seed a two-page config: page 0 has a rect, page 1 is empty.
    const pagedWidget: WidgetData = {
      ...widget,
      config: {
        color: '#000',
        width: 4,
        pages: [
          {
            id: 'p1',
            objects: [
              {
                id: 'kept-rect',
                kind: 'rect' as const,
                z: 0,
                x: 20,
                y: 20,
                w: 40,
                h: 40,
                stroke: '#000',
                strokeWidth: 2,
              },
            ],
          },
          { id: 'p2', objects: [] },
        ],
        currentPage: 1,
      } as DrawingConfig,
    };
    const { getByLabelText } = render(<DrawingWidget widget={pagedWidget} />);
    // Open page 2's kebab and delete.
    fireEvent.click(getByLabelText('Page 2 actions'));
    // The kebab popup is intentionally NOT an ARIA menu (see PageStrip
    // comment) — find the Delete button by text content.
    const popupButtons = document.querySelectorAll('button');
    const deleteBtn = Array.from(popupButtons).find(
      (b) => (b.textContent ?? '').trim().toLowerCase() === 'delete'
    ) as HTMLElement | undefined;
    if (!deleteBtn) throw new Error('Delete button not found');
    mockUpdateWidget.mockClear();
    fireEvent.click(deleteBtn);
    expect(mockUpdateWidget).toHaveBeenCalled();
    const cfg = (
      mockUpdateWidget.mock.calls[
        mockUpdateWidget.mock.calls.length - 1
      ][1] as Partial<WidgetData>
    ).config as DrawingConfig;
    expect(cfg.pages).toHaveLength(1);
    // Page 0's contents (the rect) are preserved.
    expect(cfg.pages?.[0].id).toBe('p1');
    expect(cfg.pages?.[0].objects).toHaveLength(1);
    expect(cfg.pages?.[0].objects[0].id).toBe('kept-rect');
    // currentPage clamps from 1 → 0.
    expect(cfg.currentPage).toBe(0);
  });
});
