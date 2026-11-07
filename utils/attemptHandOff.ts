// Page-level state of this copy of an attempt: working, waiting for the student to pop out to a tab, or moved to another tab.
export type HandOffState = 'active' | 'pop-out-pending' | 'handed-off';

let state: HandOffState = 'active';
const listeners = new Set<() => void>();

const set = (next: HandOffState) => {
  if (state === next) return;
  state = next;
  for (const l of listeners) l();
};

export const getHandOffState = (): HandOffState => state;

/** True when this copy must not track exits or write on its own: it's waiting to pop out or already moved. */
export const isHandedOff = (): boolean => state !== 'active';

export const subscribeHandOff = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

export const markHandedOff = (): void => set('handed-off');

/** The pop-out cover is up: the student is told to leave, so leaving isn't a warning. */
export const markPopOutPending = (): void => {
  if (state === 'active') set('pop-out-pending');
};

/** The pop-out cover went away (requirement lifted) before the attempt moved. */
export const clearPopOutPending = (): void => {
  if (state === 'pop-out-pending') set('active');
};

/** Test-only reset. */
export const resetHandOffForTests = (): void => {
  state = 'active';
};

/** True inside any frame; a cross-origin parent throws, which is still a frame. */
export function isFramedWindow(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

const SCHOOLOGY_HOST = /(^|\.)schoology\.com$/i;

/** True when the frame's parent page is Schoology, whose class page has a pop out button. */
export function isSchoologyFrame(): boolean {
  if (!isFramedWindow()) return false;
  const origins: string[] = [];
  try {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors)
      for (let i = 0; i < ancestors.length; i++)
        origins.push(ancestors[i] ?? '');
  } catch {
    // Not every browser has ancestorOrigins.
  }
  if (document.referrer) origins.push(document.referrer);
  return origins.some((o) => {
    try {
      return SCHOOLOGY_HOST.test(new URL(o).hostname);
    } catch {
      return false;
    }
  });
}
