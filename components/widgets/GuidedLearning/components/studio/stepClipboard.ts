import type { GuidedLearningStep } from '@/types';

export const STEP_CLIPBOARD_KEY = 'spartboard.glStudio.stepClipboard';

let memory: GuidedLearningStep[] | null = null;
// True until a native copy or leaving the window may have put something newer on the system clipboard.
let latest = false;
let watching = false;
const listeners = new Set<() => void>();
const EMPTY: GuidedLearningStep[] = [];

const isStep = (value: unknown): value is GuidedLearningStep => {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.xPct === 'number' &&
    typeof s.yPct === 'number' &&
    typeof s.interactionType === 'string'
  );
};

function loadFromSession(): GuidedLearningStep[] {
  try {
    const raw = window.sessionStorage.getItem(STEP_CLIPBOARD_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every(isStep)
      ? parsed
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

const markStale = () => {
  latest = false;
};

/** Steps on the Studio clipboard, shared by every set open in this browser session. */
export function readStepClipboard(): GuidedLearningStep[] {
  memory ??= loadFromSession();
  return memory;
}

export function writeStepClipboard(steps: GuidedLearningStep[]): void {
  memory = steps.length > 0 ? steps : EMPTY;
  latest = steps.length > 0;
  try {
    window.sessionStorage.setItem(STEP_CLIPBOARD_KEY, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: the in-memory copy still pastes in this tab.
  }
  if (!watching && typeof window !== 'undefined') {
    watching = true;
    window.addEventListener('blur', markStale);
    document.addEventListener('copy', markStale, true);
    document.addEventListener('cut', markStale, true);
  }
  listeners.forEach((fn) => fn());
}

/** Whether a Cmd/Ctrl+V should paste steps rather than let the browser paste (an image, say). */
export function stepClipboardIsLatest(): boolean {
  return latest && readStepClipboard().length > 0;
}

export function subscribeStepClipboard(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test hook: forget the clipboard as a page reload would. */
export function resetStepClipboardForTests(): void {
  memory = null;
  latest = false;
}
