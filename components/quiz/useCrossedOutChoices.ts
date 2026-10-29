import { useState } from 'react';

// Per-device record of options a student crossed out; display only, never sent to the server.
type CrossedOutMap = Record<string, string[]>;

const readMap = (storageKey: string | null): CrossedOutMap => {
  if (!storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const out: CrossedOutMap = {};
    for (const [qid, list] of Object.entries(parsed)) {
      if (Array.isArray(list))
        out[qid] = list.filter((v): v is string => typeof v === 'string');
    }
    return out;
  } catch {
    return {};
  }
};

const writeMap = (storageKey: string | null, map: CrossedOutMap) => {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // Storage blocked (privacy mode): cross-outs last until the page reloads.
  }
};

export const crossOutStorageKey = (
  sessionId: string,
  studentUid: string | undefined,
  attempt: number
): string => `sb_quiz_crossout:${sessionId}:${studentUid ?? 'anon'}:${attempt}`;

export interface CrossedOutChoices {
  isCrossedOut: (questionId: string, choice: string) => boolean;
  toggle: (questionId: string, choice: string) => void;
  restore: (questionId: string, choice: string) => void;
}

/** A null key keeps cross-outs in memory only. */
export function useCrossedOutChoices(
  storageKey: string | null
): CrossedOutChoices {
  const [state, setState] = useState(() => ({
    key: storageKey,
    map: readMap(storageKey),
  }));
  // A new attempt or session gets its own key; reload from storage while rendering.
  let current = state;
  if (state.key !== storageKey) {
    current = { key: storageKey, map: readMap(storageKey) };
    setState(current);
  }
  const { map } = current;

  const update = (questionId: string, choice: string, cross: boolean) => {
    const list = map[questionId] ?? [];
    if (list.includes(choice) === cross) return;
    const nextList = cross
      ? [...list, choice]
      : list.filter((c) => c !== choice);
    const next = { ...map };
    if (nextList.length > 0) next[questionId] = nextList;
    else delete next[questionId];
    writeMap(storageKey, next);
    setState({ key: storageKey, map: next });
  };

  return {
    isCrossedOut: (questionId, choice) =>
      map[questionId]?.includes(choice) === true,
    toggle: (questionId, choice) =>
      update(questionId, choice, map[questionId]?.includes(choice) !== true),
    restore: (questionId, choice) => update(questionId, choice, false),
  };
}
