import { useSyncExternalStore } from 'react';
import { isViewAsTab } from '@/utils/viewAsTab';
import {
  getViewAsDriveStatus,
  subscribeViewAsDrive,
  type ViewAsDriveStatus,
} from '@/utils/viewAsDrive';

/** Drive status in a View as tab; null everywhere else. */
export function useViewAsDriveStatus(): ViewAsDriveStatus | null {
  const status = useSyncExternalStore(
    subscribeViewAsDrive,
    getViewAsDriveStatus,
    getViewAsDriveStatus
  );
  return isViewAsTab ? status : null;
}
