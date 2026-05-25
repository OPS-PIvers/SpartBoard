import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DrawableObject, RectObject } from '@/types';
import { useCommandStack } from '@/components/widgets/DrawingWidget/useCommandStack';

// Tiny builder so each test reads as data, not setup boilerplate.
const rect = (overrides: Partial<RectObject> = {}): RectObject => ({
  id: 'r1',
  kind: 'rect',
  z: 0,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  stroke: '#000',
  strokeWidth: 1,
  ...overrides,
});

/**
 * Drive the hook end-to-end the way `Widget.tsx` does: hold the objects array
 * in a closure, re-render the hook on each `onObjectsChange` write so the
 * subsequent push/undo/redo sees the latest snapshot. This is the only way to
 * verify `canUndo`/`canRedo` actually flip — `useRef` writes wouldn't.
 */
const renderStack = (initial: DrawableObject[] = [], pageKey = 'page-1') => {
  let objects: DrawableObject[] = initial;
  let key = pageKey;
  const onObjectsChange = vi.fn((next: DrawableObject[]) => {
    objects = next;
  });
  const { result, rerender } = renderHook(
    ({ objs, k }: { objs: DrawableObject[]; k: string }) =>
      useCommandStack({ pageKey: k, objects: objs, onObjectsChange }),
    { initialProps: { objs: objects, k: key } }
  );
  const sync = () => rerender({ objs: objects, k: key });
  const switchPage = (nextKey: string, nextObjs: DrawableObject[] = []) => {
    key = nextKey;
    objects = nextObjs;
    rerender({ objs: objects, k: key });
  };
  return {
    result,
    onObjectsChange,
    getObjects: () => objects,
    sync,
    switchPage,
  };
};

describe('useCommandStack', () => {
  it('starts with canUndo=false and canRedo=false', () => {
    const { result } = renderStack();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('add → onObjectsChange fires with appended object; canUndo flips true', () => {
    const { result, onObjectsChange, getObjects, sync } = renderStack();
    const obj = rect();
    act(() => {
      result.current.push({ kind: 'add', object: obj });
    });
    expect(onObjectsChange).toHaveBeenCalledTimes(1);
    expect(getObjects()).toEqual([obj]);
    sync();
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('add → undo → object is gone AND canRedo flips true (the useState vs useRef regression)', () => {
    const { result, getObjects, sync } = renderStack();
    const obj = rect();
    act(() => {
      result.current.push({ kind: 'add', object: obj });
    });
    sync();
    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.undo();
    });
    sync();
    expect(getObjects()).toEqual([]);
    // The critical assertion: with useRef, canUndo/canRedo would stay stuck
    // at their pre-action values until something else triggered a re-render,
    // and the toolbar buttons would lie to the user.
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('add → undo → redo restores the object', () => {
    const { result, getObjects, sync } = renderStack();
    const obj = rect();
    act(() => {
      result.current.push({ kind: 'add', object: obj });
    });
    sync();
    act(() => {
      result.current.undo();
    });
    sync();
    act(() => {
      result.current.redo();
    });
    sync();
    expect(getObjects()).toEqual([obj]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('update → undo restores the before-snapshot exactly', () => {
    const before = rect({ x: 10, y: 10 });
    const after = rect({ x: 50, y: 50 });
    const { result, getObjects, sync } = renderStack([before]);
    act(() => {
      result.current.push({ kind: 'update', before, after });
    });
    sync();
    expect((getObjects()[0] as RectObject).x).toBe(50);
    act(() => {
      result.current.undo();
    });
    sync();
    expect((getObjects()[0] as RectObject).x).toBe(10);
    expect((getObjects()[0] as RectObject).y).toBe(10);
  });

  it('remove → undo restores the object', () => {
    const obj = rect();
    const { result, getObjects, sync } = renderStack([obj]);
    act(() => {
      result.current.push({ kind: 'remove', object: obj });
    });
    sync();
    expect(getObjects()).toEqual([]);
    act(() => {
      result.current.undo();
    });
    sync();
    expect(getObjects()).toEqual([obj]);
  });

  it('clear (bulk) → undo restores every object in one step', () => {
    const a = rect({ id: 'a' });
    const b = rect({ id: 'b' });
    const c = rect({ id: 'c' });
    const { result, getObjects, sync } = renderStack([a, b, c]);
    act(() => {
      result.current.push({ kind: 'clear', objects: [a, b, c] });
    });
    sync();
    expect(getObjects()).toEqual([]);
    act(() => {
      result.current.undo();
    });
    sync();
    // Order preserved because applyCommand for clear-reverse returns the
    // stored snapshot as-is.
    expect(getObjects()).toEqual([a, b, c]);
  });

  it('pushing a new command after undo clears the redo branch', () => {
    const a = rect({ id: 'a' });
    const b = rect({ id: 'b' });
    const { result, sync } = renderStack();
    act(() => {
      result.current.push({ kind: 'add', object: a });
    });
    sync();
    act(() => {
      result.current.undo();
    });
    sync();
    expect(result.current.canRedo).toBe(true);
    // New action invalidates the redo branch — standard semantics.
    act(() => {
      result.current.push({ kind: 'add', object: b });
    });
    sync();
    expect(result.current.canRedo).toBe(false);
    // And the redo no longer replays the originally-undone command.
    act(() => {
      result.current.redo();
    });
    // canRedo stayed false → no re-emit happened.
    sync();
    expect(result.current.canRedo).toBe(false);
  });

  it('undo on empty stack is a no-op', () => {
    const { result, onObjectsChange } = renderStack();
    act(() => {
      result.current.undo();
    });
    expect(onObjectsChange).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it('redo on empty stack is a no-op', () => {
    const { result, onObjectsChange } = renderStack();
    act(() => {
      result.current.redo();
    });
    expect(onObjectsChange).not.toHaveBeenCalled();
    expect(result.current.canRedo).toBe(false);
  });

  it('clear() drops both past and future stacks', () => {
    const a = rect();
    const { result, sync } = renderStack();
    act(() => {
      result.current.push({ kind: 'add', object: a });
    });
    sync();
    act(() => {
      result.current.undo();
    });
    sync();
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.clear();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('multi-step undo unwinds in LIFO order', () => {
    const a = rect({ id: 'a' });
    const b = rect({ id: 'b' });
    const c = rect({ id: 'c' });
    const { result, getObjects, sync } = renderStack();
    act(() => {
      result.current.push({ kind: 'add', object: a });
    });
    sync();
    act(() => {
      result.current.push({ kind: 'add', object: b });
    });
    sync();
    act(() => {
      result.current.push({ kind: 'add', object: c });
    });
    sync();
    expect(getObjects()).toEqual([a, b, c]);
    act(() => {
      result.current.undo();
    });
    sync();
    expect(getObjects()).toEqual([a, b]);
    act(() => {
      result.current.undo();
    });
    sync();
    expect(getObjects()).toEqual([a]);
    act(() => {
      result.current.undo();
    });
    sync();
    expect(getObjects()).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it('per-page: undo on a different page does not touch the originating page', () => {
    // Page 1: draw `a`.
    const a = rect({ id: 'a' });
    const b = rect({ id: 'b' });
    const t = renderStack([], 'page-1');
    act(() => {
      t.result.current.push({ kind: 'add', object: a });
    });
    t.sync();
    expect(t.result.current.canUndo).toBe(true);

    // Switch to page 2 — its stack is empty.
    t.switchPage('page-2', []);
    expect(t.result.current.canUndo).toBe(false);
    expect(t.result.current.canRedo).toBe(false);

    // Draw `b` on page 2, undo it — page 2 is now empty.
    act(() => {
      t.result.current.push({ kind: 'add', object: b });
    });
    t.sync();
    act(() => {
      t.result.current.undo();
    });
    t.sync();
    expect(t.getObjects()).toEqual([]);
    expect(t.result.current.canRedo).toBe(true);

    // Back to page 1 with its original objects intact — its stack still has
    // the `add a` command queued for undo.
    t.switchPage('page-1', [a]);
    expect(t.result.current.canUndo).toBe(true);
    // page-1's redo branch is unaffected by page-2's redo state.
    expect(t.result.current.canRedo).toBe(false);
    act(() => {
      t.result.current.undo();
    });
    t.sync();
    expect(t.getObjects()).toEqual([]);
  });

  it("per-page: forgetPage drops a deleted page's history", () => {
    const a = rect({ id: 'a' });
    const t = renderStack([], 'page-1');
    act(() => {
      t.result.current.push({ kind: 'add', object: a });
    });
    t.sync();
    act(() => {
      t.result.current.forgetPage('page-1');
    });
    // After forget, the active page's stack reads empty.
    t.sync();
    expect(t.result.current.canUndo).toBe(false);
    expect(t.result.current.canRedo).toBe(false);
  });
});
