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

/** Where a new tab can reopen this attempt as the same student, or null where only the host site's own pop out keeps the sign-in (Schoology, Classroom). */
export function popOutUrl(loc: Location = window.location): string | null {
  if (
    loc.pathname.startsWith('/lti/') ||
    loc.pathname.startsWith('/classroom-addon/')
  )
    return null;
  return loc.href;
}

/** Opens the attempt in a new tab and hands off; false when the browser or frame blocked the tab. */
export function popOut(url: string): boolean {
  const win = window.open(url, '_blank');
  if (!win) return false;
  win.opener = null;
  markHandedOff();
  return true;
}
