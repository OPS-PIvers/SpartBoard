import { useSyncExternalStore } from 'react';
import type { ClassRoster } from '@/types';

// The open sub board's classes, so a tour recording on /subs can hide their names.
const EMPTY: ClassRoster[] = [];
let rosters: ClassRoster[] = EMPTY;
const listeners = new Set<() => void>();

export function publishSubsTourRosters(next: ClassRoster[] | null): void {
  const value = next ?? EMPTY;
  if (value === rosters) return;
  rosters = value;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useSubsTourRosters = (): ClassRoster[] =>
  useSyncExternalStore(
    subscribe,
    () => rosters,
    () => EMPTY
  );
