const STORAGE_KEY = 'spart.assignedLeftOpen.v1';
const MAX_KEYS = 300;

/** One flag's identity: a new opening of the class flags again. */
export const leftOpenKey = (itemId: string, classKey: string, since: number) =>
  `${itemId}|${classKey}|${since}`;

export function readLeftOpenDismissals(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeLeftOpenDismissals(keys: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-MAX_KEYS)));
  } catch {
    // Private windows or blocked storage: the flag just comes back next time.
  }
}
