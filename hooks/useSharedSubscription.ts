import { useCallback, useSyncExternalStore } from 'react';

export type SharedUpdate<T> = (update: (prev: T) => T) => void;

/** A module-level listener definition; one live subscription per (id, param) however many hooks read it. */
export interface SharedSource<T> {
  id: string;
  /** Returned while nothing has been received; must be a stable reference. */
  initial: T;
  /** Opens the underlying listeners and returns their cleanup. */
  start: (param: string, update: SharedUpdate<T>) => () => void;
}

interface Entry {
  value: unknown;
  listeners: Set<() => void>;
  stop: (() => void) | null;
}

const entries = new Map<string, Entry>();

const keyOf = (source: SharedSource<unknown>, param: string) =>
  `${source.id}\u0000${param}`;

function acquire<T>(
  source: SharedSource<T>,
  param: string,
  listener: () => void
): () => void {
  const key = keyOf(source as SharedSource<unknown>, param);
  const current: Entry = entries.get(key) ?? {
    value: source.initial,
    listeners: new Set<() => void>(),
    stop: null,
  };
  entries.set(key, current);
  current.listeners.add(listener);
  current.stop ??= source.start(param, (update) => {
    if (entries.get(key) !== current) return;
    current.value = update(current.value as T);
    current.listeners.forEach((l) => l());
  });
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    entries.delete(key);
    current.stop?.();
  };
}

/** Latest value of a live shared subscription, or undefined when nobody is listening. */
export function readShared<T>(
  source: SharedSource<T>,
  param: string
): T | undefined {
  return entries.get(keyOf(source as SharedSource<unknown>, param))?.value as
    | T
    | undefined;
}

/** Pushes an update into a live shared subscription; no-op when nobody is listening. */
export function updateShared<T>(
  source: SharedSource<T>,
  param: string,
  update: (prev: T) => T
): void {
  const entry = entries.get(keyOf(source as SharedSource<unknown>, param));
  if (!entry) return;
  entry.value = update(entry.value as T);
  entry.listeners.forEach((l) => l());
}

/** Reads a shared subscription; `param: null` disables it and returns `source.initial`. */
export function useSharedSubscription<T>(
  source: SharedSource<T>,
  param: string | null
): T {
  const subscribe = useCallback(
    (listener: () => void) =>
      param === null ? () => undefined : acquire(source, param, listener),
    [source, param]
  );
  const getSnapshot = useCallback((): T => {
    if (param === null) return source.initial;
    const entry = entries.get(keyOf(source as SharedSource<unknown>, param));
    return entry ? (entry.value as T) : source.initial;
  }, [source, param]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
