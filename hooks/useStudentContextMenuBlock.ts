/** Shared live view of `admin_settings/student_context_menu`; one listener per page, re-attached on each sign-in. */

import { useSyncExternalStore } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import {
  STUDENT_CONTEXT_MENU_SETTINGS_DOC,
  normalizeStudentContextMenuSettings,
} from '@/config/studentContextMenu';

export interface StudentContextMenuBlockState {
  enabled: boolean;
  /** False until the doc (or its read error) has answered for a signed-in user. */
  loaded: boolean;
}

const INITIAL: StudentContextMenuBlockState = { enabled: false, loaded: false };

let state = INITIAL;
let started = false;
const listeners = new Set<() => void>();

function setState(next: StudentContextMenuBlockState): void {
  if (next.enabled === state.enabled && next.loaded === state.loaded) return;
  state = next;
  listeners.forEach((l) => l());
}

function start(): void {
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
      doc(db, 'admin_settings', STUDENT_CONTEXT_MENU_SETTINGS_DOC),
      (snap) =>
        setState({
          enabled: normalizeStudentContextMenuSettings(
            snap.exists() ? snap.data() : null
          ).enabled,
          loaded: true,
        }),
      // An unreadable doc leaves the menu alone.
      () => setState({ enabled: false, loaded: true })
    );
  });
}

function observe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function subscribe(onChange: () => void): () => void {
  start();
  return observe(onChange);
}

const getSnapshot = (): StudentContextMenuBlockState => state;

/** Starts the listener; mounted once by the root student guard. */
export function useStudentContextMenuBlock(): StudentContextMenuBlockState {
  return useSyncExternalStore(subscribe, getSnapshot, () => INITIAL);
}

/** Reads the guard's listener without starting one, so pages outside the guard stay off. */
export function useObservedStudentContextMenuBlock(): StudentContextMenuBlockState {
  return useSyncExternalStore(observe, getSnapshot, () => INITIAL);
}
