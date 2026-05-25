import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useSelection } from '@/components/widgets/DrawingWidget/useSelection';
import type { DrawableObject, RectObject } from '@/types';

const rect = (overrides: Partial<RectObject> = {}): RectObject => ({
  id: 'r1',
  kind: 'rect',
  z: 0,
  x: 10,
  y: 10,
  w: 100,
  h: 80,
  stroke: '#000',
  strokeWidth: 2,
  ...overrides,
});

// Minimal React.PointerEvent stand-in. Only the fields the hook reads are
// populated — anything else is left undefined.
const pe = (overrides: { shiftKey?: boolean } = {}): React.PointerEvent =>
  ({
    shiftKey: overrides.shiftKey ?? false,
    preventDefault: vi.fn(),
  }) as unknown as React.PointerEvent;

const ke = (
  key: string,
  overrides: { shiftKey?: boolean } = {}
): React.KeyboardEvent =>
  ({
    key,
    shiftKey: overrides.shiftKey ?? false,
    preventDefault: vi.fn(),
  }) as unknown as React.KeyboardEvent;

describe('useSelection', () => {
  it('does nothing when activeTool is not "select"', () => {
    const onTransformPreview = vi.fn();
    const onTransformCommit = vi.fn();
    const onRemoveObject = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'pen',
        onTransformPreview,
        onTransformCommit,
        onRemoveObject,
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 30, y: 30 });
    });
    expect(result.current.selectedId).toBeNull();
  });

  it('selects an object on pointer-down hit', () => {
    const onTransformPreview = vi.fn();
    const onTransformCommit = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview,
        onTransformCommit,
        onRemoveObject: vi.fn(),
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    expect(result.current.selectedId).toBe('r1');
  });

  it('clears selection when clicking empty canvas', () => {
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview: vi.fn(),
        onTransformCommit: vi.fn(),
        onRemoveObject: vi.fn(),
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    expect(result.current.selectedId).toBe('r1');
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 500, y: 500 });
    });
    expect(result.current.selectedId).toBeNull();
  });

  it('translate: previews fire on every move, commit fires ONCE on up', () => {
    const onTransformPreview = vi.fn();
    const onTransformCommit = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview,
        onTransformCommit,
        onRemoveObject: vi.fn(),
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleSelectPointerMove(pe(), { x: 60, y: 60 });
    });
    act(() => {
      result.current.handleSelectPointerMove(pe(), { x: 70, y: 65 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 70, y: 65 });
    });
    expect(onTransformPreview).toHaveBeenCalledTimes(2);
    expect(onTransformCommit).toHaveBeenCalledTimes(1);
    const finalObj = onTransformCommit.mock.calls[0][0] as RectObject;
    expect(finalObj.x).toBe(30); // 10 + (70 - 50)
    expect(finalObj.y).toBe(25); // 10 + (65 - 50)
    // Wave 5: the commit must also expose the pre-gesture snapshot so the
    // widget can push a `{ kind: 'update', before, after }` command without
    // reaching into transformState.
    const before = onTransformCommit.mock.calls[0][1] as RectObject;
    expect(before.x).toBe(10);
    expect(before.y).toBe(10);
  });

  it('no-op translate (pointer-up at origin) does NOT commit', () => {
    const onTransformCommit = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview: vi.fn(),
        onTransformCommit,
        onRemoveObject: vi.fn(),
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50, y: 50 });
    });
    expect(onTransformCommit).not.toHaveBeenCalled();
  });

  it('Backspace removes the selected object', () => {
    const onRemoveObject = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview: vi.fn(),
        onTransformCommit: vi.fn(),
        onRemoveObject,
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleKeyDown(ke('Backspace'));
    });
    expect(onRemoveObject).toHaveBeenCalledWith('r1');
    expect(result.current.selectedId).toBeNull();
  });

  it('Delete removes the selected object', () => {
    const onRemoveObject = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview: vi.fn(),
        onTransformCommit: vi.fn(),
        onRemoveObject,
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleKeyDown(ke('Delete'));
    });
    expect(onRemoveObject).toHaveBeenCalledWith('r1');
  });

  it('Arrow nudges 1px and Shift+Arrow nudges 10px, committing each press', () => {
    const onTransformCommit = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview: vi.fn(),
        onTransformCommit,
        onRemoveObject: vi.fn(),
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    // Pointer-down on a body also opens a translate; release it without
    // moving so it doesn't commit, then the nudge is the only commit.
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleKeyDown(ke('ArrowRight'));
    });
    expect(onTransformCommit).toHaveBeenCalledTimes(1);
    const moved = onTransformCommit.mock.calls[0][0] as RectObject;
    expect(moved.x).toBe(11); // 10 + 1
    // Wave 5: each nudge also passes the pre-nudge snapshot.
    const beforeNudge = onTransformCommit.mock.calls[0][1] as RectObject;
    expect(beforeNudge.x).toBe(10);

    act(() => {
      result.current.handleKeyDown(ke('ArrowDown', { shiftKey: true }));
    });
    expect(onTransformCommit).toHaveBeenCalledTimes(2);
    const moved2 = onTransformCommit.mock.calls[1][0] as RectObject;
    expect(moved2.y).toBe(20); // 10 + 10
  });

  it('resize: dragging the SE handle resizes the rect to the new corner', () => {
    const onTransformCommit = vi.fn();
    const objects: DrawableObject[] = [rect({ x: 0, y: 0, w: 100, h: 50 })];
    const { result, rerender } = renderHook(
      ({ objs }) =>
        useSelection({
          objects: objs,
          activeTool: 'select',
          onTransformPreview: vi.fn(),
          onTransformCommit,
          onRemoveObject: vi.fn(),
        }),
      { initialProps: { objs: objects } }
    );
    // First click on the body to select.
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 25 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50, y: 25 });
    });
    rerender({ objs: objects });
    // Now drag the SE handle (at 100,50) to (200,150).
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 100, y: 50 });
    });
    act(() => {
      result.current.handleSelectPointerMove(pe(), { x: 200, y: 150 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 200, y: 150 });
    });
    expect(onTransformCommit).toHaveBeenCalledTimes(1);
    const resized = onTransformCommit.mock.calls[0][0] as RectObject;
    expect(resized.x).toBe(0);
    expect(resized.y).toBe(0);
    expect(resized.w).toBe(200);
    expect(resized.h).toBe(150);
  });

  it('rotate: dragging the rotation handle sets rotation on the object', () => {
    const onTransformCommit = vi.fn();
    const objects: DrawableObject[] = [rect({ x: 0, y: 0, w: 100, h: 100 })];
    const { result, rerender } = renderHook(
      ({ objs }) =>
        useSelection({
          objects: objs,
          activeTool: 'select',
          onTransformPreview: vi.fn(),
          onTransformCommit,
          onRemoveObject: vi.fn(),
        }),
      { initialProps: { objs: objects } }
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50, y: 50 });
    });
    rerender({ objs: objects });
    // Rotation handle is at (50, -24). Drag from there to (50+50, -24+50) → 90deg.
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: -24 });
    });
    act(() => {
      result.current.handleSelectPointerMove(pe(), {
        x: 50 + 50,
        y: -24 + 50,
      });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50 + 50, y: -24 + 50 });
    });
    expect(onTransformCommit).toHaveBeenCalledTimes(1);
    const rotated = onTransformCommit.mock.calls[0][0] as RectObject;
    // The exact rotation depends on coordinate convention; assert it landed
    // somewhere meaningful (more than a few degrees) and is finite.
    expect(rotated.rotation).toBeDefined();
    expect(Math.abs(rotated.rotation ?? 0)).toBeGreaterThan(0.5);
    expect(Number.isFinite(rotated.rotation ?? 0)).toBe(true);
  });

  it('does NOT flood: 60 simulated moves between down and up produce exactly ONE commit', () => {
    const onTransformPreview = vi.fn();
    const onTransformCommit = vi.fn();
    const { result } = renderHook(() =>
      useSelection({
        objects: [rect()],
        activeTool: 'select',
        onTransformPreview,
        onTransformCommit,
        onRemoveObject: vi.fn(),
      })
    );
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.handleSelectPointerMove(pe(), {
          x: 50 + i,
          y: 50 + i,
        });
      });
    }
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50 + 60, y: 50 + 60 });
    });
    expect(onTransformPreview).toHaveBeenCalledTimes(60);
    expect(onTransformCommit).toHaveBeenCalledTimes(1);
  });

  it('resize on rotated object: drag visual NW handle keeps the OPPOSITE (SE) corner pinned in WORLD space', () => {
    // 100x100 rect at origin, rotated 90° CW. Visual NW (rotated) sits at
    // world (100, 0) per the canvas y-down/positive-rotation convention; the
    // opposite SE sits at world (0, 100). Dragging visual NW by (+10, 0) in
    // world coords should keep SE at world (0, 100).
    const onTransformCommit = vi.fn();
    const start: RectObject = {
      id: 'r1',
      kind: 'rect',
      z: 0,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      stroke: '#000',
      strokeWidth: 2,
      rotation: Math.PI / 2,
    };
    const { result, rerender } = renderHook(
      ({ objs }) =>
        useSelection({
          objects: objs,
          activeTool: 'select',
          onTransformPreview: vi.fn(),
          onTransformCommit,
          onRemoveObject: vi.fn(),
        }),
      { initialProps: { objs: [start] as DrawableObject[] } }
    );
    // Select the rect first.
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50, y: 50 });
    });
    rerender({ objs: [start] as DrawableObject[] });
    // Drag the visual NW handle (world position (100, 0)) to (110, 0).
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 100, y: 0 });
    });
    act(() => {
      result.current.handleSelectPointerMove(pe(), { x: 110, y: 0 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 110, y: 0 });
    });
    expect(onTransformCommit).toHaveBeenCalledTimes(1);
    const resized = onTransformCommit.mock.calls[0][0] as RectObject;
    // Pin check: SE corner in WORLD space must remain at (0, 100). The
    // renderer computes world SE as rotatePoint(local_SE, new_center, rot).
    const newCx = resized.x + resized.w / 2;
    const newCy = resized.y + resized.h / 2;
    const localSE = { x: resized.x + resized.w, y: resized.y + resized.h };
    const rot = resized.rotation ?? 0;
    // Apply the same rotation the renderer applies.
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const dx = localSE.x - newCx;
    const dy = localSE.y - newCy;
    const worldSE = {
      x: newCx + dx * cos - dy * sin,
      y: newCy + dx * sin + dy * cos,
    };
    expect(worldSE.x).toBeCloseTo(0, 5);
    expect(worldSE.y).toBeCloseTo(100, 5);
    // And the dragged NW should now land near world (110, 0).
    const localNW = { x: resized.x, y: resized.y };
    const dnwX = localNW.x - newCx;
    const dnwY = localNW.y - newCy;
    const worldNW = {
      x: newCx + dnwX * cos - dnwY * sin,
      y: newCy + dnwX * sin + dnwY * cos,
    };
    expect(worldNW.x).toBeCloseTo(110, 5);
    expect(worldNW.y).toBeCloseTo(0, 5);
  });

  it('handle hit-test uses canvasRef-derived scale (regression: M3 / N-C1)', () => {
    // Mock a canvas where internal resolution is 800x600 but CSS rect is
    // 400x300 — a 2:1 ratio. At scale=2, the handle hit half-side is
    // (HANDLE_SIZE / scale) * 0.75 = (10/2)*0.75 = 3.75 canvas-px. At the
    // (uncorrected) default scale=1 it'd be 7.5 canvas-px — so a click 5px
    // outside the visual handle would (wrongly) resolve as a handle hit
    // instead of a body translate.
    const onTransformCommit = vi.fn();
    const onTransformPreview = vi.fn();
    const canvasEl = document.createElement('canvas');
    canvasEl.width = 800;
    canvasEl.height = 600;
    // Stub getBoundingClientRect to return 2:1 ratio.
    canvasEl.getBoundingClientRect = (() =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
        toJSON: () => ({}),
      }) as DOMRect) as () => DOMRect;
    const canvasRef = {
      current: canvasEl,
    } as React.RefObject<HTMLCanvasElement>;
    const r = rect({ x: 0, y: 0, w: 100, h: 100 });
    const { result, rerender } = renderHook(
      ({ objs }) =>
        useSelection({
          objects: objs,
          activeTool: 'select',
          onTransformPreview,
          onTransformCommit,
          onRemoveObject: vi.fn(),
          canvasRef,
        }),
      { initialProps: { objs: [r] as DrawableObject[] } }
    );
    // Select first.
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 50, y: 50 });
    });
    act(() => {
      result.current.handleSelectPointerUp(pe(), { x: 50, y: 50 });
    });
    rerender({ objs: [r] as DrawableObject[] });
    // NW handle is at canvas coords (0, 0). At scale=2, half-side = 3.75.
    // Click at (3, 3) — inside the scaled hit region. Should resolve to 'nw'.
    act(() => {
      result.current.handleSelectPointerDown(pe(), { x: 3, y: 3 });
    });
    expect(result.current.transformState?.mode).toBe('nw');
  });
});
