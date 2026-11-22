// Agenda setup's busy and error state, kept per first class so it survives the remount when a class gets its first Course.
import { useCallback, useSyncExternalStore } from 'react';

export interface AgendaStatus {
  busy: boolean;
  error: string | null;
  open: boolean;
  /** The Course `updatedAt` a save started from; controls stay busy until the saved Course arrives. */
  savedFrom: number | null;
  /** A save created this class's Course, which has not arrived yet. */
  creating: boolean;
}

const IDLE: AgendaStatus = {
  busy: false,
  error: null,
  open: false,
  savedFrom: null,
  creating: false,
};
const statuses = new Map<string, AgendaStatus>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchAgendaStatus(key: string, patch: Partial<AgendaStatus>) {
  statuses.set(key, { ...(statuses.get(key) ?? IDLE), ...patch });
  listeners.forEach((l) => l());
}

export function useAgendaStatus(
  key: string
): [AgendaStatus, (patch: Partial<AgendaStatus>) => void] {
  const status = useSyncExternalStore(
    subscribe,
    () => statuses.get(key) ?? IDLE
  );
  const patch = useCallback(
    (p: Partial<AgendaStatus>) => patchAgendaStatus(key, p),
    [key]
  );
  return [status, patch];
}

/** Tests start each case idle. */
export function clearAgendaStatuses() {
  statuses.clear();
}
