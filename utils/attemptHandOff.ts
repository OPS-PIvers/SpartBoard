// Set once the student moves this page's attempt to another tab; this copy then stops tracking and covers itself.
let handedOff = false;
const listeners = new Set<() => void>();

export const isHandedOff = (): boolean => handedOff;

export const subscribeHandOff = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

export const markHandedOff = (): void => {
  if (handedOff) return;
  handedOff = true;
  for (const l of listeners) l();
};

/** Test-only reset. */
export const resetHandOffForTests = (): void => {
  handedOff = false;
};

/** True inside any frame; a cross-origin parent throws, which is still a frame. */
export function isFramedWindow(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** The address a new tab opens this attempt at; a Schoology launch code works once, so that route reopens as a quiz link. */
export function popOutUrl(loc: Location = window.location): string {
  if (loc.pathname.startsWith('/lti/student')) {
    const params = new URLSearchParams(loc.search);
    params.delete('lc');
    return `${loc.origin}/quiz?${params.toString()}`;
  }
  return loc.href;
}
