import type { LibraryFolderPanelSetting } from './types';
import type { FolderPanelMode } from './LibraryFolderPanelContext';

// Widget widths (px) below which the folder panel shrinks to an icon rail, then hides.
export const RAIL_BELOW_PX = 680;
export const HIDE_BELOW_PX = 440;

export const autoFolderPanelMode = (
  widthPx: number | null
): FolderPanelMode => {
  if (widthPx == null) return 'full';
  if (widthPx < HIDE_BELOW_PX) return 'hidden';
  if (widthPx < RAIL_BELOW_PX) return 'rail';
  return 'full';
};

/** A toggled setting holds until the widget is resized across a breakpoint; then auto takes over. */
export const resolveFolderPanelMode = (
  setting: LibraryFolderPanelSetting,
  widthPx: number | null,
  settingStillApplies: boolean
): FolderPanelMode =>
  setting !== 'auto' && settingStillApplies
    ? setting
    : autoFolderPanelMode(widthPx);

// Estimates fitted to the header's rendered widths at full size (13-14px bold Lexend).
const CHAR_PX = 8;
const tabWidth = (label: string, count: number | undefined): number => {
  const badge = count != null && count > 0 ? String(count).length : 0;
  return 56 + CHAR_PX * (label.length + badge);
};
const actionWidth = (label: string): number => 52 + CHAR_PX * label.length;
const ICON_ACTION_PX = 40;
// Bar padding, the tabs/actions gap, the tab pill's padding, plus slack.
const BAR_CHROME_PX = 70;

export interface HeaderLabelState {
  actionLabelsHidden: boolean;
  tabLabelsHidden: boolean;
}

/** Action labels drop first, then tab labels, so neither group runs into the other. */
export const resolveHeaderLabels = (
  widthPx: number | null,
  tabs: { label: string; count?: number }[],
  actionLabels: string[]
): HeaderLabelState => {
  if (widthPx == null) {
    return { actionLabelsHidden: false, tabLabelsHidden: false };
  }
  const gaps =
    Math.max(0, tabs.length - 1) * 2 + Math.max(0, actionLabels.length - 1) * 8;
  const fixed = BAR_CHROME_PX + gaps;
  const labeledTabs = tabs.reduce(
    (sum, t) => sum + tabWidth(t.label, t.count),
    0
  );
  const labeledActions = actionLabels.reduce(
    (sum, l) => sum + actionWidth(l),
    0
  );
  const iconActions = actionLabels.length * ICON_ACTION_PX;
  if (widthPx >= fixed + labeledTabs + labeledActions) {
    return { actionLabelsHidden: false, tabLabelsHidden: false };
  }
  return {
    actionLabelsHidden: true,
    tabLabelsHidden: widthPx < fixed + labeledTabs + iconActions,
  };
};
