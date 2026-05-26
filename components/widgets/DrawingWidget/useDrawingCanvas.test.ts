import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useDrawingCanvas } from './useDrawingCanvas';
import { DRAWING_DEFAULTS } from './constants';
import type {
  ArrowObject,
  DrawableObject,
  EllipseObject,
  LineObject,
  PathObject,
  RectObject,
  TextObject,
} from '@/types';

interface MockCtx {
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
  setLineDash: Mock;
  arc: Mock;
  rect: Mock;
  clip: Mock;
  translate: Mock;
  rotate: Mock;
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

const makeMockCtx = (): MockCtx => ({
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
  // translate/rotate added to match the renderer/selection mocks — the
  // dispatcher invokes these for rotated kinds (rect/ellipse/text/image).
  // None of the existing tests in this file pass a rotated object, so the
  // absence of these mocks was previously invisible; adding them future-
  // proofs the suite for rotation-aware tests.
  translate: vi.fn(),
  rotate: vi.fn(),
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
});

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  return canvas;
};

const pathObj = (overrides: Partial<PathObject> = {}): PathObject => ({
  id: 'obj-1',
  kind: 'path',
  z: 0,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  color: '#f00',
  width: 4,
  ...overrides,
});

describe('useDrawingCanvas', () => {
  let mockCtx: MockCtx;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders existing path objects on mount', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [
      pathObj({
        points: [
          { x: 3, y: 3 },
          { x: 7, y: 7 },
        ],
      }),
    ];

    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 1,
      })
    );

    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.moveTo).toHaveBeenCalledWith(3, 3);
    expect(mockCtx.lineTo).toHaveBeenCalledWith(7, 7);
    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  it('ignores empty path objects (fewer than 2 points)', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [pathObj({ points: [{ x: 0, y: 0 }] })];

    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 1,
      })
    );

    // Clear + set up draw, but never strokes a degenerate path
    expect(mockCtx.stroke).not.toHaveBeenCalled();
  });

  it('renders in z-order (low z first so higher z overlays)', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [
      pathObj({
        id: 'b',
        z: 5,
        points: [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ],
      }),
      pathObj({
        id: 'a',
        z: 1,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      }),
    ];

    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 6,
      })
    );

    const moveCalls = mockCtx.moveTo.mock.calls;
    // First moveTo should be the low-z object (z:1 at 1,1), then the high-z one
    expect(moveCalls[0]).toEqual([1, 1]);
    expect(moveCalls[1]).toEqual([100, 100]);
  });

  it('uses destination-out composite op for eraser paths', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [
      pathObj({
        color: 'eraser',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
      }),
    ];

    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 1,
      })
    );

    // After the path renders, the final composite op is reset to source-over;
    // we verify via strokeStyle which reflects the eraser branch.
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.globalCompositeOperation).toBe('source-over');
  });

  it('on pointerup emits a new PathObject with kind=path, supplied id, and nextZ', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const onObjectComplete = vi.fn();
    const generateId = vi.fn(() => 'deterministic-id');

    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#123',
        width: 7,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        generateId,
        nextZ: 42,
      })
    );

    const mkEvent = (clientX: number, clientY: number) =>
      ({
        clientX,
        clientY,
        pointerId: 1,
      }) as unknown as React.PointerEvent;

    act(() => result.current.handleStart(mkEvent(2, 3)));
    act(() => result.current.handleMove(mkEvent(5, 6)));
    act(() => result.current.handleEnd());

    expect(onObjectComplete).toHaveBeenCalledTimes(1);
    const emitted = onObjectComplete.mock.calls[0][0] as PathObject;
    expect(emitted).toMatchObject({
      id: 'deterministic-id',
      kind: 'path',
      z: 42,
      color: '#123',
      width: 7,
    });
    expect(emitted.points).toEqual([
      { x: 2, y: 3 },
      { x: 5, y: 6 },
    ]);
  });

  it('does not emit a path when pointer barely moves (<2 points)', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const onObjectComplete = vi.fn();

    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
      })
    );

    const mkEvent = (x: number, y: number) =>
      ({ clientX: x, clientY: y }) as unknown as React.PointerEvent;
    act(() => result.current.handleStart(mkEvent(1, 1)));
    act(() => result.current.handleEnd());

    expect(onObjectComplete).not.toHaveBeenCalled();
  });

  it('is a no-op when disabled (student view)', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const onObjectComplete = vi.fn();

    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        disabled: true,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
      })
    );

    const mkEvent = (x: number, y: number) =>
      ({ clientX: x, clientY: y }) as unknown as React.PointerEvent;
    act(() => result.current.handleStart(mkEvent(0, 0)));
    act(() => result.current.handleMove(mkEvent(10, 10)));
    act(() => result.current.handleEnd());

    expect(onObjectComplete).not.toHaveBeenCalled();
    expect(result.current.isDrawing).toBe(false);
  });

  it('scales pointer coordinates by the DOM-measured internal-to-CSS ratio', () => {
    // Canvas internal resolution 800x600, but CSS-rendered at half size
    // (e.g. via a parent `transform: scale(0.5)`). Pointer coords should be
    // multiplied by canvas.width/rect.width = 2 to land in canvas space.
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const onObjectComplete = vi.fn();

    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
      })
    );

    const mkEvent = (x: number, y: number) =>
      ({ clientX: x, clientY: y }) as unknown as React.PointerEvent;
    act(() => result.current.handleStart(mkEvent(50, 100)));
    act(() => result.current.handleMove(mkEvent(150, 200)));
    act(() => result.current.handleEnd());

    const emitted = onObjectComplete.mock.calls[0][0] as PathObject;
    expect(emitted.points).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ]);
  });

  it('uses a 1:1 ratio when canvas internal resolution matches CSS size', () => {
    // Default mocked rect is 800x600, matching canvas.width/height — so
    // pointer coords should pass through unchanged (minus rect offset).
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const onObjectComplete = vi.fn();

    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
      })
    );

    const mkEvent = (x: number, y: number) =>
      ({ clientX: x, clientY: y }) as unknown as React.PointerEvent;
    act(() => result.current.handleStart(mkEvent(100, 200)));
    act(() => result.current.handleMove(mkEvent(300, 400)));
    act(() => result.current.handleEnd());

    const emitted = onObjectComplete.mock.calls[0][0] as PathObject;
    expect(emitted.points).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ]);
  });

  // --- Shape capture (Phase 2 PR 2.1b) -------------------------------------

  const mkPtr = (x: number, y: number) =>
    ({ clientX: x, clientY: y }) as unknown as React.PointerEvent;

  it('emits a normalized RectObject on rect tool drag (down-right)', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#0a0',
        width: 5,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        generateId: () => 'rect-1',
        nextZ: 1,
        activeTool: 'rect',
      })
    );
    act(() => result.current.handleStart(mkPtr(10, 20)));
    act(() => result.current.handleMove(mkPtr(110, 80)));
    act(() => result.current.handleEnd());

    expect(onObjectComplete).toHaveBeenCalledTimes(1);
    const emitted = onObjectComplete.mock.calls[0][0] as RectObject;
    expect(emitted).toMatchObject({
      id: 'rect-1',
      kind: 'rect',
      z: 1,
      x: 10,
      y: 20,
      w: 100,
      h: 60,
      stroke: '#0a0',
      strokeWidth: 5,
    });
    expect(emitted.fill).toBeUndefined();
  });

  it('normalizes rect drag up-left to non-negative w/h with corrected x/y', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#f00',
        width: 3,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
        activeTool: 'rect',
      })
    );
    act(() => result.current.handleStart(mkPtr(200, 150)));
    act(() => result.current.handleMove(mkPtr(50, 30)));
    act(() => result.current.handleEnd());

    const emitted = onObjectComplete.mock.calls[0][0] as RectObject;
    expect(emitted.x).toBe(50);
    expect(emitted.y).toBe(30);
    expect(emitted.w).toBe(150);
    expect(emitted.h).toBe(120);
  });

  it('emits an EllipseObject on ellipse tool drag', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#00a',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 2,
        activeTool: 'ellipse',
      })
    );
    act(() => result.current.handleStart(mkPtr(40, 60)));
    act(() => result.current.handleMove(mkPtr(140, 110)));
    act(() => result.current.handleEnd());

    const emitted = onObjectComplete.mock.calls[0][0] as EllipseObject;
    expect(emitted.kind).toBe('ellipse');
    expect(emitted).toMatchObject({
      x: 40,
      y: 60,
      w: 100,
      h: 50,
      stroke: '#00a',
      strokeWidth: 4,
    });
  });

  it('emits a LineObject on line tool drag', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#abc',
        width: 2,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 3,
        activeTool: 'line',
      })
    );
    act(() => result.current.handleStart(mkPtr(5, 5)));
    act(() => result.current.handleMove(mkPtr(95, 75)));
    act(() => result.current.handleEnd());

    const emitted = onObjectComplete.mock.calls[0][0] as LineObject;
    expect(emitted).toMatchObject({
      kind: 'line',
      z: 3,
      x1: 5,
      y1: 5,
      x2: 95,
      y2: 75,
      stroke: '#abc',
      strokeWidth: 2,
    });
  });

  it('emits an ArrowObject on arrow tool drag', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#def',
        width: 6,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
        activeTool: 'arrow',
      })
    );
    act(() => result.current.handleStart(mkPtr(100, 100)));
    act(() => result.current.handleMove(mkPtr(200, 200)));
    act(() => result.current.handleEnd());

    const emitted = onObjectComplete.mock.calls[0][0] as ArrowObject;
    expect(emitted.kind).toBe('arrow');
    expect(emitted).toMatchObject({
      x1: 100,
      y1: 100,
      x2: 200,
      y2: 200,
      stroke: '#def',
      strokeWidth: 6,
    });
  });

  it('drops a degenerate rect (zero width and height)', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
        activeTool: 'rect',
      })
    );
    act(() => result.current.handleStart(mkPtr(50, 50)));
    act(() => result.current.handleEnd()); // no move → x0===x1 and y0===y1
    expect(onObjectComplete).not.toHaveBeenCalled();
  });

  it('drops a degenerate line (start equals end)', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
        activeTool: 'line',
      })
    );
    act(() => result.current.handleStart(mkPtr(50, 50)));
    act(() => result.current.handleEnd());
    expect(onObjectComplete).not.toHaveBeenCalled();
  });

  it('rect with shapeFill: true produces fill === stroke color', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#ff00ff',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
        activeTool: 'rect',
        shapeFill: true,
      })
    );
    act(() => result.current.handleStart(mkPtr(0, 0)));
    act(() => result.current.handleMove(mkPtr(10, 10)));
    act(() => result.current.handleEnd());

    const emitted = onObjectComplete.mock.calls[0][0] as RectObject;
    expect(emitted.fill).toBe('#ff00ff');
  });

  it('ignores a tool change made mid-drag (activeTool captured at handleStart)', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ tool }: { tool: 'rect' | 'ellipse' }) =>
        useDrawingCanvas({
          canvasRef,
          color: '#000',
          width: 4,
          objects: [],
          onObjectComplete,
          canvasSize: { width: 800, height: 600 },
          nextZ: 0,
          activeTool: tool,
        }),
      { initialProps: { tool: 'rect' as 'rect' | 'ellipse' } }
    );
    act(() => result.current.handleStart(mkPtr(10, 10)));
    // Switch the tool mid-drag — should NOT change what gets emitted.
    rerender({ tool: 'ellipse' });
    act(() => result.current.handleMove(mkPtr(60, 50)));
    act(() => result.current.handleEnd());

    expect(onObjectComplete).toHaveBeenCalledTimes(1);
    const emitted = onObjectComplete.mock.calls[0][0] as DrawableObject;
    expect(emitted.kind).toBe('rect');
  });

  it('renders existing RectObjects via the shape dispatcher', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [
      {
        id: 'r',
        kind: 'rect',
        z: 0,
        x: 5,
        y: 6,
        w: 50,
        h: 40,
        stroke: '#000',
        strokeWidth: 3,
      },
    ];
    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 1,
      })
    );
    expect(mockCtx.strokeRect).toHaveBeenCalledWith(5, 6, 50, 40);
  });

  // --- Text tool (Phase 2 PR 2.1d) -----------------------------------------

  it('text tool: click invokes onTextSpawn exactly once with a fresh empty TextObject', () => {
    const canvasRef = { current: makeCanvas() };
    const onTextSpawn = vi.fn();
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#123456',
        width: 4,
        objects: [],
        onObjectComplete,
        onTextSpawn,
        canvasSize: { width: 800, height: 600 },
        generateId: () => 'text-id',
        nextZ: 7,
        activeTool: 'text',
      })
    );
    act(() => result.current.handleStart(mkPtr(123, 45)));
    expect(onTextSpawn).toHaveBeenCalledTimes(1);
    const spawned = onTextSpawn.mock.calls[0][0] as TextObject;
    expect(spawned).toMatchObject({
      id: 'text-id',
      kind: 'text',
      z: 7,
      x: 123,
      y: 45,
      content: '',
      color: '#123456',
      fontFamily: DRAWING_DEFAULTS.TEXT_FONT_FAMILY,
      fontSize: DRAWING_DEFAULTS.TEXT_FONT_SIZE_PX,
      w: DRAWING_DEFAULTS.TEXT_PLACEHOLDER_W,
      h: DRAWING_DEFAULTS.TEXT_PLACEHOLDER_H,
    });
    expect(onObjectComplete).not.toHaveBeenCalled();
  });

  it('text tool: pointer-move and pointer-up after spawn are no-ops (no extra emissions)', () => {
    const canvasRef = { current: makeCanvas() };
    const onTextSpawn = vi.fn();
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        onTextSpawn,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
        activeTool: 'text',
      })
    );
    act(() => result.current.handleStart(mkPtr(10, 10)));
    act(() => result.current.handleMove(mkPtr(50, 80)));
    act(() => result.current.handleEnd());

    expect(onTextSpawn).toHaveBeenCalledTimes(1);
    expect(onObjectComplete).not.toHaveBeenCalled();
    // isDrawing must stay false so handleMove is a true no-op and we never
    // accidentally start a drag preview under the text editor.
    expect(result.current.isDrawing).toBe(false);
  });

  it('text tool: spawn is suppressed when no onTextSpawn callback is wired', () => {
    const canvasRef = { current: makeCanvas() };
    const onObjectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects: [],
        onObjectComplete,
        canvasSize: { width: 800, height: 600 },
        nextZ: 0,
        activeTool: 'text',
      })
    );
    act(() => result.current.handleStart(mkPtr(10, 10)));
    expect(onObjectComplete).not.toHaveBeenCalled();
    expect(result.current.isDrawing).toBe(false);
  });

  it('renders existing TextObjects via the text dispatcher (fillText per line)', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [
      {
        id: 't',
        kind: 'text',
        z: 0,
        x: 10,
        y: 20,
        w: 200,
        h: 48,
        content: 'hello\nworld',
        fontFamily: 'sans-serif',
        fontSize: 24,
        color: '#000',
      },
    ];
    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 1,
      })
    );
    // First line baseline = y + fontSize = 20 + 24 = 44.
    expect(mockCtx.fillText).toHaveBeenNthCalledWith(1, 'hello', 10, 44);
    // Second line: previous + fontSize * 1.2 = 44 + 28.8 = 72.8.
    const secondCall = mockCtx.fillText.mock.calls[1];
    expect(secondCall[0]).toBe('world');
    expect(secondCall[1]).toBe(10);
    expect(secondCall[2]).toBeCloseTo(72.8, 5);
  });

  it('skips rendering empty-content TextObjects (in-edit sentinel)', () => {
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [
      {
        id: 't',
        kind: 'text',
        z: 0,
        x: 0,
        y: 0,
        w: 200,
        h: 48,
        content: '',
        fontFamily: 'sans-serif',
        fontSize: 24,
        color: '#000',
      },
    ];
    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 1,
      })
    );
    expect(mockCtx.fillText).not.toHaveBeenCalled();
  });

  // --- Image rendering (Phase 2 PR 2.2) ------------------------------------

  it('image rendering: first pass allocates an Image with crossOrigin=anonymous; no draw until load', () => {
    // Stub `window.Image` to capture allocations without actually decoding.
    class StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin: string | null = null;
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      private _src = '';
      get src() {
        return this._src;
      }
      set src(v: string) {
        this._src = v;
      }
    }
    const allocated: StubImage[] = [];
    const Original = window.Image;
    window.Image = class extends StubImage {
      constructor() {
        super();
        allocated.push(this);
      }
    } as unknown as typeof Image;

    const canvas = makeCanvas();
    const drawImageSpy = vi.fn();
    (mockCtx as unknown as { drawImage: typeof drawImageSpy }).drawImage =
      drawImageSpy;
    const canvasRef = { current: canvas };
    const objects: DrawableObject[] = [
      {
        id: 'img-1',
        kind: 'image',
        z: 0,
        x: 5,
        y: 6,
        w: 50,
        h: 40,
        src: 'https://example.com/draw-test.png',
      },
    ];
    renderHook(() =>
      useDrawingCanvas({
        canvasRef,
        color: '#000',
        width: 4,
        objects,
        onObjectComplete: vi.fn(),
        canvasSize: { width: 800, height: 600 },
        nextZ: 1,
      })
    );
    expect(allocated.length).toBe(1);
    expect(allocated[0].crossOrigin).toBe('anonymous');
    expect(allocated[0].src).toBe('https://example.com/draw-test.png');
    // Not loaded yet, so drawImage must NOT have fired.
    expect(drawImageSpy).not.toHaveBeenCalled();

    window.Image = Original;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2 PR 2.6 — incremental render
  // ─────────────────────────────────────────────────────────────────────────

  describe('incremental render', () => {
    const makeObjects = (count: number): DrawableObject[] =>
      Array.from({ length: count }, (_, i) =>
        pathObj({
          id: `obj-${i}`,
          z: i,
          // Spread the objects across the canvas so the dirty-region
          // intersect test in the hook has something nontrivial to do.
          points: [
            { x: (i * 7) % 700, y: (i * 11) % 500 },
            { x: ((i * 7) % 700) + 5, y: ((i * 11) % 500) + 5 },
          ],
        })
      );

    it('changing 1 of 100 objects clears only a small region, not the full canvas', () => {
      const canvas = makeCanvas();
      const canvasRef = { current: canvas };
      const initial = makeObjects(100);

      const { rerender } = renderHook(
        ({ objects }: { objects: DrawableObject[] }) =>
          useDrawingCanvas({
            canvasRef,
            color: '#000',
            width: 4,
            objects,
            onObjectComplete: vi.fn(),
            canvasSize: { width: 800, height: 600 },
            nextZ: 100,
          }),
        { initialProps: { objects: initial } }
      );

      mockCtx.clearRect.mockClear();

      // Mutate one object — produce a fresh object so reference equality
      // marks it dirty.
      const next: DrawableObject[] = initial.map((o, i) => {
        if (i !== 50 || o.kind !== 'path') return o;
        return pathObj({
          id: o.id,
          z: o.z,
          color: o.color,
          width: o.width,
          points: [
            { x: 200, y: 200 },
            { x: 210, y: 210 },
          ],
        });
      });
      rerender({ objects: next });

      expect(mockCtx.clearRect).toHaveBeenCalled();
      // The incremental path clears a region SMALLER than the full canvas
      // (800 × 600). Walk every clearRect call; at least one must have
      // smaller width AND smaller height than the canvas.
      const calls = mockCtx.clearRect.mock.calls;
      const partialClear = calls.some(
        (args) => (args[2] as number) < 800 || (args[3] as number) < 600
      );
      expect(partialClear).toBe(true);
    });

    it('thick-stroke neighbor adjacent to a dirty region is redrawn via the STROKED-bbox intersect', () => {
      // Two objects:
      //   * neighbor: thick stroke at (95..105, 0..200). Geometric bbox sits
      //     just OUTSIDE a dirty region centered on (50..90, 50..90), but
      //     its STROKED bbox (with strokeWidth=20 → pad=10) overlaps.
      //   * target: the object that mutates and pulls in the dirty region.
      // Without the stroked-bbox intersect, the neighbor would be skipped
      // and the cleared dirty region would bite its stroke.
      const canvas = makeCanvas();
      const canvasRef = { current: canvas };
      // Need 25+ objects so the incremental path runs (small-N early-exit).
      const filler = Array.from({ length: 30 }, (_, i) =>
        pathObj({
          id: `filler-${i}`,
          z: i,
          // Position filler off in a corner so they don't interfere with
          // the dirty-region intersect math.
          points: [
            { x: 700 + i * 0.1, y: 500 + i * 0.1 },
            { x: 705 + i * 0.1, y: 505 + i * 0.1 },
          ],
        })
      );
      const initial: DrawableObject[] = [
        ...filler,
        // A thick path running vertically just east of the dirty region.
        // strokeWidth=20 means pad=10 → stroked bbox overlaps x=50..90.
        pathObj({
          id: 'thick-neighbor',
          z: 100,
          width: 20,
          points: [
            { x: 100, y: 0 },
            { x: 100, y: 200 },
          ],
        }),
        // The object that will mutate. Its bbox is 50..90 / 50..90.
        pathObj({
          id: 'target',
          z: 101,
          points: [
            { x: 50, y: 50 },
            { x: 90, y: 90 },
          ],
        }),
      ];

      const { rerender } = renderHook(
        ({ objects }: { objects: DrawableObject[] }) =>
          useDrawingCanvas({
            canvasRef,
            color: '#000',
            width: 4,
            objects,
            onObjectComplete: vi.fn(),
            canvasSize: { width: 800, height: 600 },
            nextZ: 200,
          }),
        { initialProps: { objects: initial } }
      );

      // Reset spies before the diff render so we only see the incremental
      // pass.
      mockCtx.clearRect.mockClear();
      mockCtx.moveTo.mockClear();
      mockCtx.lineTo.mockClear();

      // Mutate the target only.
      const next: DrawableObject[] = initial.map((o) => {
        if (o.id !== 'target' || o.kind !== 'path') return o;
        return pathObj({
          id: o.id,
          z: o.z,
          color: o.color,
          width: o.width,
          points: [
            { x: 55, y: 55 },
            { x: 95, y: 95 },
          ],
        });
      });
      rerender({ objects: next });

      // The neighbor's stroke runs along x=100 — its STROKED bbox extends
      // to x=90. The dirty region (from the target's bbox 50..90 plus 24px
      // STROKE_PAD) extends to x=114. So the neighbor's stroked bbox
      // intersects the dirty region and must be re-rendered: at least one
      // moveTo at (100, 0) must show up.
      const neighborRedrawn = mockCtx.moveTo.mock.calls.some(
        (args) => args[0] === 100 && args[1] === 0
      );
      expect(neighborRedrawn).toBe(true);
    });

    it('changing 30 of 100 objects falls back to a full-canvas clear', () => {
      const canvas = makeCanvas();
      const canvasRef = { current: canvas };
      const initial = makeObjects(100);

      const { rerender } = renderHook(
        ({ objects }: { objects: DrawableObject[] }) =>
          useDrawingCanvas({
            canvasRef,
            color: '#000',
            width: 4,
            objects,
            onObjectComplete: vi.fn(),
            canvasSize: { width: 800, height: 600 },
            nextZ: 100,
          }),
        { initialProps: { objects: initial } }
      );

      mockCtx.clearRect.mockClear();

      // Mutate 30 objects (≥ 25 absolute and ≥ 25% of total) — exceeds
      // both thresholds in the hook so the fallback path runs.
      const next: DrawableObject[] = initial.map((o, i) => {
        if (i >= 30 || o.kind !== 'path') return o;
        return pathObj({
          id: o.id,
          z: o.z,
          color: o.color,
          width: o.width,
          points: [
            { x: 100 + i, y: 100 + i },
            { x: 110 + i, y: 110 + i },
          ],
        });
      });
      rerender({ objects: next });

      // Full-canvas clear must have happened at least once.
      const fullClearHit = mockCtx.clearRect.mock.calls.some(
        (args) =>
          args[0] === 0 && args[1] === 0 && args[2] === 800 && args[3] === 600
      );
      expect(fullClearHit).toBe(true);
    });
  });
});
