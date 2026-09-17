/**
 * useMinuteClock — a shared once-a-minute clock for relative timestamps
 * ("3m ago"). Reading `Date.now()` during render is impure, so the current
 * time is kept in a module-level store and read through `useSyncExternalStore`.
 * One interval is shared by every subscriber and stops when the last unmounts.
 */
import { useSyncExternalStore } from 'react';

const TICK_MS = 60_000;

let currentMs = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const subscribe = (onStoreChange: () => void): (() => void) => {
  listeners.add(onStoreChange);
  currentMs = Date.now();
  timer ??= setInterval(() => {
    currentMs = Date.now();
    listeners.forEach((listener) => listener());
  }, TICK_MS);
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

const getSnapshot = (): number => currentMs;

export const useMinuteClock = (): number =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
