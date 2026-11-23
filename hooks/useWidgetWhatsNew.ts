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

export const dismissWidgetWhatsNew = (
  ids: string | readonly string[]
): void => {
  const add = typeof ids === 'string' ? [ids] : ids;
  const next = [...new Set([...parseDismissed(readDismissed()), ...add])];
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

const markFirstSeen = (ids: string | readonly string[], at: number): void => {
  const seen = readFirstSeen();
  const fresh = (typeof ids === 'string' ? [ids] : ids).filter(
    (id) => seen[id] === undefined
  );
  if (fresh.length === 0) return;
  const next = { ...seen };
  for (const id of fresh) next[id] = at;
  try {
    localStorage.setItem(FIRST_SEEN_KEY, JSON.stringify(next));
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
 * A widget type's undismissed, live notes, newest first. Ungated notes run 30 days from their date;
 * gated notes run 30 days from when this teacher first sees them, within 180 days of the date.
 */
export const liveWidgetNotes = (
  notes: readonly ChangelogWidgetNote[],
  widgetType: WidgetType | null,
  { dismissed, firstSeen, now, canUseFeature }: PickOptions
): ChangelogWidgetNote[] =>
  notes
    .filter(
      (n) =>
        (widgetType === null || n.widget === widgetType) &&
        !dismissed.includes(n.id)
    )
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

/** The newest live note for a widget type. */
export const pickWidgetNote = (
  notes: readonly ChangelogWidgetNote[],
  widgetType: WidgetType,
  options: PickOptions
): WidgetWhatsNewNote | null => {
  const note = liveWidgetNotes(notes, widgetType, options)[0];
  return note
    ? { id: note.id, text: note.text, tourSetId: note.tourSetId }
    : null;
};

const isKnownFeature = (feature: string): feature is GlobalFeature =>
  Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, feature);

/** Groups live notes by widget type, newest first; a note shared by several widgets is listed only under the first. */
export const groupWidgetNotes = (
  notes: readonly ChangelogWidgetNote[]
): { widget: WidgetType; notes: ChangelogWidgetNote[] }[] => {
  const groups = new Map<WidgetType, ChangelogWidgetNote[]>();
  const texts = new Set<string>();
  for (const n of notes) {
    if (texts.has(n.text)) continue;
    texts.add(n.text);
    groups.set(n.widget, [...(groups.get(n.widget) ?? []), n]);
  }
  return [...groups.entries()].map(([widget, list]) => ({
    widget,
    notes: list,
  }));
};

/** Every widget's live notes for the What's New list, whether this teacher has any unseen, and a way to mark them all seen. */
const NO_NOTES: readonly ChangelogWidgetNote[] = [];

export const useWidgetNotesList = () => {
  const widgetNotes = useChangelog().widgetNotes ?? NO_NOTES;
  const auth = useContext(AuthContext);
  const canAccessFeature = auth?.canAccessFeature;
  const canAccessWidget = auth?.canAccessWidget;
  const [now] = useState(() => Date.now());
  const [firstSeen] = useState(readFirstSeen);
  const dismissedRaw = useSyncExternalStore(
    subscribe,
    readDismissed,
    () => '[]'
  );
  const options = {
    firstSeen,
    now,
    canUseFeature: (feature: string) =>
      !isKnownFeature(feature) || canAccessFeature?.(feature) === true,
  };
  const all = liveWidgetNotes(
    widgetNotes.filter((n) => canAccessWidget?.(n.widget) === true),
    null,
    { ...options, dismissed: [] }
  );
  const dismissed = parseDismissed(dismissedRaw);
  const unseenIds = all
    .filter((n) => !dismissed.includes(n.id))
    .map((n) => n.id)
    .join('\n');
  const markSeen = () => {
    if (!unseenIds) return;
    const ids = unseenIds.split('\n');
    markFirstSeen(ids, now);
    dismissWidgetWhatsNew(ids);
  };
  return {
    groups: groupWidgetNotes(all),
    hasUnseen: unseenIds !== '',
    markSeen,
  };
};

export type WidgetNotesList = ReturnType<typeof useWidgetNotesList>;

/** This widget type's current what's-new note, and a dismiss that hides all its live notes on every board. */
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
  const live = liveWidgetNotes(widgetNotes, widgetType, {
    dismissed: parseDismissed(dismissedRaw),
    firstSeen,
    now,
    canUseFeature: (feature) =>
      !isKnownFeature(feature) || canAccessFeature?.(feature) === true,
  });
  const top = live[0];
  const note: WidgetWhatsNewNote | null = top
    ? { id: top.id, text: top.text, tourSetId: top.tourSetId }
    : null;
  const noteId = note?.id;
  const liveIds = live.map((n) => n.id).join('\n');
  useEffect(() => {
    if (noteId) markFirstSeen(noteId, now);
  }, [noteId, now]);
  const dismiss = useCallback(() => {
    if (liveIds) dismissWidgetWhatsNew(liveIds.split('\n'));
  }, [liveIds]);
  return { note, dismiss };
};
