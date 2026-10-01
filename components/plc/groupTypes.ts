import type { TFunction } from 'i18next';
import type { PlcGroupType } from '@/types';

const GROUP_TYPE_DEFAULTS: Record<PlcGroupType, string> = {
  plc: 'PLC',
  department: 'Department',
  mentoring: 'Mentoring',
  building: 'Building',
};

/** Display name for a group type. */
export function groupTypeLabel(t: TFunction, type: PlcGroupType): string {
  return t(`plcGroups.type.${type}`, {
    defaultValue: GROUP_TYPE_DEFAULTS[type],
  });
}
