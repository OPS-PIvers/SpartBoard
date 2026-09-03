import type { WidgetData } from '@/types';

/**
 * Field groups shared by both widget merge paths: the live `onSnapshot` merge
 * in DashboardContext and the save-transaction merge in dashboardSaveMerge.
 * They live here so a new WidgetData field can only be tracked by both or
 * neither — a field listed on one side alone would silently never accept a
 * remote edit through the other.
 */

/** Position, size and stacking. */
export const LAYOUT_FIELDS = [
  'xProp',
  'yProp',
  'wProp',
  'hProp',
  'aspectRatio',
  'z',
  'minimized',
  'flipped',
  'maximized',
  'groupId',
] as const;

/** Appearance and per-instance chrome. `annotation` is deep-compared separately. */
export const STYLE_FIELDS = [
  'backgroundColor',
  'fontFamily',
  'baseTextSize',
  'transparency',
  'buildingId',
  'customTitle',
  'isPinned',
  'isLocked',
] as const;

/** Subset of STYLE_FIELDS the snapshot merge applies on its own. */
export const INSTANCE_FIELDS = ['customTitle', 'isPinned'] as const;

export type MergeFieldKey =
  | (typeof LAYOUT_FIELDS)[number]
  | (typeof STYLE_FIELDS)[number];

/** True when any of `fields` differs between the two widgets. */
export const anyFieldChanged = (
  a: WidgetData,
  b: WidgetData,
  fields: readonly MergeFieldKey[]
): boolean => fields.some((f) => a[f] !== b[f]);
