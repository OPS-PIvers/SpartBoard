import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { GlobalFeature, WidgetType } from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { AuthContext } from '@/context/AuthContextValue';
import { useChangelog, type ChangelogWidgetNote } from '@/hooks/useChangelog';

const DISMISSED_KEY = 'widget-whats-new-dismissed';
const DISMISSED_EVENT = 'widget-whats-new-dismissed';
const FIRST_SEEN_KEY = 'widget-whats-new-first-seen';
const NOTE_LIFETIME_DAYS = 30;
const GATED_NOTE_MAX_AGE_DAYS = 180;
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

/** Per-browser first time each note was shown, so a gated note's 30 days start when the teacher gets the feature. */
const readFirstSeen = (): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(FIRST_SEEN_KEY) ?? '{}'
    );
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (e): e is [string, number] => typeof e[1] === 'number'
      )
    );
  } catch {
    return {};
  }
};

const markFirstSeen = (id: string, at: number): void => {
  const seen = readFirstSeen();
  if (seen[id] !== undefined) return;
  try {
    localStorage.setItem(FIRST_SEEN_KEY, JSON.stringify({ ...seen, [id]: at }));
  } catch {
    // Storage blocked: the 30 days restart on the next reload.
  }
};

const dayStart = (date: string): number =>
  new Date(`${date}T00:00:00`).getTime();

interface PickOptions {
  dismissed: readonly string[];
  firstSeen: Readonly<Record<string, number>>;
  now: number;
  /** Whether the teacher can use the note's feature; unknown (retired) flags count as open. */
  canUseFeature: (feature: string) => boolean;
}

/**
 * The newest undismissed, live note for a widget type. Ungated notes run 30 days from their date;
 * gated notes run 30 days from when this teacher first sees them, within 180 days of the date.
 */
export const pickWidgetNote = (
  notes: readonly ChangelogWidgetNote[],
  widgetType: WidgetType,
  { dismissed, firstSeen, now, canUseFeature }: PickOptions
): WidgetWhatsNewNote | null => {
  const live = notes
    .filter((n) => n.widget === widgetType && !dismissed.includes(n.id))
    .filter((n) => now >= dayStart(n.date))
    .filter((n) => !n.feature || canUseFeature(n.feature))
    .filter((n) => {
      if (!n.feature)
        return now - dayStart(n.date) <= NOTE_LIFETIME_DAYS * DAY_MS;
      if (now - dayStart(n.date) > GATED_NOTE_MAX_AGE_DAYS * DAY_MS)
        return false;
      return now - (firstSeen[n.id] ?? now) <= NOTE_LIFETIME_DAYS * DAY_MS;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const note = live[0];
  return note
    ? { id: note.id, text: note.text, tourSetId: note.tourSetId }
    : null;
};

const isKnownFeature = (feature: string): feature is GlobalFeature =>
  Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, feature);

/** This widget type's current what's-new note, and a dismiss that hides it on every board. */
export const useWidgetWhatsNew = (widgetType: WidgetType) => {
  const { widgetNotes } = useChangelog();
  const canAccessFeature = useContext(AuthContext)?.canAccessFeature;
  const [now] = useState(() => Date.now());
  const [firstSeen] = useState(readFirstSeen);
  const dismissedRaw = useSyncExternalStore(
    subscribe,
    readDismissed,
    () => '[]'
  );
  const note = pickWidgetNote(widgetNotes, widgetType, {
    dismissed: parseDismissed(dismissedRaw),
    firstSeen,
    now,
    canUseFeature: (feature) =>
      !isKnownFeature(feature) || canAccessFeature?.(feature) === true,
  });
  const noteId = note?.id;
  useEffect(() => {
    if (noteId) markFirstSeen(noteId, now);
  }, [noteId, now]);
  const dismiss = useCallback(() => {
    if (noteId) dismissWidgetWhatsNew(noteId);
  }, [noteId]);
  return { note, dismiss };
};
