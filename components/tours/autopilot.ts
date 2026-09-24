import type { GuidedLearningWatchPace } from '@/types';
import {
  stepDurationMs,
  type StepDurationInput,
} from '@/components/widgets/GuidedLearning/utils/motion';

/** Shortest pause before autopilot starts moving on a click step. */
export const AUTO_LEAD_MIN_MS = 800;
/** Time the glide and ripple take out of a click step's reading time. */
const AUTO_GLIDE_BUDGET_MS = 1500;
/** How often autopilot looks for the next step's anchor after clicking. */
export const AUTO_POLL_MS = 100;

/** Reading time for an observe step before autopilot moves on. */
export const autoObserveMs = (
  step: StepDurationInput,
  watchPace?: GuidedLearningWatchPace
): number => stepDurationMs(step, { playerV2: true, watchPace });

/** Reading time on a click step before the cursor starts to glide. */
export const autoLeadMs = (
  step: StepDurationInput,
  watchPace?: GuidedLearningWatchPace
): number =>
  Math.max(
    AUTO_LEAD_MIN_MS,
    autoObserveMs(step, watchPace) - AUTO_GLIDE_BUDGET_MS
  );

const pointer = (
  type: string,
  init: MouseEventInit & { pointerType?: string; isPrimary?: boolean }
): MouseEvent =>
  typeof PointerEvent === 'function'
    ? new PointerEvent(type, init)
    : new MouseEvent(type, init);

/** Clicks an element the way a real mouse does: pointer, mouse, focus and click events in order. */
export function dispatchAutoClick(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const base: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    clientX: r.x + r.width / 2,
    clientY: r.y + r.height / 2,
  };
  const ptr = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(pointer('pointerover', ptr));
  el.dispatchEvent(pointer('pointerdown', { ...ptr, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
  el.focus({ preventScroll: true });
  el.dispatchEvent(pointer('pointerup', ptr));
  el.dispatchEvent(new MouseEvent('mouseup', base));
  el.dispatchEvent(new MouseEvent('click', { ...base, detail: 1 }));
}

/** Resolves true once `check` passes, or false after `timeoutMs` or an abort. */
export function waitFor(
  check: () => boolean,
  timeoutMs: number,
  signal: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (signal.aborted) return resolve(false);
      if (check()) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, AUTO_POLL_MS);
    };
    // Give the app a beat to respond before the first look.
    setTimeout(tick, AUTO_POLL_MS);
  });
}
