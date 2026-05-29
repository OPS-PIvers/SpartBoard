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
