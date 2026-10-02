import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type { QuizBehaviorSettings, QuizSessionOptions } from '@/types';
import { logError } from '@/utils/logError';
import { viewAsDirectSave } from '@/utils/viewAsAudit';

/** Profile field holding this teacher's last-used Quiz assign settings (plan D11). */
export const LAST_QUIZ_ASSIGN_SETTINGS_FIELD = 'lastQuizAssignSettings';

const profileRef = (uid: string) =>
  doc(db, 'users', uid, 'userProfile', 'profile');

/** Keeps only well-typed option values so a malformed profile can't reach an assignment. */
export function parseLastQuizAssignSettings(
  raw: unknown
): QuizBehaviorSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const opts = r.sessionOptions;
  if (!opts || typeof opts !== 'object') return null;
  const attemptLimit = r.attemptLimit;
  if (
    attemptLimit !== null &&
    !(
      typeof attemptLimit === 'number' &&
      Number.isInteger(attemptLimit) &&
      attemptLimit > 0
    )
  ) {
    return null;
  }
  const sessionOptions: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(opts as Record<string, unknown>)) {
    if (
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (key === 'tabWarningThreshold' && value === 'off')
    ) {
      sessionOptions[key] = value;
    }
  }
  return {
    sessionMode: 'student',
    sessionOptions: sessionOptions as QuizSessionOptions,
    attemptLimit,
  };
}

// One profile read per teacher per page load, shared by every assign surface.
const cache = new Map<string, Promise<QuizBehaviorSettings | null>>();

function readLastUsed(uid: string): Promise<QuizBehaviorSettings | null> {
  let pending = cache.get(uid);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => getDoc(profileRef(uid)))
      .then((snap) =>
        parseLastQuizAssignSettings(
          snap.exists() ? snap.get(LAST_QUIZ_ASSIGN_SETTINGS_FIELD) : null
        )
      )
      .catch((err: unknown) => {
        cache.delete(uid);
        logError('useLastQuizAssignSettings.read', err);
        return null;
      });
    cache.set(uid, pending);
  }
  return pending;
}

type Listener = (uid: string, settings: QuizBehaviorSettings) => void;
const listeners = new Set<Listener>();

/** Test hook: forget cached reads between cases. */
export function resetLastQuizAssignSettingsCache(): void {
  cache.clear();
}

export interface LastQuizAssignSettings {
  /** null until read, or when the teacher has never assigned with the split on. */
  lastUsed: QuizBehaviorSettings | null;
  loaded: boolean;
  save: (settings: QuizBehaviorSettings) => void;
}

/** Reads and writes the teacher's last-used Quiz assign settings; inert when `enabled` is false. */
export function useLastQuizAssignSettings(
  uid: string | null | undefined,
  enabled: boolean
): LastQuizAssignSettings {
  const active = enabled && !!uid && !isAuthBypass;
  const [state, setState] = useState<{
    uid: string | null;
    lastUsed: QuizBehaviorSettings | null;
  } | null>(null);

  useEffect(() => {
    if (!active || !uid) return;
    let cancelled = false;
    void readLastUsed(uid).then((lastUsed) => {
      // A save that landed while the read was in flight wins.
      if (!cancelled)
        setState((prev) => (prev?.uid === uid ? prev : { uid, lastUsed }));
    });
    const onSaved: Listener = (savedUid, lastUsed) => {
      if (savedUid === uid) setState({ uid, lastUsed });
    };
    listeners.add(onSaved);
    return () => {
      cancelled = true;
      listeners.delete(onSaved);
    };
  }, [active, uid]);

  const save = useCallback(
    (settings: QuizBehaviorSettings) => {
      if (!active || !uid) return;
      const next = parseLastQuizAssignSettings(settings);
      if (!next) return;
      cache.set(uid, Promise.resolve(next));
      listeners.forEach((listener) => listener(uid, next));
      viewAsDirectSave(profileRef(uid), [LAST_QUIZ_ASSIGN_SETTINGS_FIELD], () =>
        setDoc(
          profileRef(uid),
          { [LAST_QUIZ_ASSIGN_SETTINGS_FIELD]: next },
          { mergeFields: [LAST_QUIZ_ASSIGN_SETTINGS_FIELD] }
        )
      ).catch((err: unknown) =>
        logError('useLastQuizAssignSettings.save', err)
      );
    },
    [active, uid]
  );

  const current = active && state?.uid === uid ? state : null;
  return {
    lastUsed: current?.lastUsed ?? null,
    loaded: !active || current !== null,
    save,
  };
}
