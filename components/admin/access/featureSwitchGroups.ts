import type { GlobalFeature, GlobalFeaturePermission } from '@/types';
import {
  FEATURE_DEFAULTS,
  FEATURE_GROUP_LABELS,
  type FeatureGroup,
} from '@/config/featureDefaults';

/** Who a switch is on for, in a few words. */
export const audienceSummary = (
  permission: GlobalFeaturePermission
): string => {
  if (!permission.enabled) return 'Off';
  const buildings = permission.buildings?.length ?? 0;
  const where =
    buildings > 0
      ? ` in ${buildings} building${buildings === 1 ? '' : 's'}`
      : '';
  if (permission.accessLevel === 'admin') return `Admins${where}`;
  if (permission.accessLevel === 'beta') {
    const n = permission.betaUsers.length;
    return `Admins and ${n} tester${n === 1 ? '' : 's'}${where}`;
  }
  return buildings > 0
    ? `${buildings} building${buildings === 1 ? '' : 's'}`
    : 'Everyone';
};

export interface FeatureSwitchSection {
  group?: FeatureGroup;
  rows: { id: GlobalFeature; children: GlobalFeature[] }[];
}

/** Sort switches into their groups, add-ons under the feature they need. */
export const groupFeatureSwitches = (
  ids: readonly GlobalFeature[]
): FeatureSwitchSection[] => {
  const present = new Set(ids);
  const parentOf = (id: GlobalFeature) => {
    const parent = FEATURE_DEFAULTS[id].requires;
    return parent && present.has(parent) ? parent : undefined;
  };
  const order = Object.keys(FEATURE_GROUP_LABELS) as FeatureGroup[];
  const groups: (FeatureGroup | undefined)[] = [
    ...order.filter((g) => ids.some((id) => FEATURE_DEFAULTS[id].group === g)),
    ...(ids.some((id) => !FEATURE_DEFAULTS[id].group) ? [undefined] : []),
  ];
  return groups.map((group) => ({
    group,
    rows: ids
      .filter((id) => FEATURE_DEFAULTS[id].group === group && !parentOf(id))
      .map((id) => ({
        id,
        children: ids.filter((child) => parentOf(child) === id),
      })),
  }));
};
