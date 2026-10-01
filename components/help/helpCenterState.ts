import type { WidgetType } from '@/types';

export type HelpTab = 'shortcuts' | 'guides';

export interface HelpOpenRequest {
  tab?: HelpTab;
  widgetType?: WidgetType;
  itemId?: string;
}

export const HELP_OPEN_EVENT = 'spart:open-help';

const HELP_ITEM_PATH = '/help/';

// Help resource doc ids are Firestore auto-ids.
export function parseHelpItemPath(pathname: string): string | null {
  if (!pathname.startsWith(HELP_ITEM_PATH)) return null;
  const id = pathname.slice(HELP_ITEM_PATH.length).split('/')[0];
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

// One /r/ code per resource so every copy of its link adds to the same click count.
export function helpShortLinkCode(itemId: string): string {
  return `help-${itemId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(
    0,
    32
  );
}

export function buildHelpItemUrl(itemId: string): string {
  return `${window.location.origin}${HELP_ITEM_PATH}${encodeURIComponent(itemId)}`;
}

// Session-only memory of the last tab; deliberately not persisted.
let lastTab: HelpTab | null = null;

export function getLastHelpTab(): HelpTab | null {
  return lastTab;
}

export function setLastHelpTab(tab: HelpTab): void {
  lastTab = tab;
}

export function requestOpenHelp(req: HelpOpenRequest = {}): void {
  window.dispatchEvent(
    new CustomEvent<HelpOpenRequest>(HELP_OPEN_EVENT, { detail: req })
  );
}
