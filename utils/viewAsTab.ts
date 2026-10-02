// Super admin "View as" tab state (docs/plans/ADMIN_VIEW_AS.md D4, D6, D7); dependency-free so it loads first.

import type { StudentPreviewHandoff } from '@/types/viewAs';

export const VIEW_AS_PARAM = 'viewAs';
export const VIEW_AS_READY = 'spart-view-as-ready';
export const VIEW_AS_HANDOFF = 'spart-view-as-handoff';
export const VIEW_AS_ENDED = 'spart-view-as-ended';
export const VIEW_AS_STUDENT = 'student';
export const VIEW_AS_STUDENT_HANDOFF = 'spart-view-as-student-handoff';

/** Fixed for the page's lifetime: in-app navigation can drop the query string. */
export const isViewAsTab: boolean =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has(VIEW_AS_PARAM);

/** A student preview tab (D15), opened from a teacher's View as tab; always read-only. */
export const isStudentPreviewTab: boolean =
  isViewAsTab &&
  new URLSearchParams(window.location.search).get(VIEW_AS_PARAM) ===
    VIEW_AS_STUDENT;

export interface ViewAsHandoff {
  sid: string;
  token: string;
  targetUid: string;
  targetEmail: string;
  adminTarget: boolean;
  expiresAt: number;
  canUnlock?: boolean;
}

export interface ViewAsTabState {
  session: ViewAsHandoff | null;
  /** Set once a student preview tab has signed in as the student. */
  student: StudentPreviewHandoff | null;
  unlocked: boolean;
  ended: boolean;
  /** Bumped on the first blocked write so the banner can show its one notice. */
  blockedNotice: number;
  /** Bumped on each audited direct save so the tab can show its toast (D13). */
  savedNotice: number;
}

let state: ViewAsTabState = {
  session: null,
  student: null,
  unlocked: false,
  ended: false,
  blockedNotice: 0,
  savedNotice: 0,
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

/** D7 client guard for user-initiated saves; true means skip the write. Unlocked saves pass (D13). */
export function viewAsBlocksWrite(): boolean {
  if (!isViewAsTab || (state.unlocked && !state.ended)) return false;
  if (state.blockedNotice === 0) updateViewAsTabState({ blockedNotice: 1 });
  return true;
}

export function getStudentPreview(): StudentPreviewHandoff | null {
  return state.student;
}

/** D15 client guard for the student apps: a preview never joins, answers or posts. */
export function studentPreviewBlocksWrite(): boolean {
  return isStudentPreviewTab || state.student !== null;
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

/** True when a user-initiated save in this tab lands on the target and must be audited. */
export function viewAsAuditsWrite(): boolean {
  return isViewAsTab && state.unlocked && !state.ended;
}

let auditedWriteDepth = 0;
const OUTWARD_WINDOW_MS = 60_000;
let outwardWindows: { collections: readonly string[]; endsAt: number }[] = [];

/** Marks Firestore writes started synchronously inside fn as audited, so the app-wide guard lets them through. */
export function runAuditedWrite<T>(fn: () => T): T {
  auditedWriteDepth += 1;
  try {
    return fn();
  } finally {
    auditedWriteDepth -= 1;
  }
}

/** True while a write started now counts as audited. */
export function viewAsWriteIsAudited(): boolean {
  return auditedWriteDepth > 0;
}

/** A confirmed outward action may write to the named collections for a short window (D14). */
export function openViewAsOutwardWindow(collections: readonly string[]): void {
  if (collections.length === 0) return;
  const now = Date.now();
  outwardWindows = [
    ...outwardWindows.filter((w) => w.endsAt > now),
    { collections, endsAt: now + OUTWARD_WINDOW_MS },
  ];
}

function inOutwardWindow(path: string, now: number): boolean {
  const ids = path.split('/').filter((_, i) => i % 2 === 0);
  return outwardWindows.some(
    (w) => w.endsAt > now && w.collections.some((c) => ids.includes(c))
  );
}

/** App-wide guard on raw Firestore writes: in an unlocked tab only audited saves and in-scope outward writes pass. */
export function viewAsBlocksRawWrite(paths: readonly string[]): boolean {
  if (!isViewAsTab) return false;
  if (!state.unlocked || state.ended) {
    viewAsBlocksWrite();
    return true;
  }
  if (auditedWriteDepth > 0) return false;
  const now = Date.now();
  return paths.length === 0 || !paths.every((p) => inOutwardWindow(p, now));
}
