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
});
