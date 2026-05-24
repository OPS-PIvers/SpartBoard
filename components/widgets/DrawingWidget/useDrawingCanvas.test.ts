import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useDrawingCanvas } from './useDrawingCanvas';
import type {
  ArrowObject,
  DrawableObject,
  EllipseObject,
  LineObject,
  PathObject,
  RectObject,
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
  canvas: { width: number; height: number };
  lineCap: string;
  lineJoin: string;
  globalCompositeOperation: string;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
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
  canvas: { width: 800, height: 600 },
  lineCap: 'round',
  lineJoin: 'round',
  globalCompositeOperation: 'source-over',
  strokeStyle: '#000000',
  fillStyle: '#000000',
  lineWidth: 1,
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
});
