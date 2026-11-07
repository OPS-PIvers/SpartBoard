/** Admin-curated `admin_settings/getting_started`: the tours on the Getting Started page and the sidebar switch (docs/plans/GETTING_STARTED.md D17, D28). */

export const GETTING_STARTED_SETTINGS_DOC = 'getting_started';
export const GETTING_STARTED_PATH = '/getting-started';
export const GETTING_STARTED_SHORT_CODE = 'getting-started';
export const GETTING_STARTED_MAX_TOURS = 40;

export type GettingStartedTier = 'essentials' | 'next';

/** What checks a tour off: finishing it, or the real thing being done however it was done (D13). */
export type GettingStartedDoneWhen =
  'finished' | 'building' | 'drive' | 'classes';

export const GETTING_STARTED_DONE_WHEN: readonly GettingStartedDoneWhen[] = [
  'finished',
  'building',
  'drive',
  'classes',
];

export interface GettingStartedEntry {
  /** The Help Center item behind this tour, which also gives it a shareable link (D18). */
  itemId: string;
  tier: GettingStartedTier;
  doneWhen: GettingStartedDoneWhen;
}

export interface GettingStartedSettings {
  /** On by default; the page and welcome keep working when an admin hides the sidebar item. */
  showInSidebar: boolean;
  tours: GettingStartedEntry[];
}

export const DEFAULT_GETTING_STARTED_SETTINGS: GettingStartedSettings = {
  showInSidebar: true,
  tours: [],
};

const normalizeEntry = (raw: unknown): GettingStartedEntry | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { itemId, tier, doneWhen } = raw as Record<string, unknown>;
  if (typeof itemId !== 'string' || !itemId) return null;
  return {
    itemId,
    tier: tier === 'essentials' ? 'essentials' : 'next',
    doneWhen: GETTING_STARTED_DONE_WHEN.includes(
      doneWhen as GettingStartedDoneWhen
    )
      ? (doneWhen as GettingStartedDoneWhen)
      : 'finished',
  };
};

/** Fills a partial or malformed doc; bad entries and repeats drop out, and only an explicit false hides the sidebar item. */
export function normalizeGettingStartedSettings(
  raw: unknown
): GettingStartedSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_GETTING_STARTED_SETTINGS;
  const { showInSidebar, tours } = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const entries = (Array.isArray(tours) ? tours : [])
    .map(normalizeEntry)
    .filter((entry): entry is GettingStartedEntry => {
      if (!entry || seen.has(entry.itemId)) return false;
      seen.add(entry.itemId);
      return true;
    })
    .slice(0, GETTING_STARTED_MAX_TOURS);
  return { showInSidebar: showInSidebar !== false, tours: entries };
}

/** The sidebar switch alone, in the shape the Previews tab expects. */
export const normalizeGettingStartedSidebarSwitch = (
  raw: unknown
): { enabled: boolean } => ({
  enabled: normalizeGettingStartedSettings(raw).showInSidebar,
});

export const isGettingStartedRoute = (pathname: string): boolean =>
  pathname === GETTING_STARTED_PATH ||
  pathname.startsWith(`${GETTING_STARTED_PATH}/`);

/** Moves a tour one place up or down among the tours of its own tier. */
export function moveGettingStartedEntry(
  tours: readonly GettingStartedEntry[],
  itemId: string,
  direction: -1 | 1
): GettingStartedEntry[] {
  const next = [...tours];
  const from = next.findIndex((entry) => entry.itemId === itemId);
  if (from < 0) return next;
  let to = from + direction;
  while (next[to] && next[to].tier !== next[from].tier) to += direction;
  if (!next[to]) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
