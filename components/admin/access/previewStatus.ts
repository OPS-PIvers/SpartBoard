import type { GlobalFeaturePermission } from '@/types';

/** Who a preview is live for, given its access doc and district switch. */
export const previewStatus = (
  permission: GlobalFeaturePermission,
  districtOn: boolean | null | undefined
): string => {
  if (districtOn === false || !permission.enabled) return 'Off everywhere';
  const where =
    permission.buildings && permission.buildings.length > 0
      ? ` in ${permission.buildings.length} building${permission.buildings.length === 1 ? '' : 's'}`
      : '';
  switch (permission.accessLevel) {
    case 'admin':
      return 'Live for: admins';
    case 'beta': {
      const n = permission.betaUsers.length;
      return `Live for: admins and ${n} tester${n === 1 ? '' : 's'}${where}`;
    }
    default:
      return `Live for: everyone${where}`;
  }
};

/** Public to everyone with nothing held back, so the flag can graduate (D14). */
export const isReadyToGraduate = (
  permission: GlobalFeaturePermission,
  isSaved: boolean,
  districtOn: boolean | null | undefined
): boolean =>
  isSaved &&
  districtOn !== false &&
  permission.enabled &&
  permission.accessLevel === 'public' &&
  !permission.minTier &&
  (permission.buildings?.length ?? 0) === 0;
