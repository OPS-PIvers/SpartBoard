import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { viewAsDirectSave } from '@/utils/viewAsAudit';

/** One activity's last-used assign rules on the teacher's profile doc (plan D12). */
export interface LastAssignSettingsSpec<T> {
  /** Field on `users/{uid}/userProfile/profile`. */
  field: string;
  /** Keeps only well-typed values; null rejects the stored value. */
  parse: (raw: unknown) => T | null;
  /** Prefix for logError tags. */
  logTag: string;
}

export interface LastAssignSettings<T> {
  /** null until read, or when the teacher has never assigned this activity. */
  lastUsed: T | null;
  loaded: boolean;
  save: (settings: T) => void;
}

const profileRef = (uid: string) =>
  doc(db, 'users', uid, 'userProfile', 'profile');

type Listener = (uid: string, settings: unknown) => void;

interface SpecState {
  cache: Map<string, Promise<unknown>>;
  listeners: Set<Listener>;
}

// One profile read per teacher per field per page load, shared by every assign surface.
const states = new Map<string, SpecState>();

function stateFor(field: string): SpecState {
  let state = states.get(field);
  if (!state) {
    state = { cache: new Map(), listeners: new Set() };
    states.set(field, state);
  }
  return state;
}

function readLastUsed<T>(
  spec: LastAssignSettingsSpec<T>,
  uid: string
): Promise<T | null> {
  const { cache } = stateFor(spec.field);
  let pending = cache.get(uid) as Promise<T | null> | undefined;
  if (!pending) {
    pending = Promise.resolve()
      .then(() => getDoc(profileRef(uid)))
      .then((snap) => spec.parse(snap.exists() ? snap.get(spec.field) : null))
      .catch((err: unknown) => {
        cache.delete(uid);
        logError(`${spec.logTag}.read`, err);
        return null;
      });
    cache.set(uid, pending);
  }
  return pending;
}

/** Test hook: forget cached reads between cases; omit `field` to clear every activity. */
export function resetLastAssignSettingsCache(field?: string): void {
  if (field === undefined) states.forEach((state) => state.cache.clear());
  else states.get(field)?.cache.clear();
}

/** Reads and writes the teacher's last-used assign rules for one activity; inert when `enabled` is false. */
export function useLastAssignSettings<T>(
  spec: LastAssignSettingsSpec<T>,
  uid: string | null | undefined,
  enabled: boolean
): LastAssignSettings<T> {
  const active = enabled && !!uid && !isAuthBypass;
  const [state, setState] = useState<{
    uid: string | null;
    lastUsed: T | null;
  } | null>(null);

  useEffect(() => {
    if (!active || !uid) return;
    let cancelled = false;
    void readLastUsed(spec, uid).then((lastUsed) => {
      // A save that landed while the read was in flight wins.
      if (!cancelled)
        setState((prev) => (prev?.uid === uid ? prev : { uid, lastUsed }));
    });
    const { listeners } = stateFor(spec.field);
    const onSaved: Listener = (savedUid, lastUsed) => {
      if (savedUid === uid) setState({ uid, lastUsed: lastUsed as T });
    };
    listeners.add(onSaved);
    return () => {
      cancelled = true;
      listeners.delete(onSaved);
    };
  }, [active, uid, spec]);

  const save = useCallback(
    (settings: T) => {
      if (!active || !uid) return;
      const next = spec.parse(settings);
      if (next === null) return;
      const { cache, listeners } = stateFor(spec.field);
      cache.set(uid, Promise.resolve(next));
      listeners.forEach((listener) => listener(uid, next));
      viewAsDirectSave(profileRef(uid), [spec.field], () =>
        setDoc(
          profileRef(uid),
          { [spec.field]: next },
          { mergeFields: [spec.field] }
        )
      ).catch((err: unknown) => logError(`${spec.logTag}.save`, err));
    },
    [active, uid, spec]
  );

  const current = active && state?.uid === uid ? state : null;
  return {
    lastUsed: current?.lastUsed ?? null,
    loaded: !active || current !== null,
    save,
  };
}
