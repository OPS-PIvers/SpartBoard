// Mark for review state kept in this tab's sessionStorage only, so a reload keeps it and teachers never see it (M24).

export interface ReviewState {
  marked: string[];
  open: boolean;
  returnTo: boolean;
}

const EMPTY: ReviewState = { marked: [], open: false, returnTo: false };

/** One key per session, response and attempt; null until the response is known. */
export function reviewStateKey(
  sessionId: string,
  responseKey: string | undefined,
  attempt: number
): string | null {
  return responseKey
    ? `spartboard:quiz-review:${sessionId}:${responseKey}:${attempt}`
    : null;
}

export function loadReviewState(key: string | null): ReviewState {
  if (!key) return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY;
    const p = parsed as Partial<Record<keyof ReviewState, unknown>>;
    return {
      marked: Array.isArray(p.marked)
        ? p.marked.filter((id): id is string => typeof id === 'string')
        : [],
      open: p.open === true,
      returnTo: p.returnTo === true,
    };
  } catch {
    return EMPTY;
  }
}

export function saveReviewState(key: string, state: ReviewState): void {
  try {
    if (!state.marked.length && !state.open && !state.returnTo)
      window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage blocked */
  }
}

export function clearReviewState(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}

/** Drops every attempt's saved state for one response; runs once it is turned in. */
export function clearAllReviewStates(
  sessionId: string,
  responseKey: string | undefined
): void {
  const prefix = reviewStateKey(sessionId, responseKey, 0)?.replace(/0$/, '');
  if (!prefix) return;
  try {
    const store = window.sessionStorage;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    /* storage blocked */
  }
}
