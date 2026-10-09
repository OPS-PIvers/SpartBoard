import { useCallback, useState, useSyncExternalStore } from 'react';
import type { WidgetType } from '@/types';
import { useChangelog, type ChangelogEntry } from '@/hooks/useChangelog';

const DISMISSED_KEY = 'widget-whats-new-dismissed';
const DISMISSED_EVENT = 'widget-whats-new-dismissed';
const NOTE_LIFETIME_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WidgetWhatsNewNote {
  id: string;
  text: string;
  tourSetId?: string;
}

const readDismissed = (): string => {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? '[]';
  } catch {
    return '[]';
  }
};

const parseDismissed = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
};

const subscribe = (onChange: () => void): (() => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === DISMISSED_KEY) onChange();
  };
  window.addEventListener(DISMISSED_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DISMISSED_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
};

export const dismissWidgetWhatsNew = (id: string): void => {
  const next = [...new Set([...parseDismissed(readDismissed()), id])];
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the note stays dismissed only until the next reload.
  }
  window.dispatchEvent(new Event(DISMISSED_EVENT));
};

/** The newest undismissed note for a widget type from the last 30 days of changelog entries. */
export const pickWidgetNote = (
  entries: readonly ChangelogEntry[],
  widgetType: WidgetType,
  dismissed: readonly string[],
  now: number
): WidgetWhatsNewNote | null => {
  for (const entry of entries) {
    const age = now - new Date(`${entry.date}T00:00:00`).getTime();
    if (!(age >= 0 && age <= NOTE_LIFETIME_DAYS * DAY_MS)) continue;
    const note = entry.widgetNotes?.find((n) => n.widget === widgetType);
    if (!note?.text) continue;
    const id = `${entry.version}:${widgetType}`;
    if (dismissed.includes(id)) continue;
    return { id, text: note.text, tourSetId: entry.tourSetId };
  }
  return null;
};

/** This widget type's current what's-new note, and a dismiss that hides it on every board. */
export const useWidgetWhatsNew = (widgetType: WidgetType) => {
  const { entries } = useChangelog();
  const [now] = useState(() => Date.now());
  const dismissedRaw = useSyncExternalStore(
    subscribe,
    readDismissed,
    () => '[]'
  );
  const note = pickWidgetNote(
    entries,
    widgetType,
    parseDismissed(dismissedRaw),
    now
  );
  const noteId = note?.id;
  const dismiss = useCallback(() => {
    if (noteId) dismissWidgetWhatsNew(noteId);
  }, [noteId]);
  return { note, dismiss };
};
