// Super admin "View as" tab state (docs/plans/ADMIN_VIEW_AS.md D4, D6, D7); dependency-free so it loads first.

export const VIEW_AS_PARAM = 'viewAs';
export const VIEW_AS_READY = 'spart-view-as-ready';
export const VIEW_AS_HANDOFF = 'spart-view-as-handoff';
export const VIEW_AS_ENDED = 'spart-view-as-ended';

/** Fixed for the page's lifetime: in-app navigation can drop the query string. */
export const isViewAsTab: boolean =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has(VIEW_AS_PARAM);

export interface ViewAsHandoff {
  sid: string;
  token: string;
  targetUid: string;
  targetEmail: string;
  adminTarget: boolean;
  expiresAt: number;
}

export interface ViewAsTabState {
  session: ViewAsHandoff | null;
  unlocked: boolean;
  ended: boolean;
  /** Bumped on the first blocked write so the banner can show its one notice. */
  blockedNotice: number;
}

let state: ViewAsTabState = {
  session: null,
  unlocked: false,
  ended: false,
  blockedNotice: 0,
};
const listeners = new Set<() => void>();

export function getViewAsTabState(): ViewAsTabState {
  return state;
}

export function subscribeViewAsTab(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateViewAsTabState(patch: Partial<ViewAsTabState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** D6: boot and background writes never run in a view-as tab, even unlocked. */
export function viewAsSuppressesBackgroundWrites(): boolean {
  return isViewAsTab;
}

/** D7 client guard for user-initiated saves; true means skip the write. */
export function viewAsBlocksWrite(): boolean {
  if (!isViewAsTab) return false;
  if (state.blockedNotice === 0) updateViewAsTabState({ blockedNotice: 1 });
  return true;
}

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

/** Gives the tab its own empty storage so it never reads or clears the admin's tokens and settings. */
export function isolateViewAsStorage(target: Window = window): boolean {
  try {
    for (const name of ['localStorage', 'sessionStorage'] as const) {
      Object.defineProperty(target, name, {
        value: new MemoryStorage(),
        configurable: true,
        enumerable: true,
      });
    }
    return (
      target.localStorage instanceof MemoryStorage &&
      target.sessionStorage instanceof MemoryStorage
    );
  } catch {
    return false;
  }
}

export const viewAsStorageIsolated: boolean = isViewAsTab
  ? isolateViewAsStorage()
  : false;

export class ViewAsReadOnlyError extends Error {
  constructor() {
    super('View-only');
    this.name = 'ViewAsReadOnlyError';
  }
}

/** Throwing form of the D7 guard, for writes whose callers expect a result. */
export function assertViewAsCanWrite(): void {
  if (viewAsBlocksWrite()) throw new ViewAsReadOnlyError();
}
