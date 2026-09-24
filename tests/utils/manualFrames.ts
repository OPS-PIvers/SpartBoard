import { act } from '@testing-library/react';

/** Replaces requestAnimationFrame with a queue the test advances one frame at a time. */
export function manualFrames() {
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const realRequest = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    queue.delete(id);
  };
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
      window.requestAnimationFrame = realRequest;
      window.cancelAnimationFrame = realCancel;
    },
  };
}
