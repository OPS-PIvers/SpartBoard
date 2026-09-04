import type { WidgetType } from '@/types';

export type HelpTab = 'shortcuts' | 'guides';

export interface HelpOpenRequest {
  tab?: HelpTab;
  widgetType?: WidgetType;
}

export const HELP_OPEN_EVENT = 'spart:open-help';

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
