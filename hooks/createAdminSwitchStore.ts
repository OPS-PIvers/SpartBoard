/** Shared live view of one on/off `admin_settings/*` doc; one listener per page, re-attached on each sign-in. */

import { useSyncExternalStore } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';

export interface AdminSwitchState {
  enabled: boolean;
  /** False until the doc (or its read error) has answered for a signed-in user. */
  loaded: boolean;
}

const INITIAL: AdminSwitchState = { enabled: false, loaded: false };

export interface AdminSwitchStore {
  /** Starts the listener; mounted once by the root student guard. */
  useWatched: () => AdminSwitchState;
  /** Reads the listener without starting one, so pages outside the guard stay off. */
  useObserved: () => AdminSwitchState;
  /** True once the listener has started on this page. */
  isWatched: () => boolean;
}

export function createAdminSwitchStore(
  docId: string,
  isEnabled: (raw: unknown) => boolean
): AdminSwitchStore {
  let state = INITIAL;
  let started = false;
  const listeners = new Set<() => void>();

  const setState = (next: AdminSwitchState): void => {
    if (next.enabled === state.enabled && next.loaded === state.loaded) return;
    state = next;
    listeners.forEach((l) => l());
  };

  const start = (): void => {
    if (started) return;
    started = true;
    let unsubDoc: Unsubscribe | null = null;
    onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = null;
      if (!user) {
        setState(INITIAL);
        return;
      }
      unsubDoc = onSnapshot(
        doc(db, 'admin_settings', docId),
        (snap) =>
          setState({
            enabled: isEnabled(snap.exists() ? snap.data() : null),
            loaded: true,
          }),
        // An unreadable doc leaves the switch off.
        () => setState({ enabled: false, loaded: true })
      );
    });
  };

  const observe = (onChange: () => void): (() => void) => {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  };
  const subscribe = (onChange: () => void): (() => void) => {
    start();
    return observe(onChange);
  };
  const getSnapshot = (): AdminSwitchState => state;
  const getServerSnapshot = (): AdminSwitchState => INITIAL;

  return {
    useWatched: () =>
      useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
    useObserved: () =>
      useSyncExternalStore(observe, getSnapshot, getServerSnapshot),
    isWatched: () => started,
  };
}
