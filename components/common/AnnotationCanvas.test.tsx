import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { AnnotationCanvas } from './AnnotationCanvas';

describe('AnnotationCanvas', () => {
  const defaultProps = {
    paths: [],
    color: '#000000',
    width: 5,
    canvasWidth: 800,
    canvasHeight: 600,
    onPathsChange: vi.fn(),
  };

  it('stops propagation on pointerdown always', () => {
    const { container } = render(<AnnotationCanvas {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

    fireEvent(canvas, event);

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('stops propagation on pointermove when drawing', () => {
    const { container } = render(<AnnotationCanvas {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Start drawing
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );

    const moveEvent = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(moveEvent, 'stopPropagation');

    fireEvent(canvas, moveEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('does NOT stop propagation on pointermove when NOT drawing', () => {
    const { container } = render(<AnnotationCanvas {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    const moveEvent = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(moveEvent, 'stopPropagation');

    fireEvent(canvas, moveEvent);

    expect(stopPropagationSpy).not.toHaveBeenCalled();
  });

  it('stops propagation on pointerup when drawing', () => {
    const { container } = render(<AnnotationCanvas {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Start drawing
    fireEvent(
      canvas,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );

    const upEvent = new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(upEvent, 'stopPropagation');

    fireEvent(canvas, upEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('does NOT stop propagation on pointerup when NOT drawing', () => {
    const { container } = render(<AnnotationCanvas {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    const upEvent = new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(upEvent, 'stopPropagation');

    fireEvent(canvas, upEvent);

    expect(stopPropagationSpy).not.toHaveBeenCalled();
  });

  /**
   * Regression: pointerup must NOT commit a stroke twice when the window-level
   * fallback listener fires concurrently with the canvas's own onPointerUp handler.
   *
   * Root cause: AnnotationCanvas registers a window-level 'pointerup' listener as a
   * safety net for environments where setPointerCapture fails. However, when a
   * pointerup event fires on the canvas, BOTH the canvas's React synthetic onPointerUp
   * (handleEnd) AND the window listener (commit) receive that event: handleEnd fires via
   * React's root-delegation, then commit fires as the event bubbles to window. Both read
   * isDrawing=true from their respective stale closures (React's setState is async and
   * not visible synchronously within the same event dispatch cycle), so both call
   * onPathsChange — doubling the path in the stored annotation.
   *
   * Fix: the window listener's commit function must guard against double-commit by
   * checking a synchronously-set committedRef that handleEnd marks true before calling
   * onPathsChange, so commit is a no-op when handleEnd already ran.
   */
  it('does NOT call onPathsChange twice when both the canvas handler and window listener fire (no double-commit)', () => {
    const onPathsChange = vi.fn();
    const { container } = render(
      <AnnotationCanvas {...defaultProps} onPathsChange={onPathsChange} />
    );
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Start drawing (act flushes the state update and registers the window listener)
    act(() => {
      fireEvent.pointerDown(canvas, {
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        bubbles: true,
      });
    });

    // Move the pointer to add a point (so currentPath.length > 0 is guaranteed)
    act(() => {
      fireEvent.pointerMove(canvas, {
        pointerId: 1,
        clientX: 20,
        clientY: 20,
        bubbles: true,
      });
    });

    // Simulate the real-browser double-fire scenario:
    // The window listener is still registered (effect cleanup hasn't run yet) when the
    // canvas's handleEnd fires during the React synthetic event dispatch. Dispatch a
    // native window 'pointerup' first (representing the event bubbling to window before
    // React's effect cleanup can remove the listener), then fire the canvas's own
    // pointerup via React. Without the fix, onPathsChange is called twice.
    //
    // The window.dispatchEvent call below is intentionally outside act() — we need to
    // fire it while React's effect cleanup has NOT run yet (the cleanup removes the
    // window listener). Wrapping in act() would flush effects synchronously, removing the
    // listener before the dispatch, which would not reproduce the real-browser scenario.

    const suppressActWarning = vi
      .spyOn(console, 'error')
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    window.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })
    );
    suppressActWarning.mockRestore();
    act(() => {
      fireEvent.pointerUp(canvas, { pointerId: 1, bubbles: true });
    });

    // The path must be committed exactly once — not zero times (stroke lost) and not
    // twice (duplicate annotation entry).
    expect(onPathsChange).toHaveBeenCalledTimes(1);
  });

  /**
   * Regression: pointerleave must NOT commit/abort a stroke mid-flight.
   *
   * Root cause: AnnotationCanvas attached `handleEnd` to `onPointerLeave`.
   * Since `setPointerCapture` does not suppress `pointerleave` events (per
   * the Pointer Events spec), a stroke is prematurely committed the instant
   * the pointer exits the canvas bounds — even if the user hasn't released
   * the button. This truncates fast strokes near canvas edges and causes
   * `onPathsChange` to be called before the user intends to end the stroke.
   *
   * Fix: remove `onPointerLeave` from the canvas element entirely.
   * `pointerup` and `pointercancel` (both registered) are sufficient because
   * pointer capture guarantees those events reach the canvas regardless of
   * where the pointer physically is.
   */
  it('does NOT commit an in-progress stroke when pointer leaves the canvas', () => {
    const onPathsChange = vi.fn();
    const { container } = render(
      <AnnotationCanvas {...defaultProps} onPathsChange={onPathsChange} />
    );
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Canvas not found');

    // Start a stroke and let React flush the state update
    act(() => {
      fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    });

    // Add a point mid-stroke (isDrawing is now true)
    act(() => {
      fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
    });

    // Simulate the pointer briefly leaving the canvas boundary without releasing.
    // With `onPointerLeave={handleEnd}` present (the bug), this fires handleEnd
    // while isDrawing=true, which calls onPathsChange prematurely.
    act(() => {
      fireEvent.pointerLeave(canvas);
    });

    // The stroke must NOT have been committed yet — onPathsChange should not
    // have been called because the user has not released the pointer.
    expect(onPathsChange).not.toHaveBeenCalled();
  });
});
