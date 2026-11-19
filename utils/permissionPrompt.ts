// A browser permission prompt the app itself just asked for: its focus loss is not the student leaving.

/** Total time per page load that prompts can hold focus; past it a focus loss counts, back-dated to when it began. */
export const PERMISSION_PROMPT_MAX_MS = 15_000;
/** How long the window stays open after the request settles, so the prompt's own focus return lands first. */
export const PERMISSION_PROMPT_TAIL_MS = 500;

interface Prompt {
  id: number;
  openedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

let current: Prompt | null = null;
let counter = 0;
// Grace already spent on this page, so repeated requests can't add up to more than the cap.
let spentMs = 0;
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of listeners) l();
};

const onWindowFocus = () => close();

function close(id?: number): void {
  if (!current || (id !== undefined && current.id !== id)) return;
  clearTimeout(current.timer);
  spentMs += Date.now() - current.openedAt;
  current = null;
  window.removeEventListener('focus', onWindowFocus);
  notify();
}

/** True while an app-started permission prompt may be holding focus. */
export const isPermissionPromptOpen = (): boolean => current !== null;

export const subscribePermissionPrompt = (
  onChange: () => void
): (() => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

/** Opens the window from the student's click; it closes on focus return, the cap, or the returned call. */
export function beginPermissionPrompt(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return () => undefined;
  // A request made while focus is already away can't be the reason it left.
  if (!document.hasFocus() || document.visibilityState === 'hidden')
    return () => undefined;
  // A request while a window is open joins it without extending it.
  if (current) return () => undefined;
  const budget = PERMISSION_PROMPT_MAX_MS - spentMs;
  if (budget <= 0) return () => undefined;
  const id = ++counter;
  current = {
    id,
    openedAt: Date.now(),
    timer: setTimeout(() => close(id), budget),
  };
  window.addEventListener('focus', onWindowFocus);
  notify();
  let settled = false;
  return () => {
    if (settled) return;
    settled = true;
    if (current?.id !== id) return;
    clearTimeout(current.timer);
    const left =
      PERMISSION_PROMPT_MAX_MS - spentMs - (Date.now() - current.openedAt);
    current.timer = setTimeout(
      () => close(id),
      Math.max(0, Math.min(PERMISSION_PROMPT_TAIL_MS, left))
    );
  };
}

/** Opens the window for a mic request, and settles it at once when the browser already has an answer. */
export function beginMicPermissionPrompt(): () => void {
  const end = beginPermissionPrompt();
  try {
    navigator.permissions
      ?.query({ name: 'microphone' })
      .then((status) => {
        if (status.state !== 'prompt') end();
      })
      .catch(() => undefined);
  } catch {
    // No Permissions API: the focus return or the cap closes the window.
  }
  return end;
}

/** Runs a mic request inside the window. */
export async function withMicPermissionPrompt<T>(
  request: () => Promise<T>
): Promise<T> {
  const end = beginMicPermissionPrompt();
  try {
    return await request();
  } finally {
    end();
  }
}

/** Test-only reset. */
export function resetPermissionPromptForTests(): void {
  if (current) clearTimeout(current.timer);
  current = null;
  counter = 0;
  spentMs = 0;
  if (typeof window !== 'undefined')
    window.removeEventListener('focus', onWindowFocus);
}
