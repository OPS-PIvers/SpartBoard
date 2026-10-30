import { useSyncExternalStore } from 'react';
import type { WidgetType } from '@/types';
import type { ImportInboxItem, ImportTarget } from '@/utils/import/contract';

/** What the teacher gave Import, as live browser objects (a File is not serializable). */
export interface PendingSource {
  file?: File;
  url?: string;
  text?: string;
  title?: string;
  /** Where it came from, saved on the Library item (D7). */
  sourceUrl?: string;
  platform?: string;
  /** The page the extension sent, when this came from the inbox. */
  inboxItem?: ImportInboxItem;
}

/** A Source waiting for a widget to open its own review screen with it. */
export interface ImportHandoff {
  /** Unique per offer, so a widget remounts its review for a new Source. */
  id: string;
  widgetId: string;
  widgetType: WidgetType;
  target: ImportTarget;
  source: PendingSource;
  /** Runs once the widget saves the Library item. */
  onSaved?: () => void;
}

/** Board-space point an Import started from a drop lands at. */
export interface ImportDropPoint {
  x: number;
  y: number;
}

/** A request to show the Import screen. */
export interface ImportScreenRequest {
  source?: PendingSource;
  /** Preselects this target, e.g. from a widget's own Import button. */
  presetTarget?: ImportTarget;
  /** The widget whose Import button opened this; its review screen is reused. */
  fromWidgetId?: string;
  dropPoint?: ImportDropPoint;
}

type Listener = () => void;

let handoffs: readonly ImportHandoff[] = [];
let screen: (ImportScreenRequest & { openId: number }) | null = null;
let openCount = 0;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const l of listeners) l();
};

const subscribe = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Opens the Import screen and drops any handoff still waiting. */
export function openImportScreen(request: ImportScreenRequest = {}): void {
  openCount += 1;
  // A Source no widget picked up never reopens later by surprise.
  handoffs = [];
  screen = { ...request, openId: openCount };
  emit();
}

export function closeImportScreen(): void {
  if (!screen) return;
  screen = null;
  emit();
}

export function useImportScreenRequest():
  (ImportScreenRequest & { openId: number }) | null {
  return useSyncExternalStore(subscribe, () => screen);
}

/** Queues a Source for a widget; the widget opens its review screen when it sees it. */
export function offerImportHandoff(offer: Omit<ImportHandoff, 'id'>): void {
  const handoff: ImportHandoff = { ...offer, id: crypto.randomUUID() };
  handoffs = [
    ...handoffs.filter((h) => h.widgetId !== handoff.widgetId),
    handoff,
  ];
  emit();
}

/** Removes and returns the widget's pending Source, if any. */
export function takeImportHandoff(widgetId: string): ImportHandoff | null {
  const found = handoffs.find((h) => h.widgetId === widgetId) ?? null;
  if (!found) return null;
  handoffs = handoffs.filter((h) => h !== found);
  emit();
  return found;
}

/** The widget saved what the handoff brought; clears it and runs its onSaved. */
export function completeImportHandoff(widgetId: string): void {
  takeImportHandoff(widgetId)?.onSaved?.();
}

export function useImportHandoff(widgetId: string): ImportHandoff | null {
  return useSyncExternalStore(
    subscribe,
    () => handoffs.find((h) => h.widgetId === widgetId) ?? null
  );
}

/** Test-only reset. */
export function resetImportHandoffsForTest(): void {
  handoffs = [];
  screen = null;
  emit();
}
