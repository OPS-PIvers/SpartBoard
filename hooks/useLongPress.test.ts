import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useLongPress } from './useLongPress';

const fakePointerEvent = (x = 0, y = 0) =>
  ({ clientX: x, clientY: y }) as unknown as React.PointerEvent;

describe('useLongPress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onLongPress after the hold delay while still mounted', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(600);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending timer when the pointer moves past the threshold', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent(0, 0));
    result.current.onPointerMove(fakePointerEvent(50, 50));
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels the pending timer on pointer up', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent());
    result.current.onPointerUp();
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire onLongPress after the owning component unmounts mid-press', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent());
    unmount();
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not leak the first timer when a second pointer goes down before release', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(300);
    result.current.onPointerDown(fakePointerEvent());
    result.current.onPointerUp();
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('swallows the click from releasing a fired long press, then lets the next click through', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const button = document.createElement('button');
    button.addEventListener('click', onClick);
    document.body.appendChild(button);
    const { result } = renderHook(() => useLongPress(vi.fn()));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new Event('pointerup'));
    button.click();
    expect(onClick).not.toHaveBeenCalled();

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('swallows the touch compat mousedown so the held press cannot start a drag', () => {
    vi.useFakeTimers();
    const onMouseDown = vi.fn();
    const button = document.createElement('button');
    button.addEventListener('mousedown', onMouseDown);
    document.body.appendChild(button);
    const { result } = renderHook(() => useLongPress(vi.fn()));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new Event('pointerup'));
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onMouseDown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    button.remove();
  });

  it('stops swallowing clicks shortly after release when no click arrives', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const button = document.createElement('button');
    button.addEventListener('click', onClick);
    document.body.appendChild(button);
    const { result } = renderHook(() => useLongPress(vi.fn()));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(500);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('leaves a short tap click alone', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const button = document.createElement('button');
    button.addEventListener('click', onClick);
    document.body.appendChild(button);
    const { result } = renderHook(() => useLongPress(vi.fn()));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(200);
    result.current.onPointerUp();
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('stops swallowing clicks on the next key press when the release never reached the page', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const button = document.createElement('button');
    button.addEventListener('click', onClick);
    document.body.appendChild(button);
    const { result } = renderHook(() => useLongPress(vi.fn()));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    button.remove();
  });
});
