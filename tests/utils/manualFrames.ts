import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Replaces requestAnimationFrame with a queue the test advances one frame at a time. */
export function manualFrames() {
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const requestSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    });
  const cancelSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((id: number) => {
      queue.delete(id);
    });
  return {
    /** Frames requested and not yet run or cancelled. */
    pending: () => queue.size,
    /** Runs every callback queued before this frame, as the browser does. */
    step() {
      const due = queue;
      queue = new Map();
      act(() => {
        for (const cb of due.values()) cb(performance.now());
      });
    },
    restore() {
      requestSpy.mockRestore();
      cancelSpy.mockRestore();
    },
  };
}
